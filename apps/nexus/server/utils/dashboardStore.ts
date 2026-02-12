import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { AppRelease, ReleaseNotes } from './releasesStore'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'

const UPDATES_KEY = 'dashboard:updates'
const UPDATES_TABLE = 'dashboard_updates'
const UPDATES_SETTINGS_KEY = 'dashboard:updates_settings'
const UPDATES_SETTINGS_TABLE = 'dashboard_update_settings'
const UPDATES_SETTINGS_ID = 'global'

let schemaInitialized = false
let hasLoggedDashboardDb = false
let hasLoggedDashboardFallback = false

async function ensureUpdateColumn(db: D1Database, name: string, ddl: string) {
  const { results } = await db.prepare(`PRAGMA table_info(${UPDATES_TABLE});`).all<{ name: string }>()
  const exists = (results ?? []).some(row => row.name === name)
  if (!exists) {
    await db.prepare(`ALTER TABLE ${UPDATES_TABLE} ADD COLUMN ${ddl};`).run()
  }
}

interface D1UpdateRow {
  id: string
  type: string | null
  release_tag: string | null
  title: string
  timestamp: string
  summary: string
  tags: string | null
  link: string
  created_at: string
  updated_at: string
}

function getD1Database(event?: H3Event | null): D1Database | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  const db = bindings?.DB ?? null

  if (db) {
    if (!hasLoggedDashboardDb) {
      console.info('[dashboardStore] 已连接到 D1 绑定，所有仪表盘数据将写入数据库。')
      hasLoggedDashboardDb = true
    }
  }
  else if (!hasLoggedDashboardFallback) {
    console.warn('[dashboardStore] 未检测到 D1 绑定，仪表盘逻辑将退回内存存储。')
    hasLoggedDashboardFallback = true
  }

  return db
}

