import type { D1Database } from '@cloudflare/workers-types'
import type {
  PluginContentListQuery,
  PluginContentListResponse,
  PluginContentManifest,
  PluginContentPackage,
  PluginContentPublishInput,
  PluginContentStatus,
  PluginContentVisibility,
} from '@talex-touch/utils/types/cloud-share'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'

const PLUGIN_CONTENT_TABLE = 'store_plugin_content_packages'
const PLUGIN_CONTENT_KEY = 'store:pluginContentPackages'
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

const VISIBILITIES: PluginContentVisibility[] = ['private', 'unlisted', 'team', 'public']
const STATUSES: PluginContentStatus[] = ['draft', 'pending', 'published', 'rejected']

let contentSchemaInitialized = false

interface D1PluginContentRow {
  id: string
  plugin_id: string
  kind: string
  title: string
  summary: string | null
  schema_version: number
  visibility: PluginContentVisibility
  manifest_json: string
  content_ref: string | null
  content_inline_json: string | null
  created_by: string
  status: PluginContentStatus
  install_count: number
  created_at: string
  updated_at: string
  published_at: string | null
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value)
    return fallback
  try {
    return JSON.parse(value) as T
  }
  catch {
    return fallback
  }
}

function mapContentRow(row: D1PluginContentRow): PluginContentPackage {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    schemaVersion: Number(row.schema_version) || 1,
    visibility: row.visibility,
    manifest: parseJson<PluginContentManifest>(row.manifest_json, { importTarget: row.plugin_id, format: row.kind }),
    contentRef: row.content_ref,
    contentInline: parseJson<unknown>(row.content_inline_json, undefined),
    createdBy: row.created_by,
    status: row.status,
    installCount: Number(row.install_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  }
}

