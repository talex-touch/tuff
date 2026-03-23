import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { requirePilotDatabase } from './pilot-store'
import { toBoundedPositiveInt } from './quota-api'

const ENTITY_TABLE = 'pilot_entities'
const LEGACY_ENTITY_TABLE = 'pilot_compat_entities'
const MIGRATION_TABLE = 'pilot_entity_migrations'
const LEGACY_MIGRATION_KEY = 'compat_entities_to_entities_v1'
const QUERY_IGNORE_KEYS = new Set([
  '_t',
  'page',
  'pageSize',
  'itemsPerPage',
  'field',
  'order',
  'sort',
  'now',
  'time',
  'query',
  'keyword',
])

export interface PilotPageMeta {
  totalItems: number
  itemCount: number
  itemsPerPage: number
  totalPages: number
  currentPage: number
}

export interface PilotPageResult<T> {
  items: T[]
  meta: PilotPageMeta
}

interface EntityRow {
  domain: string
  id: string
  payload: string
  created_at: string
  updated_at: string
}

interface LegacyDomainCount {
  domain: string
  count: number | string
}

interface MigrationRow {
  id: string
  status: string
  details: string | null
  created_at: string
  updated_at: string
}

interface ListEntitiesOptions<T = Record<string, any>> {
  query?: Record<string, unknown>
  mapper?: (item: Record<string, any>) => T
  filter?: (item: Record<string, any>) => boolean
  sorter?: (a: T, b: T) => number
  defaultPage?: number
  defaultPageSize?: number
  maxPageSize?: number
}

interface UpsertEntityInput {
  domain: string
  id?: string
  payload: Record<string, any>
  merge?: boolean
}

let entitySchemaReady = false
let ensureSchemaTask: Promise<void> | null = null

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeRecordId(value: unknown): string {
  return normalizeText(value).replace(/\s+/g, '_')
}

function safeJsonParse(raw: string): Record<string, any> {
  const text = String(raw || '').trim()
  if (!text) {
    return {}
  }
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, any>
  }
  catch {
    return {}
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {})
  }
  catch {
    return '{}'
  }
}