async function ensureDashboardSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${UPDATES_TABLE} (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'news',
      release_tag TEXT,
      title TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      summary TEXT NOT NULL,
      tags TEXT NOT NULL,
      link TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await ensureUpdateColumn(db, 'type', "type TEXT NOT NULL DEFAULT 'news'")
  await ensureUpdateColumn(db, 'release_tag', 'release_tag TEXT')

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_dashboard_updates_release_tag ON ${UPDATES_TABLE}(release_tag);`).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${UPDATES_SETTINGS_TABLE} (
      id TEXT PRIMARY KEY,
      sync_base_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  schemaInitialized = true
}

export type UpdateType = 'news' | 'release'

export interface LocalizedText {
  zh: string
  en: string
}

function parseJsonArray(value: string | null): string[] {
  if (!value)
    return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
  }
  catch {
    return []
  }
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value)
    return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  }
  catch {
    return null
  }
}

function normalizeLocalizedText(input: unknown): LocalizedText {
  if (typeof input === 'string') {
    return { zh: input, en: input }
  }

  if (input && typeof input === 'object') {
    const zh = typeof (input as any).zh === 'string' ? (input as any).zh : ''
    const en = typeof (input as any).en === 'string' ? (input as any).en : ''
    const resolved = { zh: zh || en, en: en || zh }
    if (resolved.zh || resolved.en) {
      return resolved
    }
  }

  return { zh: '', en: '' }
}

function parseLocalizedText(value: string | null): LocalizedText {
  if (!value)
    return { zh: '', en: '' }

  const parsed = parseJsonObject<LocalizedText>(value)
  if (parsed)
    return normalizeLocalizedText(parsed)

  return normalizeLocalizedText(value)
}

function serializeLocalizedText(input: LocalizedText | string): string {
  const normalized = normalizeLocalizedText(input)
  if (normalized.zh === normalized.en)
    return normalized.zh
  return JSON.stringify(normalized)
}

function mapUpdateRow(row: D1UpdateRow): DashboardUpdate {
  return {
    id: row.id,
    type: row.type === 'release' ? 'release' : 'news',
    releaseTag: row.release_tag ?? null,
    title: parseLocalizedText(row.title),
    timestamp: row.timestamp,
    summary: parseLocalizedText(row.summary),
    tags: parseJsonArray(row.tags),
    link: row.link,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface DashboardUpdate {
  id: string
  type: UpdateType
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
  createdAt: string
  updatedAt: string
}

export interface UpdateInput {
  type: UpdateType
  releaseTag: string | null
  title: LocalizedText | string
  timestamp: string
  summary: LocalizedText | string
  tags: string[]
  link: string
}

function validIsoDate(value: string) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

async function readCollection<T>(key: string): Promise<T[]> {
  const storage = useStorage()
  const items = await storage.getItem<T[]>(key)
  return items ?? []
}

async function writeCollection<T>(key: string, items: T[]) {
  const storage = useStorage()
  await storage.setItem(key, items)
}

function sanitizeBadges(badges: string[]): string[] {
  return badges
    .map(badge => badge.trim())
    .filter(badge => badge.length > 0)
}

function normalizeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    throw createError({ statusCode: 400, statusMessage: 'Invalid date provided.' })
  return date.toISOString()
}

function normalizeUpdateInput(
  input: Partial<UpdateInput>,
  options: { forUpdate?: boolean, allowRelease?: boolean } = {},
): UpdateInput {
  const { forUpdate = false, allowRelease = false } = options
  const { title, timestamp, summary, tags, link, type, releaseTag } = input

  const resolvedType = typeof type === 'string' ? type : (forUpdate ? undefined : 'news')
  if (resolvedType && resolvedType !== 'news' && resolvedType !== 'release')
    throw createError({ statusCode: 400, statusMessage: 'Invalid update type.' })

  if (resolvedType === 'release' && !allowRelease)
    throw createError({ statusCode: 403, statusMessage: 'Release updates are managed automatically.' })

  const normalizedTitle = normalizeLocalizedText(title ?? '')
  if (!forUpdate || title !== undefined) {
    if (!normalizedTitle.zh && !normalizedTitle.en)
      throw createError({ statusCode: 400, statusMessage: 'Update title is required.' })
  }

  if (!forUpdate || timestamp !== undefined) {
    if (!timestamp || typeof timestamp !== 'string' || !validIsoDate(timestamp))
      throw createError({ statusCode: 400, statusMessage: 'Update timestamp must be an ISO date string.' })
  }

  const normalizedSummary = normalizeLocalizedText(summary ?? '')
  if (!forUpdate || summary !== undefined) {
    if (!normalizedSummary.zh && !normalizedSummary.en)
      throw createError({ statusCode: 400, statusMessage: 'Update summary is required.' })
  }

  if (!forUpdate || link !== undefined) {
    if (!link || typeof link !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Update link is required.' })
  }

  if (resolvedType === 'release' && (!releaseTag || typeof releaseTag !== 'string'))
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const normalizedTags = sanitizeBadges(Array.isArray(tags) ? tags : [])
  const normalizedReleaseTag = resolvedType === 'release' && typeof releaseTag === 'string'
    ? releaseTag
    : null

  return {
    type: (resolvedType ?? 'news') as UpdateType,
    releaseTag: normalizedReleaseTag,
    title: normalizedTitle,
    timestamp: timestamp ? normalizeDate(timestamp) : new Date().toISOString(),
    summary: normalizedSummary,
    tags: normalizedTags,
    link: link ?? '',
  }
}

function normalizeStoredUpdate(update: Partial<DashboardUpdate>): DashboardUpdate {
  return {
    id: String(update.id ?? ''),
    type: update.type === 'release' ? 'release' : 'news',
    releaseTag: typeof update.releaseTag === 'string' ? update.releaseTag : null,
    title: normalizeLocalizedText((update as any).title ?? ''),
    timestamp: typeof update.timestamp === 'string' ? update.timestamp : new Date().toISOString(),
    summary: normalizeLocalizedText((update as any).summary ?? ''),
    tags: Array.isArray(update.tags) ? update.tags.map(tag => String(tag)) : [],
    link: typeof update.link === 'string' ? update.link : '',
    createdAt: typeof update.createdAt === 'string' ? update.createdAt : new Date().toISOString(),
    updatedAt: typeof update.updatedAt === 'string' ? update.updatedAt : new Date().toISOString(),
  }
}

export async function listUpdates(event?: H3Event): Promise<DashboardUpdate[]> {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const { results } = await db.prepare(`
      SELECT
        id,
        type,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      FROM ${UPDATES_TABLE}
      ORDER BY datetime(timestamp) DESC;
    `).all<D1UpdateRow>()

    return (results ?? []).map(mapUpdateRow)
  }

  const updates = await readCollection<DashboardUpdate>(UPDATES_KEY)
  const normalized = updates.map(update => normalizeStoredUpdate(update))

  return normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export async function getUpdateById(event: H3Event | undefined, id: string) {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const row = await db.prepare(`
      SELECT
        id,
        type,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      FROM ${UPDATES_TABLE}
      WHERE id = ?1;
    `).bind(id).first<D1UpdateRow>()

    return row ? mapUpdateRow(row) : null
  }

  const updates = await readCollection<DashboardUpdate>(UPDATES_KEY)
  const match = updates.find(update => update.id === id)
  return match ? normalizeStoredUpdate(match) : null
}

export async function createUpdate(
  event: H3Event,
  rawInput: Partial<UpdateInput>,
  options: { allowRelease?: boolean } = {},
) {
  const input = normalizeUpdateInput(rawInput, { allowRelease: options.allowRelease })
  const now = new Date().toISOString()

  const update: DashboardUpdate = {
    id: randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }

  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    await db.prepare(`
      INSERT INTO ${UPDATES_TABLE} (
        id,
        type,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);
    `).bind(
      update.id,
      update.type,
      update.releaseTag,
      serializeLocalizedText(update.title),
      update.timestamp,
      serializeLocalizedText(update.summary),
      JSON.stringify(update.tags),
      update.link,
      update.createdAt,
      update.updatedAt,
    ).run()

    return update
  }

  const updates = await listUpdates()
  updates.unshift(update)
  await writeCollection(UPDATES_KEY, updates)
  return update
}

export async function updateUpdate(
  event: H3Event,
  id: string,
  rawInput: Partial<UpdateInput>,
  options: { allowRelease?: boolean } = {},
) {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const existing = await getUpdateById(event, id)

    if (!existing)
      throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

    if (existing.type === 'release' && !options.allowRelease)
      throw createError({ statusCode: 403, statusMessage: 'Release updates are managed automatically.' })

    const mergedInput: UpdateInput = normalizeUpdateInput(
      {
        ...existing,
        ...rawInput,
      },
      { forUpdate: true, allowRelease: options.allowRelease },
    )

    const updated: DashboardUpdate = {
      ...existing,
      ...mergedInput,
      updatedAt: new Date().toISOString(),
    }

    await db.prepare(`
      UPDATE ${UPDATES_TABLE}
      SET
        type = ?1,
        release_tag = ?2,
        title = ?3,
        timestamp = ?4,
        summary = ?5,
        tags = ?6,
        link = ?7,
        updated_at = ?8
      WHERE id = ?9;
    `).bind(
      updated.type,
      updated.releaseTag,
      serializeLocalizedText(updated.title),
      updated.timestamp,
      serializeLocalizedText(updated.summary),
      JSON.stringify(updated.tags),
      updated.link,
      updated.updatedAt,
      updated.id,
    ).run()

    return updated
  }

  const updates = await listUpdates()
  const index = updates.findIndex(update => update.id === id)

  if (index === -1)
    throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

  const existing = updates[index]
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

  if (existing.type === 'release' && !options.allowRelease)
    throw createError({ statusCode: 403, statusMessage: 'Release updates are managed automatically.' })

  const mergedInput = normalizeUpdateInput(
    {
      ...existing,
      ...rawInput,
    },
    { forUpdate: true, allowRelease: options.allowRelease },
  )

  const updated: DashboardUpdate = {
    ...existing,
    ...mergedInput,
    updatedAt: new Date().toISOString(),
  }

  updates[index] = updated
  await writeCollection(UPDATES_KEY, updates)
  return updated
}

export async function deleteUpdate(event: H3Event, id: string, options: { allowRelease?: boolean } = {}) {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const existing = await getUpdateById(event, id)
    if (existing?.type === 'release' && !options.allowRelease)
      throw createError({ statusCode: 403, statusMessage: 'Release updates are managed automatically.' })

    const result = await db.prepare(`
      DELETE FROM ${UPDATES_TABLE}
      WHERE id = ?1;
    `).bind(id).run()

    const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0

    if (changes === 0)
      throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

    return
  }

  const updates = await listUpdates()
  const existing = updates.find(update => update.id === id)
  if (existing?.type === 'release' && !options.allowRelease)
    throw createError({ statusCode: 403, statusMessage: 'Release updates are managed automatically.' })
  const nextUpdates = updates.filter(update => update.id !== id)

  if (nextUpdates.length === updates.length)
    throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

  await writeCollection(UPDATES_KEY, nextUpdates)
}

export interface DashboardUpdateSettings {
  syncBaseUrl: string | null
}

function normalizeSyncBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  if (!trimmed)
    return null
  if (!/^https?:\/\//i.test(trimmed)) {
    throw createError({ statusCode: 400, statusMessage: 'Sync base URL must start with http(s)://' })
  }
  return trimmed.replace(/\/+$/, '')
}

export async function getUpdateSettings(event?: H3Event): Promise<DashboardUpdateSettings> {
  const db = getD1Database(event)
  if (db) {
    await ensureDashboardSchema(db)
    const row = await db.prepare(`
      SELECT sync_base_url
      FROM ${UPDATES_SETTINGS_TABLE}
      WHERE id = ?1;
    `).bind(UPDATES_SETTINGS_ID).first<{ sync_base_url: string | null }>()

    return { syncBaseUrl: row?.sync_base_url ?? null }
  }

  const storage = useStorage()
  const stored = await storage.getItem<DashboardUpdateSettings>(UPDATES_SETTINGS_KEY)
  return { syncBaseUrl: stored?.syncBaseUrl ?? null }
}

export async function saveUpdateSettings(
  event: H3Event,
  input: { syncBaseUrl?: string | null },
): Promise<DashboardUpdateSettings> {
  const syncBaseUrl = normalizeSyncBaseUrl(input.syncBaseUrl)
  const db = getD1Database(event)
  const now = new Date().toISOString()

  if (db) {
    await ensureDashboardSchema(db)
    await db.prepare(`
      INSERT INTO ${UPDATES_SETTINGS_TABLE} (id, sync_base_url, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(id) DO UPDATE SET
        sync_base_url = excluded.sync_base_url,
        updated_at = excluded.updated_at;
    `).bind(
      UPDATES_SETTINGS_ID,
      syncBaseUrl,
      now,
      now,
    ).run()
  }
  else {
    const storage = useStorage()
    await storage.setItem(UPDATES_SETTINGS_KEY, { syncBaseUrl })
  }

  return { syncBaseUrl }
}

function stripHtml(source: string): string {
  return source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function truncateText(source: string, max = 160): string {
  if (source.length <= max)
    return source
  return `${source.slice(0, max).trim()}...`
}

function mapReleaseChannel(channel: AppRelease['channel']): string {
  if (channel === 'BETA')
    return 'beta'
  if (channel === 'SNAPSHOT')
    return 'snapshot'
  return 'release'
}

function buildReleaseSummary(notes: ReleaseNotes, notesHtml?: ReleaseNotes | null): LocalizedText {
  const source = notesHtml && (notesHtml.zh || notesHtml.en) ? notesHtml : notes
  const zh = truncateText(stripHtml(source.zh || source.en || ''))
  const en = truncateText(stripHtml(source.en || source.zh || ''))
  return normalizeLocalizedText({ zh, en })
}

export async function upsertReleaseUpdate(event: H3Event, release: AppRelease): Promise<DashboardUpdate> {
  const now = new Date().toISOString()
  const channelId = mapReleaseChannel(release.channel)
  const summary = buildReleaseSummary(release.notes, release.notesHtml ?? null)
  const input: UpdateInput = {
    type: 'release',
    releaseTag: release.tag,
    title: release.name || release.tag,
    timestamp: release.publishedAt ?? release.createdAt,
    summary,
    tags: [channelId],
    link: `/updates?channel=${channelId}#${release.tag}`,
  }
  const normalized = normalizeUpdateInput(input, { allowRelease: true })

  const db = getD1Database(event)
  if (db) {
    await ensureDashboardSchema(db)
    const existing = await db.prepare(`
      SELECT id, created_at
      FROM ${UPDATES_TABLE}
      WHERE release_tag = ?1
      LIMIT 1;
    `).bind(release.tag).first<{ id: string, created_at: string }>()

    if (existing) {
      const updated: DashboardUpdate = {
        id: existing.id,
        ...normalized,
        createdAt: existing.created_at,
        updatedAt: now,
      }

      await db.prepare(`
        UPDATE ${UPDATES_TABLE}
        SET
          type = ?1,
          release_tag = ?2,
          title = ?3,
          timestamp = ?4,
          summary = ?5,
          tags = ?6,
          link = ?7,
          updated_at = ?8
        WHERE id = ?9;
      `).bind(
        updated.type,
        updated.releaseTag,
        serializeLocalizedText(updated.title),
        updated.timestamp,
        serializeLocalizedText(updated.summary),
        JSON.stringify(updated.tags),
        updated.link,
        updated.updatedAt,
        updated.id,
      ).run()

      return updated
    }

    const created: DashboardUpdate = {
      id: randomUUID(),
      ...normalized,
      createdAt: now,
      updatedAt: now,
    }

    await db.prepare(`
      INSERT INTO ${UPDATES_TABLE} (
        id,
        type,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);
    `).bind(
      created.id,
      created.type,
      created.releaseTag,
      serializeLocalizedText(created.title),
      created.timestamp,
      serializeLocalizedText(created.summary),
      JSON.stringify(created.tags),
      created.link,
      created.createdAt,
      created.updatedAt,
    ).run()

    return created
  }

  const updates = await readCollection<DashboardUpdate>(UPDATES_KEY)
  const index = updates.findIndex(update => update.releaseTag === release.tag)
  const base = index >= 0 ? normalizeStoredUpdate(updates[index] ?? {}) : null
  const entry: DashboardUpdate = {
    id: base?.id ?? randomUUID(),
    ...normalized,
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  }

  if (index >= 0)
    updates[index] = entry
  else
    updates.unshift(entry)

  await writeCollection(UPDATES_KEY, updates)
  return entry
}
