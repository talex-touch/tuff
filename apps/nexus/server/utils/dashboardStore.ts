import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { AppRelease, ReleaseNotes } from './releasesStore'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'
import { buildReleaseNotesPath } from './releaseNotesPath'
import { saveUpdateAsset } from './updateAssetStorage'

const UPDATES_KEY = 'dashboard:updates'
const UPDATES_TABLE = 'dashboard_updates'
const UPDATES_SETTINGS_KEY = 'dashboard:updates_settings'
const UPDATES_SETTINGS_TABLE = 'dashboard_update_settings'
const UPDATES_SETTINGS_ID = 'global'
const DEFAULT_PAYLOAD_CONTENT_TYPE = 'application/json'

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
  scope: string | null
  channels: string | null
  release_tag: string | null
  title: string
  timestamp: string
  summary: string
  tags: string | null
  link: string
  payload_key: string | null
  payload_sha256: string | null
  payload_content_type: string | null
  payload_version: string | null
  payload_size: number | null
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
      scope TEXT NOT NULL DEFAULT 'web',
      channels TEXT NOT NULL DEFAULT '[]',
      release_tag TEXT,
      title TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      summary TEXT NOT NULL,
      tags TEXT NOT NULL,
      link TEXT NOT NULL,
      payload_key TEXT,
      payload_sha256 TEXT,
      payload_content_type TEXT,
      payload_version TEXT,
      payload_size INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await ensureUpdateColumn(db, 'type', "type TEXT NOT NULL DEFAULT 'news'")
  await ensureUpdateColumn(db, 'scope', "scope TEXT NOT NULL DEFAULT 'web'")
  await ensureUpdateColumn(db, 'channels', "channels TEXT NOT NULL DEFAULT '[]'")
  await ensureUpdateColumn(db, 'release_tag', 'release_tag TEXT')
  await ensureUpdateColumn(db, 'payload_key', 'payload_key TEXT')
  await ensureUpdateColumn(db, 'payload_sha256', 'payload_sha256 TEXT')
  await ensureUpdateColumn(db, 'payload_content_type', 'payload_content_type TEXT')
  await ensureUpdateColumn(db, 'payload_version', 'payload_version TEXT')
  await ensureUpdateColumn(db, 'payload_size', 'payload_size INTEGER')

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

export type UpdateScope = 'web' | 'system' | 'both'
export type UpdateType = 'news' | 'release' | 'announcement' | 'config' | 'data'

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

function normalizeScope(value: unknown, fallback: UpdateScope): UpdateScope {
  if (value === 'system' || value === 'both' || value === 'web')
    return value
  return fallback
}

function normalizeUpdateType(value: unknown, fallback: UpdateType): UpdateType {
  if (typeof value !== 'string')
    return fallback
  const normalized = value.trim().toLowerCase()
  if (
    normalized === 'news'
    || normalized === 'release'
    || normalized === 'announcement'
    || normalized === 'config'
    || normalized === 'data'
  ) {
    return normalized as UpdateType
  }
  return fallback
}

function normalizeChannels(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const normalized = raw
    .map(entry => String(entry).trim().toUpperCase())
    .filter(Boolean)
    .filter(entry => entry === 'RELEASE' || entry === 'BETA' || entry === 'SNAPSHOT')
  return Array.from(new Set(normalized))
}

function normalizePayloadVersion(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  if (!trimmed)
    return null
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '-')
}

function resolvePayloadString(payload: unknown): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (!trimmed)
      throw createError({ statusCode: 400, statusMessage: 'Update payload is empty.' })
    try {
      JSON.parse(trimmed)
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Update payload must be valid JSON.' })
    }
    return trimmed
  }

  try {
    const serialized = JSON.stringify(payload)
    if (!serialized)
      throw new Error('empty')
    return serialized
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Update payload must be valid JSON.' })
  }
}