function createEntityId(domain: string): string {
  const prefix = normalizeRecordId(domain).replaceAll('.', '_').slice(-12) || 'item'
  const randomPart = randomUUID().replaceAll('-', '').slice(0, 10)
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`
}

function toComparableText(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value.trim().toLowerCase()
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).toLowerCase()
  }
  return JSON.stringify(value).toLowerCase()
}

function matchesFilterValue(actual: unknown, expected: unknown): boolean {
  const expectedText = toComparableText(expected)
  if (!expectedText) {
    return true
  }

  if (Array.isArray(actual)) {
    const list = actual.map(item => toComparableText(item))
    return list.some(item => item.includes(expectedText))
  }

  const actualText = toComparableText(actual)
  if (!actualText) {
    return false
  }

  if (/^-?\d+(\.\d+)?$/.test(expectedText) && /^-?\d+(\.\d+)?$/.test(actualText)) {
    return Number(actualText) === Number(expectedText)
  }
  return actualText.includes(expectedText)
}

function buildPageMeta(totalItems: number, currentPage: number, itemsPerPage: number, itemCount: number): PilotPageMeta {
  const totalPages = totalItems <= 0 ? 0 : Math.ceil(totalItems / itemsPerPage)
  return {
    totalItems,
    itemCount,
    itemsPerPage,
    totalPages,
    currentPage,
  }
}

function mapEntityRow(row: EntityRow): Record<string, any> {
  const payload = safeJsonParse(row.payload)
  const id = normalizeRecordId(payload.id || row.id)
  return {
    ...payload,
    id,
    createdAt: payload.createdAt || row.created_at || nowIso(),
    updatedAt: payload.updatedAt || row.updated_at || nowIso(),
  }
}

function buildMigrationDetails(details: Record<string, unknown>): string {
  return safeJsonStringify(details)
}

function isSqliteMasterMissingOnPostgres(error: unknown): boolean {
  const code = String((error as any)?.code || '').trim()
  const message = String((error as any)?.message || '').toLowerCase()
  return code === '42P01' && message.includes('sqlite_master')
}

async function upsertMigrationMarker(
  event: H3Event,
  status: 'done' | 'failed',
  details: Record<string, unknown>,
): Promise<void> {
  const db = requirePilotDatabase(event)
  const now = nowIso()
  await db.prepare(`
    INSERT INTO ${MIGRATION_TABLE}
      (id, status, details, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      details = excluded.details,
      updated_at = excluded.updated_at
  `).bind(
    LEGACY_MIGRATION_KEY,
    status,
    buildMigrationDetails(details),
    now,
    now,
  ).run()
}

async function hasLegacyTable(event: H3Event): Promise<boolean> {
  const db = requirePilotDatabase(event)
  try {
    const row = await db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?1
      LIMIT 1
    `).bind(LEGACY_ENTITY_TABLE).first<{ name: string }>()
    return !!row?.name
  }
  catch (error) {
    if (!isSqliteMasterMissingOnPostgres(error)) {
      throw error
    }

    const row = await db.prepare(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = ?1
      LIMIT 1
    `).bind(LEGACY_ENTITY_TABLE).first<{ table_name: string }>()
    return !!row?.table_name
  }
}

async function getLegacyDomainCounts(event: H3Event): Promise<LegacyDomainCount[]> {
  const db = requirePilotDatabase(event)
  const { results } = await db.prepare(`
    SELECT domain, COUNT(1) as count
    FROM ${LEGACY_ENTITY_TABLE}
    GROUP BY domain
  `).all<LegacyDomainCount>()
  return results || []
}

async function migrateLegacyEntities(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  const migration = await db.prepare(`
    SELECT id, status, details, created_at, updated_at
    FROM ${MIGRATION_TABLE}
    WHERE id = ?1
    LIMIT 1
  `).bind(LEGACY_MIGRATION_KEY).first<MigrationRow>()

  if (migration?.status === 'done') {
    return
  }

  const legacyExists = await hasLegacyTable(event)
  if (!legacyExists) {
    await upsertMigrationMarker(event, 'done', {
      reason: 'legacy_table_missing',
      table: LEGACY_ENTITY_TABLE,
      finalizedAt: nowIso(),
    })
    return
  }

  try {
    await db.prepare(`
      INSERT INTO ${ENTITY_TABLE}
        (domain, id, payload, created_at, updated_at)
      SELECT domain, id, payload, created_at, updated_at
      FROM ${LEGACY_ENTITY_TABLE}
      ON CONFLICT(domain, id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `).run()

    const legacyDomainCounts = await getLegacyDomainCounts(event)
    for (const row of legacyDomainCounts) {
      const expected = Number(row.count || 0)
      const current = await db.prepare(`
        SELECT COUNT(1) as count
        FROM ${ENTITY_TABLE}
        WHERE domain = ?1
      `).bind(row.domain).first<{ count: number | string }>()

      if (Number(current?.count || 0) !== expected) {
        throw new Error(
          `Entity migration verification failed for domain=${row.domain}, expected=${expected}, actual=${Number(current?.count || 0)}`,
        )
      }
    }

    const backupTable = `${LEGACY_ENTITY_TABLE}_backup_${Date.now().toString(36)}`
    await db.prepare(`ALTER TABLE ${LEGACY_ENTITY_TABLE} RENAME TO ${backupTable}`).run()

    const totalLegacyRows = legacyDomainCounts.reduce((acc, item) => acc + Number(item.count || 0), 0)
    await upsertMigrationMarker(event, 'done', {
      from: LEGACY_ENTITY_TABLE,
      to: ENTITY_TABLE,
      backupTable,
      totalRows: totalLegacyRows,
      domains: legacyDomainCounts,
      finalizedAt: nowIso(),
    })
  }
  catch (error) {
    await upsertMigrationMarker(event, 'failed', {
      message: error instanceof Error ? error.message : String(error),
      occurredAt: nowIso(),
    })
    throw error
  }
}

export async function ensurePilotEntitySchema(event: H3Event): Promise<void> {
  if (entitySchemaReady) {
    return
  }

  if (!ensureSchemaTask) {
    ensureSchemaTask = (async () => {
      const db = requirePilotDatabase(event)
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS ${ENTITY_TABLE} (
          domain TEXT NOT NULL,
          id TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (domain, id)
        );
      `).run()
      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_pilot_entities_domain_updated
        ON ${ENTITY_TABLE}(domain, updated_at DESC);
      `).run()
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
          id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          details TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `).run()

      await migrateLegacyEntities(event)
      entitySchemaReady = true
    })().finally(() => {
      ensureSchemaTask = null
    })
  }

  await ensureSchemaTask
}