async function ensurePluginContentSchema(db: D1Database): Promise<void> {
  if (contentSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGIN_CONTENT_TABLE} (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      schema_version INTEGER NOT NULL,
      visibility TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      content_ref TEXT,
      content_inline_json TEXT,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL,
      install_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${PLUGIN_CONTENT_TABLE}_plugin_kind
    ON ${PLUGIN_CONTENT_TABLE}(plugin_id, kind);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${PLUGIN_CONTENT_TABLE}_visibility_status
    ON ${PLUGIN_CONTENT_TABLE}(visibility, status);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${PLUGIN_CONTENT_TABLE}_created_by
    ON ${PLUGIN_CONTENT_TABLE}(created_by);
  `).run()

  contentSchemaInitialized = true
}

async function readStoredContentPackages(): Promise<PluginContentPackage[]> {
  const storage = useStorage()
  const items = await storage.getItem<PluginContentPackage[] | null>(PLUGIN_CONTENT_KEY)
  return Array.isArray(items) ? items : []
}

async function writeStoredContentPackages(items: PluginContentPackage[]): Promise<void> {
  const storage = useStorage()
  await storage.setItem(PLUGIN_CONTENT_KEY, items)
}

function normalizeString(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max)
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)))
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed))
    return 0
  return Math.max(0, Math.floor(parsed))
}

function normalizeVisibility(value: unknown): PluginContentVisibility {
  return VISIBILITIES.includes(value as PluginContentVisibility)
    ? value as PluginContentVisibility
    : 'public'
}

function normalizeStatus(value: unknown): PluginContentStatus {
  return STATUSES.includes(value as PluginContentStatus)
    ? value as PluginContentStatus
    : 'published'
}

function normalizeManifest(value: unknown, pluginId: string, kind: string): PluginContentManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { importTarget: pluginId, format: kind }
  }

  const manifest = value as Partial<PluginContentManifest>
  return {
    ...manifest,
    importTarget: normalizeString(manifest.importTarget, 128) || pluginId,
    format: normalizeString(manifest.format, 128) || kind,
    minPluginVersion: manifest.minPluginVersion
      ? normalizeString(manifest.minPluginVersion, 64)
      : undefined,
  }
}

function assertPublishInput(input: PluginContentPublishInput): void {
  if (!normalizeString(input.pluginId, 128))
    throw createError({ statusCode: 400, statusMessage: 'pluginId is required.', data: { errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD' } })
  if (!normalizeString(input.kind, 96))
    throw createError({ statusCode: 400, statusMessage: 'kind is required.', data: { errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD' } })
  if (!normalizeString(input.title, 160))
    throw createError({ statusCode: 400, statusMessage: 'title is required.', data: { errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD' } })
  if (!Number.isFinite(Number(input.schemaVersion)) || Number(input.schemaVersion) <= 0)
    throw createError({ statusCode: 400, statusMessage: 'schemaVersion must be positive.', data: { errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD' } })
  if (!input.contentRef && typeof input.contentInline === 'undefined')
    throw createError({ statusCode: 400, statusMessage: 'contentRef or contentInline is required.', data: { errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD' } })
}

function createPackage(input: PluginContentPublishInput, userId: string): PluginContentPackage {
  assertPublishInput(input)
  const now = new Date().toISOString()
  const visibility = normalizeVisibility(input.visibility)
  const status = normalizeStatus(input.status)
  return {
    id: randomUUID(),
    pluginId: normalizeString(input.pluginId, 128),
    kind: normalizeString(input.kind, 96),
    title: normalizeString(input.title, 160),
    summary: normalizeString(input.summary, 500) || null,
    schemaVersion: Math.floor(Number(input.schemaVersion)),
    visibility,
    manifest: normalizeManifest(input.manifest, input.pluginId, input.kind),
    contentRef: normalizeString(input.contentRef, 500) || null,
    contentInline: input.contentInline,
    createdBy: userId,
    status,
    installCount: 0,
    createdAt: now,
    updatedAt: now,
    publishedAt: status === 'published' ? now : null,
  }
}

function canReadPackage(item: PluginContentPackage, viewerId?: string | null): boolean {
  if (item.status === 'published' && (item.visibility === 'public' || item.visibility === 'unlisted'))
    return true
  return Boolean(viewerId && item.createdBy === viewerId)
}

function filterPackages(items: PluginContentPackage[], query: PluginContentListQuery, viewerId?: string | null) {
  const visibility = query.visibility
  const status = query.status
  return items.filter((item) => {
    if (!canReadPackage(item, viewerId))
      return false
    if (query.pluginId && item.pluginId !== query.pluginId)
      return false
    if (query.kind && item.kind !== query.kind)
      return false
    if (visibility && item.visibility !== visibility)
      return false
    if (status && item.status !== status)
      return false
    if (!viewerId && item.status !== 'published')
      return false
    if (!viewerId && item.visibility !== 'public' && item.visibility !== 'unlisted')
      return false
    return true
  })
}

export async function createPluginContentPackage(
  event: H3Event,
  input: PluginContentPublishInput,
  userId: string,
): Promise<PluginContentPackage> {
  const item = createPackage(input, userId)
  const db = getD1Database(event)

  if (db) {
    await ensurePluginContentSchema(db)
    await db.prepare(`
      INSERT INTO ${PLUGIN_CONTENT_TABLE} (
        id,
        plugin_id,
        kind,
        title,
        summary,
        schema_version,
        visibility,
        manifest_json,
        content_ref,
        content_inline_json,
        created_by,
        status,
        install_count,
        created_at,
        updated_at,
        published_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16);
    `).bind(
      item.id,
      item.pluginId,
      item.kind,
      item.title,
      item.summary,
      item.schemaVersion,
      item.visibility,
      JSON.stringify(item.manifest),
      item.contentRef,
      typeof item.contentInline === 'undefined' ? null : JSON.stringify(item.contentInline),
      item.createdBy,
      item.status,
      item.installCount,
      item.createdAt,
      item.updatedAt,
      item.publishedAt,
    ).run()
    return item
  }

  const items = await readStoredContentPackages()
  items.unshift(item)
  await writeStoredContentPackages(items)
  return item
}

export async function listPluginContentPackages(
  event: H3Event,
  query: PluginContentListQuery = {},
  options: { viewerId?: string | null } = {},
): Promise<PluginContentListResponse> {
  const limit = normalizeLimit(query.limit)
  const offset = normalizeOffset(query.offset)
  const db = getD1Database(event)

  if (db) {
    await ensurePluginContentSchema(db)
    const clauses: string[] = []
    const args: unknown[] = []

    if (query.pluginId) {
      args.push(query.pluginId)
      clauses.push(`plugin_id = ?${args.length}`)
    }
    if (query.kind) {
      args.push(query.kind)
      clauses.push(`kind = ?${args.length}`)
    }
    if (query.visibility) {
      args.push(query.visibility)
      clauses.push(`visibility = ?${args.length}`)
    }
    if (query.status) {
      args.push(query.status)
      clauses.push(`status = ?${args.length}`)
    }

    if (options.viewerId) {
      args.push(options.viewerId)
      clauses.push(`((status = 'published' AND visibility IN ('public', 'unlisted')) OR created_by = ?${args.length})`)
    }
    else {
      clauses.push(`status = 'published'`)
      clauses.push(`visibility IN ('public', 'unlisted')`)
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const countRow = await db.prepare(`
      SELECT COUNT(*) as total
      FROM ${PLUGIN_CONTENT_TABLE}
      ${where};
    `).bind(...args).first<{ total: number }>()

    const rows = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_CONTENT_TABLE}
      ${where}
      ORDER BY published_at DESC, updated_at DESC
      LIMIT ?${args.length + 1}
      OFFSET ?${args.length + 2};
    `).bind(...args, limit, offset).all<D1PluginContentRow>()

    return {
      packages: (rows.results ?? []).map(mapContentRow),
      total: Number(countRow?.total ?? 0),
      limit,
      offset,
    }
  }

  const filtered = filterPackages(await readStoredContentPackages(), query, options.viewerId)
  return {
    packages: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  }
}

export async function getPluginContentPackage(
  event: H3Event,
  id: string,
  options: { viewerId?: string | null } = {},
): Promise<PluginContentPackage | null> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginContentSchema(db)
    const row = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_CONTENT_TABLE}
      WHERE id = ?1;
    `).bind(id).first<D1PluginContentRow>()
    if (!row)
      return null
    const item = mapContentRow(row)
    return canReadPackage(item, options.viewerId) ? item : null
  }

  const item = (await readStoredContentPackages()).find(item => item.id === id)
  if (!item)
    return null
  return canReadPackage(item, options.viewerId) ? item : null
}

export async function installPluginContentPackage(
  event: H3Event,
  id: string,
): Promise<PluginContentPackage | null> {
  const db = getD1Database(event)
  const now = new Date().toISOString()

  if (db) {
    await ensurePluginContentSchema(db)
    const existing = await getPluginContentPackage(event, id)
    if (!existing)
      return null
    await db.prepare(`
      UPDATE ${PLUGIN_CONTENT_TABLE}
      SET install_count = install_count + 1,
          updated_at = ?2
      WHERE id = ?1;
    `).bind(id, now).run()
    return getPluginContentPackage(event, id)
  }

  const items = await readStoredContentPackages()
  const index = items.findIndex(item => item.id === id)
  if (index < 0)
    return null
  const existing = items[index]
  if (!existing || !canReadPackage(existing))
    return null
  items[index] = {
    ...existing,
    installCount: existing.installCount + 1,
    updatedAt: now,
  }
  await writeStoredContentPackages(items)
  return items[index]
}
