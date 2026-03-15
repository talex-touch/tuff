import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { requirePilotDatabase } from './pilot-store'
import { toBoundedPositiveInt } from './quota-api'

const COMPAT_ENTITY_TABLE = 'pilot_compat_entities'
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

export interface PilotCompatPageMeta {
  totalItems: number
  itemCount: number
  itemsPerPage: number
  totalPages: number
  currentPage: number
}

export interface PilotCompatPageResult<T> {
  items: T[]
  meta: PilotCompatPageMeta
}

interface CompatEntityRow {
  domain: string
  id: string
  payload: string
  created_at: string
  updated_at: string
}

interface ListCompatEntitiesOptions<T = Record<string, any>> {
  query?: Record<string, unknown>
  mapper?: (item: Record<string, any>) => T
  filter?: (item: Record<string, any>) => boolean
  sorter?: (a: T, b: T) => number
  defaultPage?: number
  defaultPageSize?: number
  maxPageSize?: number
}

interface UpsertCompatEntityInput {
  domain: string
  id?: string
  payload: Record<string, any>
  merge?: boolean
}

let compatSchemaReady = false

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

function createCompatId(domain: string): string {
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

function buildPageMeta(totalItems: number, currentPage: number, itemsPerPage: number, itemCount: number): PilotCompatPageMeta {
  const totalPages = totalItems <= 0 ? 0 : Math.ceil(totalItems / itemsPerPage)
  return {
    totalItems,
    itemCount,
    itemsPerPage,
    totalPages,
    currentPage,
  }
}

function mapEntityRow(row: CompatEntityRow): Record<string, any> {
  const payload = safeJsonParse(row.payload)
  const id = normalizeRecordId(payload.id || row.id)
  return {
    ...payload,
    id,
    createdAt: payload.createdAt || row.created_at || nowIso(),
    updatedAt: payload.updatedAt || row.updated_at || nowIso(),
  }
}

export async function ensurePilotCompatSchema(event: H3Event): Promise<void> {
  if (compatSchemaReady) {
    return
  }
  const db = requirePilotDatabase(event)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${COMPAT_ENTITY_TABLE} (
      domain TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (domain, id)
    );
  `).run()
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_compat_entities_domain_updated
    ON ${COMPAT_ENTITY_TABLE}(domain, updated_at DESC);
  `).run()
  compatSchemaReady = true
}

export async function listPilotCompatEntities<T = Record<string, any>>(
  event: H3Event,
  domain: string,
  options: ListCompatEntitiesOptions<T> = {},
): Promise<PilotCompatPageResult<T>> {
  await ensurePilotCompatSchema(event)
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
    FROM ${COMPAT_ENTITY_TABLE}
    WHERE domain = ?1
    ORDER BY updated_at DESC
  `).bind(domain).all<CompatEntityRow>()

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

export async function listPilotCompatEntitiesAll<T = Record<string, any>>(
  event: H3Event,
  domain: string,
  mapper?: (item: Record<string, any>) => T,
): Promise<T[]> {
  const page = await listPilotCompatEntities<T>(event, domain, {
    query: {
      page: 1,
      pageSize: 10000,
    },
    mapper,
  })
  return page.items
}

export async function getPilotCompatEntity(
  event: H3Event,
  domain: string,
  id: string | number,
): Promise<Record<string, any> | null> {
  await ensurePilotCompatSchema(event)
  const db = requirePilotDatabase(event)
  const normalizedId = normalizeRecordId(id)
  if (!normalizedId) {
    return null
  }
  const row = await db.prepare(`
    SELECT domain, id, payload, created_at, updated_at
    FROM ${COMPAT_ENTITY_TABLE}
    WHERE domain = ?1 AND id = ?2
    LIMIT 1
  `).bind(domain, normalizedId).first<CompatEntityRow>()
  return row ? mapEntityRow(row) : null
}

export async function upsertPilotCompatEntity(
  event: H3Event,
  input: UpsertCompatEntityInput,
): Promise<Record<string, any>> {
  await ensurePilotCompatSchema(event)
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const id = normalizeRecordId(input.id || input.payload.id) || createCompatId(input.domain)
  const existing = await getPilotCompatEntity(event, input.domain, id)
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
    INSERT INTO ${COMPAT_ENTITY_TABLE}
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

export async function deletePilotCompatEntity(
  event: H3Event,
  domain: string,
  id: string | number,
): Promise<boolean> {
  await ensurePilotCompatSchema(event)
  const db = requirePilotDatabase(event)
  const normalizedId = normalizeRecordId(id)
  if (!normalizedId) {
    return false
  }
  const result = await db.prepare(`
    DELETE FROM ${COMPAT_ENTITY_TABLE}
    WHERE domain = ?1 AND id = ?2
  `).bind(domain, normalizedId).run()
  return Number(result.meta?.changes || 0) > 0
}

export async function deletePilotCompatEntities(
  event: H3Event,
  domain: string,
  ids: Array<string | number>,
): Promise<number> {
  if (!Array.isArray(ids) || ids.length <= 0) {
    return 0
  }
  await ensurePilotCompatSchema(event)
  const db = requirePilotDatabase(event)
  const normalized = ids.map(id => normalizeRecordId(id)).filter(Boolean)
  let deleted = 0
  for (const id of normalized) {
    const result = await db.prepare(`
      DELETE FROM ${COMPAT_ENTITY_TABLE}
      WHERE domain = ?1 AND id = ?2
    `).bind(domain, id).run()
    deleted += Number(result.meta?.changes || 0)
  }
  return deleted
}

export async function ensurePilotCompatSeed(
  event: H3Event,
  domain: string,
  seeds: Array<Record<string, any>>,
): Promise<void> {
  if (!Array.isArray(seeds) || seeds.length <= 0) {
    return
  }
  await ensurePilotCompatSchema(event)
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT COUNT(1) as count
    FROM ${COMPAT_ENTITY_TABLE}
    WHERE domain = ?1
  `).bind(domain).first<{ count: number | string }>()
  if (Number(row?.count || 0) > 0) {
    return
  }
  for (const seed of seeds) {
    await upsertPilotCompatEntity(event, {
      domain,
      id: normalizeRecordId(seed.id),
      payload: seed,
      merge: false,
    })
  }
}