export async function listPilotEntities<T = Record<string, any>>(
  event: H3Event,
  domain: string,
  options: ListEntitiesOptions<T> = {},
): Promise<PilotPageResult<T>> {
  await ensurePilotEntitySchema(event)
  const db = requirePilotDatabase(event)
  const query = options.query || {}
  const page = toBoundedPositiveInt(query.page, options.defaultPage ?? 1, 1, 100000)
  const pageSize = toBoundedPositiveInt(
    query.pageSize ?? query.itemsPerPage,
    options.defaultPageSize ?? 20,
    1,
    options.maxPageSize ?? 200,
  )
  const keyword = normalizeText(query.keyword ?? query.query).toLowerCase()
  const filters = Object.entries(query)
    .filter(([key, value]) => !QUERY_IGNORE_KEYS.has(key) && value !== undefined && value !== null && `${value}` !== '')

  const { results } = await db.prepare(`
    SELECT domain, id, payload, created_at, updated_at
    FROM ${ENTITY_TABLE}
    WHERE domain = ?1
    ORDER BY updated_at DESC
  `).bind(domain).all<EntityRow>()

  const mapped = (results || []).map(mapEntityRow)
  const filtered = mapped.filter((item) => {
    if (keyword) {
      const source = JSON.stringify(item).toLowerCase()
      if (!source.includes(keyword)) {
        return false
      }
    }

    for (const [key, expected] of filters) {
      if (!(key in item)) {
        continue
      }
      if (!matchesFilterValue(item[key], expected)) {
        return false
      }
    }

    return options.filter ? options.filter(item) : true
  })

  const transformed = options.mapper
    ? filtered.map(item => options.mapper!(item))
    : (filtered as unknown as T[])
  const sorted = options.sorter ? [...transformed].sort(options.sorter) : transformed

  const totalItems = sorted.length
  const offset = (page - 1) * pageSize
  const items = sorted.slice(offset, offset + pageSize)
  return {
    items,
    meta: buildPageMeta(totalItems, page, pageSize, items.length),
  }
}

export async function listPilotEntitiesAll<T = Record<string, any>>(
  event: H3Event,
  domain: string,
  mapper?: (item: Record<string, any>) => T,
): Promise<T[]> {
  const page = await listPilotEntities<T>(event, domain, {
    query: {
      page: 1,
      pageSize: 10000,
    },
    mapper,
  })
  return page.items
}

export async function getPilotEntity(
  event: H3Event,
  domain: string,
  id: string | number,
): Promise<Record<string, any> | null> {
  await ensurePilotEntitySchema(event)
  const db = requirePilotDatabase(event)
  const normalizedId = normalizeRecordId(id)
  if (!normalizedId) {
    return null
  }
  const row = await db.prepare(`
    SELECT domain, id, payload, created_at, updated_at
    FROM ${ENTITY_TABLE}
    WHERE domain = ?1 AND id = ?2
    LIMIT 1
  `).bind(domain, normalizedId).first<EntityRow>()
  return row ? mapEntityRow(row) : null
}

export async function upsertPilotEntity(
  event: H3Event,
  input: UpsertEntityInput,
): Promise<Record<string, any>> {
  await ensurePilotEntitySchema(event)
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const id = normalizeRecordId(input.id || input.payload.id) || createEntityId(input.domain)
  const existing = await getPilotEntity(event, input.domain, id)
  const merged = input.merge === false
    ? {
        ...input.payload,
      }
    : {
        ...(existing || {}),
        ...input.payload,
      }

  const record = {
    ...merged,
    id,
    createdAt: merged.createdAt || existing?.createdAt || now,
    updatedAt: now,
  }

  await db.prepare(`
    INSERT INTO ${ENTITY_TABLE}
      (domain, id, payload, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(domain, id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).bind(
    input.domain,
    id,
    safeJsonStringify(record),
    String(record.createdAt || now),
    now,
  ).run()

  return record
}

export async function deletePilotEntity(
  event: H3Event,
  domain: string,
  id: string | number,
): Promise<boolean> {
  await ensurePilotEntitySchema(event)
  const db = requirePilotDatabase(event)
  const normalizedId = normalizeRecordId(id)
  if (!normalizedId) {
    return false
  }
  const result = await db.prepare(`
    DELETE FROM ${ENTITY_TABLE}
    WHERE domain = ?1 AND id = ?2
  `).bind(domain, normalizedId).run()
  return Number(result.meta?.changes || 0) > 0
}

export async function deletePilotEntities(
  event: H3Event,
  domain: string,
  ids: Array<string | number>,
): Promise<number> {
  if (!Array.isArray(ids) || ids.length <= 0) {
    return 0
  }
  await ensurePilotEntitySchema(event)
  const db = requirePilotDatabase(event)
  const normalized = ids.map(id => normalizeRecordId(id)).filter(Boolean)
  let deleted = 0
  for (const id of normalized) {
    const result = await db.prepare(`
      DELETE FROM ${ENTITY_TABLE}
      WHERE domain = ?1 AND id = ?2
    `).bind(domain, id).run()
    deleted += Number(result.meta?.changes || 0)
  }
  return deleted
}

export async function ensurePilotEntitySeed(
  event: H3Event,
  domain: string,
  seeds: Array<Record<string, any>>,
): Promise<void> {
  if (!Array.isArray(seeds) || seeds.length <= 0) {
    return
  }
  await ensurePilotEntitySchema(event)
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT COUNT(1) as count
    FROM ${ENTITY_TABLE}
    WHERE domain = ?1
  `).bind(domain).first<{ count: number | string }>()
  if (Number(row?.count || 0) > 0) {
    return
  }
  for (const seed of seeds) {
    await upsertPilotEntity(event, {
      domain,
      id: normalizeRecordId(seed.id),
      payload: seed,
      merge: false,
    })
  }
}