async function buildPayloadMeta(
  event: H3Event,
  updateId: string,
  payload: unknown,
  payloadVersion?: string | null,
) {
  const resolvedVersion = normalizePayloadVersion(payloadVersion) ?? String(Date.now())
  const payloadText = resolvePayloadString(payload)
  const data = Buffer.from(payloadText)
  const payloadKey = `updates/${updateId}/${resolvedVersion}.json`
  const payloadSha256 = createHash('sha256').update(data).digest('hex')

  await saveUpdateAsset(event, payloadKey, data, DEFAULT_PAYLOAD_CONTENT_TYPE)

  return {
    payloadKey,
    payloadSha256,
    payloadContentType: DEFAULT_PAYLOAD_CONTENT_TYPE,
    payloadVersion: resolvedVersion,
    payloadSize: data.byteLength,
    payloadUrl: `/api/updates/${updateId}/payload`,
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
    type: normalizeUpdateType(row.type, 'news'),
    scope: normalizeScope(row.scope, 'web'),
    channels: parseJsonArray(row.channels),
    releaseTag: row.release_tag ?? null,
    title: parseLocalizedText(row.title),
    timestamp: row.timestamp,
    summary: parseLocalizedText(row.summary),
    tags: parseJsonArray(row.tags),
    link: row.link,
    payloadKey: row.payload_key ?? null,
    payloadSha256: row.payload_sha256 ?? null,
    payloadContentType: row.payload_content_type ?? null,
    payloadVersion: row.payload_version ?? null,
    payloadSize: row.payload_size ?? null,
    payloadUrl: row.payload_key ? `/api/updates/${row.id}/payload` : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface DashboardUpdate {
  id: string
  type: UpdateType
  scope: UpdateScope
  channels: string[]
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
  payloadKey?: string | null
  payloadSha256?: string | null
  payloadContentType?: string | null
  payloadVersion?: string | null
  payloadSize?: number | null
  payloadUrl?: string | null
  createdAt: string
  updatedAt: string
}

export interface ListUpdatesOptions {
  scope?: UpdateScope
  type?: UpdateType
  channel?: string
}

export interface UpdateInput {
  type: UpdateType
  scope?: UpdateScope
  channels?: string[]
  releaseTag: string | null
  title: LocalizedText | string
  timestamp: string
  summary: LocalizedText | string
  tags: string[]
  link: string
  payload?: unknown
  payloadVersion?: string | null
}

export interface NormalizedUpdateInput {
  type: UpdateType
  scope: UpdateScope
  channels: string[]
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
}

const OFFICIAL_PERFORMANCE_UPDATE_ID = 'official-core-app-performance-2026-03'
const OFFICIAL_PERFORMANCE_UPDATE_TIMESTAMP = '2026-03-04T06:00:00.000Z'
const OFFICIAL_PERFORMANCE_DOC_LINK = '/docs/dev/release/performance-persistence'

const OFFICIAL_UPDATES: DashboardUpdate[] = [
  {
    id: OFFICIAL_PERFORMANCE_UPDATE_ID,
    type: 'announcement',
    scope: 'both',
    channels: ['RELEASE', 'BETA', 'SNAPSHOT'],
    releaseTag: null,
    title: {
      zh: '核心性能落地：数据库写压与统计采样治理',
      en: 'Core performance rollout: DB write pressure & stats sampling control',
    },
    timestamp: OFFICIAL_PERFORMANCE_UPDATE_TIMESTAMP,
    summary: {
      zh: '已上线写队列治理、OCR 高频写入降噪、stats/analytics 分层聚合与低频落盘策略，显著降低 SQLite 锁竞争与写放大。',
      en: 'Shipped write-queue control, OCR write-noise reduction, and tiered stats/analytics persistence to reduce SQLite lock contention and write amplification.',
    },
    tags: ['performance', 'sqlite', 'analytics', 'ocr'],
    link: OFFICIAL_PERFORMANCE_DOC_LINK,
    payloadKey: null,
    payloadSha256: null,
    payloadContentType: null,
    payloadVersion: null,
    payloadSize: null,
    payloadUrl: null,
    createdAt: OFFICIAL_PERFORMANCE_UPDATE_TIMESTAMP,
    updatedAt: OFFICIAL_PERFORMANCE_UPDATE_TIMESTAMP,
  },
]

function normalizeStringArray(values: string[]) {
  return [...values].map(value => value.trim()).filter(Boolean).sort()
}

function isSameLocalizedText(a: LocalizedText, b: LocalizedText) {
  return a.zh === b.zh && a.en === b.en
}

function isSameUpdateContent(a: DashboardUpdate, b: DashboardUpdate) {
  return (
    a.type === b.type
    && a.scope === b.scope
    && a.releaseTag === b.releaseTag
    && a.timestamp === b.timestamp
    && a.link === b.link
    && isSameLocalizedText(a.title, b.title)
    && isSameLocalizedText(a.summary, b.summary)
    && normalizeStringArray(a.channels).join('|') === normalizeStringArray(b.channels).join('|')
    && normalizeStringArray(a.tags).join('|') === normalizeStringArray(b.tags).join('|')
    && (a.payloadKey ?? null) === (b.payloadKey ?? null)
    && (a.payloadSha256 ?? null) === (b.payloadSha256 ?? null)
    && (a.payloadContentType ?? null) === (b.payloadContentType ?? null)
    && (a.payloadVersion ?? null) === (b.payloadVersion ?? null)
    && (a.payloadSize ?? null) === (b.payloadSize ?? null)
  )
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
): NormalizedUpdateInput {
  const { forUpdate = false, allowRelease = false } = options
  const { title, timestamp, summary, tags, link, type, releaseTag, scope, channels } = input

  const resolvedType = normalizeUpdateType(
    typeof type === 'string' ? type : (forUpdate ? undefined : 'news'),
    forUpdate ? 'news' : 'news',
  )

  if (resolvedType && !['news', 'release', 'announcement', 'config', 'data'].includes(resolvedType)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid update type.' })
  }

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
  const normalizedScope = normalizeScope(scope, 'web')
  const normalizedChannels = normalizeChannels(channels)

  return {
    type: (resolvedType ?? 'news') as UpdateType,
    scope: normalizedScope,
    channels: normalizedChannels,
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
    type: normalizeUpdateType(update.type, 'news'),
    scope: normalizeScope(update.scope, 'web'),
    channels: Array.isArray(update.channels) ? update.channels.map(channel => String(channel)) : [],
    releaseTag: typeof update.releaseTag === 'string' ? update.releaseTag : null,
    title: normalizeLocalizedText((update as any).title ?? ''),
    timestamp: typeof update.timestamp === 'string' ? update.timestamp : new Date().toISOString(),
    summary: normalizeLocalizedText((update as any).summary ?? ''),
    tags: Array.isArray(update.tags) ? update.tags.map(tag => String(tag)) : [],
    link: typeof update.link === 'string' ? update.link : '',
    payloadKey: typeof update.payloadKey === 'string' ? update.payloadKey : null,
    payloadSha256: typeof update.payloadSha256 === 'string' ? update.payloadSha256 : null,
    payloadContentType: typeof update.payloadContentType === 'string' ? update.payloadContentType : null,
    payloadVersion: typeof update.payloadVersion === 'string' ? update.payloadVersion : null,
    payloadSize: typeof update.payloadSize === 'number' ? update.payloadSize : null,
    payloadUrl: typeof update.payloadUrl === 'string'
      ? update.payloadUrl
      : typeof update.payloadKey === 'string'
        ? `/api/updates/${String(update.id ?? '')}/payload`
        : null,
    createdAt: typeof update.createdAt === 'string' ? update.createdAt : new Date().toISOString(),
    updatedAt: typeof update.updatedAt === 'string' ? update.updatedAt : new Date().toISOString(),
  }
}

function mergeOfficialUpdates(updates: DashboardUpdate[]): DashboardUpdate[] {
  const merged = [...updates]
  const knownIds = new Set(merged.map(update => update.id))

  for (const officialUpdate of OFFICIAL_UPDATES) {
    if (knownIds.has(officialUpdate.id))
      continue
    merged.push(officialUpdate)
  }

  return merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

async function listStoredUpdatesInMemory(): Promise<DashboardUpdate[]> {
  const updates = await readCollection<DashboardUpdate>(UPDATES_KEY)
  const normalized = updates.map(update => normalizeStoredUpdate(update))
  return normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

function matchScope(update: DashboardUpdate, scope?: UpdateScope): boolean {
  if (!scope)
    return true
  if (scope === 'web')
    return update.scope === 'web' || update.scope === 'both'
  if (scope === 'system')
    return update.scope === 'system' || update.scope === 'both'
  return update.scope === 'both'
}

function matchType(update: DashboardUpdate, type?: UpdateType): boolean {
  if (!type)
    return true
  return update.type === type
}

function matchChannel(update: DashboardUpdate, channel?: string): boolean {
  if (!channel)
    return true
  if (!update.channels || update.channels.length === 0)
    return true
  return update.channels.includes(channel.toUpperCase())
}

function applyUpdateFilters(updates: DashboardUpdate[], options: ListUpdatesOptions): DashboardUpdate[] {
  return updates.filter(update =>
    matchScope(update, options.scope)
    && matchType(update, options.type)
    && matchChannel(update, options.channel)
  )
}

export async function listUpdates(
  event?: H3Event,
  options: ListUpdatesOptions = {},
): Promise<DashboardUpdate[]> {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const { results } = await db.prepare(`
      SELECT
        id,
        type,
        scope,
        channels,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        payload_key,
        payload_sha256,
        payload_content_type,
        payload_version,
        payload_size,
        created_at,
        updated_at
      FROM ${UPDATES_TABLE}
      ORDER BY datetime(timestamp) DESC;
    `).all<D1UpdateRow>()

    const mapped = (results ?? []).map(mapUpdateRow)
    const merged = mergeOfficialUpdates(mapped)
    return applyUpdateFilters(merged, options)
  }

  const memoryUpdates = await listStoredUpdatesInMemory()
  const merged = mergeOfficialUpdates(memoryUpdates)
  return applyUpdateFilters(merged, options)
}

export async function getUpdateById(event: H3Event | undefined, id: string) {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const row = await db.prepare(`
      SELECT
        id,
        type,
        scope,
        channels,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        payload_key,
        payload_sha256,
        payload_content_type,
        payload_version,
        payload_size,
        created_at,
        updated_at
      FROM ${UPDATES_TABLE}
      WHERE id = ?1;
    `).bind(id).first<D1UpdateRow>()

    if (row)
      return mapUpdateRow(row)
    return OFFICIAL_UPDATES.find(update => update.id === id) ?? null
  }

  const updates = await readCollection<DashboardUpdate>(UPDATES_KEY)
  const match = updates.find(update => update.id === id)
  if (match)
    return normalizeStoredUpdate(match)
  return OFFICIAL_UPDATES.find(update => update.id === id) ?? null
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

  if (rawInput.payload !== undefined && rawInput.payload !== null) {
    const payloadMeta = await buildPayloadMeta(event, update.id, rawInput.payload, rawInput.payloadVersion)
    Object.assign(update, payloadMeta)
  }

  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    await db.prepare(`
      INSERT INTO ${UPDATES_TABLE} (
        id,
        type,
        scope,
        channels,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        payload_key,
        payload_sha256,
        payload_content_type,
        payload_version,
        payload_size,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17);
    `).bind(
      update.id,
      update.type,
      update.scope,
      JSON.stringify(update.channels),
      update.releaseTag,
      serializeLocalizedText(update.title),
      update.timestamp,
      serializeLocalizedText(update.summary),
      JSON.stringify(update.tags),
      update.link,
      update.payloadKey ?? null,
      update.payloadSha256 ?? null,
      update.payloadContentType ?? null,
      update.payloadVersion ?? null,
      update.payloadSize ?? null,
      update.createdAt,
      update.updatedAt,
    ).run()

    return update
  }

  const updates = await listStoredUpdatesInMemory()
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

    const mergedInput = normalizeUpdateInput(
      {
        ...existing,
        ...rawInput,
      },
      { forUpdate: true, allowRelease: options.allowRelease },
    )

    let payloadMeta: Partial<DashboardUpdate> = {}
    const payloadProvided = Object.prototype.hasOwnProperty.call(rawInput, 'payload')
    if (payloadProvided) {
      if (rawInput.payload === null) {
        payloadMeta = {
          payloadKey: null,
          payloadSha256: null,
          payloadContentType: null,
          payloadVersion: null,
          payloadSize: null,
          payloadUrl: null,
        }
      }
      else if (rawInput.payload !== undefined) {
        payloadMeta = await buildPayloadMeta(event, existing.id, rawInput.payload, rawInput.payloadVersion)
      }
    }

    const updated: DashboardUpdate = {
      ...existing,
      ...mergedInput,
      ...payloadMeta,
      updatedAt: new Date().toISOString(),
    }

    await db.prepare(`
      UPDATE ${UPDATES_TABLE}
      SET
        type = ?1,
        scope = ?2,
        channels = ?3,
        release_tag = ?4,
        title = ?5,
        timestamp = ?6,
        summary = ?7,
        tags = ?8,
        link = ?9,
        payload_key = ?10,
        payload_sha256 = ?11,
        payload_content_type = ?12,
        payload_version = ?13,
        payload_size = ?14,
        updated_at = ?15
      WHERE id = ?16;
    `).bind(
      updated.type,
      updated.scope,
      JSON.stringify(updated.channels),
      updated.releaseTag,
      serializeLocalizedText(updated.title),
      updated.timestamp,
      serializeLocalizedText(updated.summary),
      JSON.stringify(updated.tags),
      updated.link,
      updated.payloadKey ?? null,
      updated.payloadSha256 ?? null,
      updated.payloadContentType ?? null,
      updated.payloadVersion ?? null,
      updated.payloadSize ?? null,
      updated.updatedAt,
      updated.id,
    ).run()

    return updated
  }

  const updates = await listStoredUpdatesInMemory()
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

  let payloadMeta: Partial<DashboardUpdate> = {}
  const payloadProvided = Object.prototype.hasOwnProperty.call(rawInput, 'payload')
  if (payloadProvided) {
    if (rawInput.payload === null) {
      payloadMeta = {
        payloadKey: null,
        payloadSha256: null,
        payloadContentType: null,
        payloadVersion: null,
        payloadSize: null,
        payloadUrl: null,
      }
    }
    else if (rawInput.payload !== undefined) {
      payloadMeta = await buildPayloadMeta(event, existing.id, rawInput.payload, rawInput.payloadVersion)
    }
  }

  const updated: DashboardUpdate = {
    ...existing,
    ...mergedInput,
    ...payloadMeta,
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

  const updates = await listStoredUpdatesInMemory()
  const existing = updates.find(update => update.id === id)
  if (existing?.type === 'release' && !options.allowRelease)
    throw createError({ statusCode: 403, statusMessage: 'Release updates are managed automatically.' })
  const nextUpdates = updates.filter(update => update.id !== id)

  if (nextUpdates.length === updates.length)
    throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

  await writeCollection(UPDATES_KEY, nextUpdates)
}

export interface OfficialUpdatesSyncResult {
  total: number
  inserted: number
  updated: number
  updates: DashboardUpdate[]
}

export async function syncOfficialUpdates(event: H3Event): Promise<OfficialUpdatesSyncResult> {
  const db = getD1Database(event)
  let inserted = 0
  let updated = 0
  const synced: DashboardUpdate[] = []

  if (db) {
    await ensureDashboardSchema(db)

    for (const officialUpdate of OFFICIAL_UPDATES) {
      const existingRow = await db.prepare(`
        SELECT
          id,
          type,
          scope,
          channels,
          release_tag,
          title,
          timestamp,
          summary,
          tags,
          link,
          payload_key,
          payload_sha256,
          payload_content_type,
          payload_version,
          payload_size,
          created_at,
          updated_at
        FROM ${UPDATES_TABLE}
        WHERE id = ?1;
      `).bind(officialUpdate.id).first<D1UpdateRow>()

      if (!existingRow) {
        await db.prepare(`
          INSERT INTO ${UPDATES_TABLE} (
            id,
            type,
            scope,
            channels,
            release_tag,
            title,
            timestamp,
            summary,
            tags,
            link,
            payload_key,
            payload_sha256,
            payload_content_type,
            payload_version,
            payload_size,
            created_at,
            updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17);
        `).bind(
          officialUpdate.id,
          officialUpdate.type,
          officialUpdate.scope,
          JSON.stringify(officialUpdate.channels),
          officialUpdate.releaseTag,
          serializeLocalizedText(officialUpdate.title),
          officialUpdate.timestamp,
          serializeLocalizedText(officialUpdate.summary),
          JSON.stringify(officialUpdate.tags),
          officialUpdate.link,
          officialUpdate.payloadKey ?? null,
          officialUpdate.payloadSha256 ?? null,
          officialUpdate.payloadContentType ?? null,
          officialUpdate.payloadVersion ?? null,
          officialUpdate.payloadSize ?? null,
          officialUpdate.createdAt,
          officialUpdate.updatedAt,
        ).run()

        inserted += 1
        synced.push(officialUpdate)
        continue
      }

      const existing = mapUpdateRow(existingRow)
      if (isSameUpdateContent(existing, officialUpdate)) {
        synced.push(existing)
        continue
      }

      const nextUpdatedAt = new Date().toISOString()
      const nextUpdate: DashboardUpdate = {
        ...officialUpdate,
        createdAt: existing.createdAt,
        updatedAt: nextUpdatedAt,
      }

      await db.prepare(`
        UPDATE ${UPDATES_TABLE}
        SET
          type = ?1,
          scope = ?2,
          channels = ?3,
          release_tag = ?4,
          title = ?5,
          timestamp = ?6,
          summary = ?7,
          tags = ?8,
          link = ?9,
          payload_key = ?10,
          payload_sha256 = ?11,
          payload_content_type = ?12,
          payload_version = ?13,
          payload_size = ?14,
          updated_at = ?15
        WHERE id = ?16;
      `).bind(
        nextUpdate.type,
        nextUpdate.scope,
        JSON.stringify(nextUpdate.channels),
        nextUpdate.releaseTag,
        serializeLocalizedText(nextUpdate.title),
        nextUpdate.timestamp,
        serializeLocalizedText(nextUpdate.summary),
        JSON.stringify(nextUpdate.tags),
        nextUpdate.link,
        nextUpdate.payloadKey ?? null,
        nextUpdate.payloadSha256 ?? null,
        nextUpdate.payloadContentType ?? null,
        nextUpdate.payloadVersion ?? null,
        nextUpdate.payloadSize ?? null,
        nextUpdate.updatedAt,
        nextUpdate.id,
      ).run()

      updated += 1
      synced.push(nextUpdate)
    }

    return {
      total: OFFICIAL_UPDATES.length,
      inserted,
      updated,
      updates: synced,
    }
  }

  const memoryUpdates = await listStoredUpdatesInMemory()
  let changed = false

  for (const officialUpdate of OFFICIAL_UPDATES) {
    const index = memoryUpdates.findIndex(update => update.id === officialUpdate.id)
    if (index === -1) {
      memoryUpdates.unshift(officialUpdate)
      inserted += 1
      changed = true
      synced.push(officialUpdate)
      continue
    }

    const existing = memoryUpdates[index]
    if (!existing)
      continue

    if (isSameUpdateContent(existing, officialUpdate)) {
      synced.push(existing)
      continue
    }

    const nextUpdate: DashboardUpdate = {
      ...officialUpdate,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }
    memoryUpdates[index] = nextUpdate
    updated += 1
    changed = true
    synced.push(nextUpdate)
  }

  if (changed) {
    memoryUpdates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    await writeCollection(UPDATES_KEY, memoryUpdates)
  }

  return {
    total: OFFICIAL_UPDATES.length,
    inserted,
    updated,
    updates: synced,
  }
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
    scope: 'both',
    channels: [release.channel],
    releaseTag: release.tag,
    title: release.name || release.tag,
    timestamp: release.publishedAt ?? release.createdAt,
    summary,
    tags: [channelId],
    link: buildReleaseNotesPath(release.version),
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
          scope = ?2,
          channels = ?3,
          release_tag = ?4,
          title = ?5,
          timestamp = ?6,
          summary = ?7,
          tags = ?8,
          link = ?9,
          updated_at = ?10
        WHERE id = ?11;
      `).bind(
        updated.type,
        updated.scope,
        JSON.stringify(updated.channels),
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
        scope,
        channels,
        release_tag,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);
    `).bind(
      created.id,
      created.type,
      created.scope,
      JSON.stringify(created.channels),
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
