import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'

const RELEASES_KEY = 'app:releases'
const RELEASE_ASSETS_KEY = 'app:release_assets'
const RELEASE_REVISIONS_KEY = 'app:release_revisions'
const RELEASES_TABLE = 'app_releases'
const RELEASE_ASSETS_TABLE = 'app_release_assets'
const RELEASE_REVISIONS_TABLE = 'app_release_revisions'

let schemaInitialized = false
let hasLoggedReleasesDb = false
let hasLoggedReleasesFallback = false

export type ReleaseChannel = 'RELEASE' | 'BETA' | 'SNAPSHOT'
export type ReleaseStatus = 'draft' | 'published' | 'archived'
export type AssetPlatform = 'darwin' | 'win32' | 'linux'
export type AssetArch = 'x64' | 'arm64' | 'universal'
export type AssetSourceType = 'github' | 'upload'
export type ReleaseNoteLocale = 'zh' | 'en'

export interface ReleaseNotes {
  zh: string
  en: string
}

export interface ReleaseAsset {
  id: string
  releaseId: string
  platform: AssetPlatform
  arch: AssetArch
  filename: string
  sourceType: AssetSourceType
  fileKey: string | null
  downloadUrl: string
  signatureUrl?: string | null
  size: number
  sha256: string | null
  contentType: string
  downloadCount: number
  createdAt: string
  updatedAt: string
}

export interface AppRelease {
  id: string
  tag: string
  name: string
  channel: ReleaseChannel
  version: string
  notes: ReleaseNotes
  notesHtml?: ReleaseNotes | null
  status: ReleaseStatus
  publishedAt: string | null
  minAppVersion?: string | null
  isCritical: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  assets?: ReleaseAsset[]
}

export interface ReleaseRevision {
  id: string
  releaseId: string
  tag: string
  snapshot: AppRelease
  createdBy: string
  createdAt: string
}

interface D1ReleaseRow {
  id: string
  tag: string
  name: string
  channel: string
  version: string
  notes: string
  notes_html: string | null
  status: string
  published_at: string | null
  min_app_version: string | null
  is_critical: number
  created_by: string
  created_at: string
  updated_at: string
}

interface D1ReleaseAssetRow {
  id: string
  release_id: string
  platform: string
  arch: string
  filename: string
  source_type: string
  file_key: string | null
  download_url: string
  size: number
  sha256: string | null
  content_type: string
  download_count: number
  created_at: string
  updated_at: string
}

interface D1ReleaseRevisionRow {
  id: string
  release_id: string
  tag: string
  snapshot: string
  created_by: string
  created_at: string
}

interface CreateReleaseInput {
  tag: string
  name: string
  channel: ReleaseChannel
  version: string
  notes: ReleaseNotes
  notesHtml?: ReleaseNotes | null
  status?: ReleaseStatus
  minAppVersion?: string | null
  isCritical?: boolean
  createdBy: string
}

interface UpdateReleaseInput {
  name?: string
  notes?: ReleaseNotes
  notesHtml?: ReleaseNotes | null
  status?: ReleaseStatus
  minAppVersion?: string | null
  isCritical?: boolean
  publishedAt?: string | null
}

interface CreateAssetInput {
  releaseId: string
  platform: AssetPlatform
  arch: AssetArch
  filename: string
  sourceType: AssetSourceType
  fileKey?: string | null
  downloadUrl: string
  size: number
  sha256?: string | null
  contentType: string
}

function getD1Database(event?: H3Event | null): D1Database | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  const db = bindings?.DB ?? null

  if (db) {
    if (!hasLoggedReleasesDb) {
      console.warn('[releasesStore] Connected to D1 database.')
      hasLoggedReleasesDb = true
    }
  }
  else if (!hasLoggedReleasesFallback) {
    console.warn('[releasesStore] No D1 binding detected, falling back to memory storage.')
    hasLoggedReleasesFallback = true
  }

  return db
}

async function ensureReleasesSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RELEASES_TABLE} (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      channel TEXT NOT NULL,
      version TEXT NOT NULL,
      notes TEXT NOT NULL,
      notes_html TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      min_app_version TEXT,
      is_critical INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RELEASE_ASSETS_TABLE} (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      arch TEXT NOT NULL,
      filename TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'upload',
      file_key TEXT,
      download_url TEXT NOT NULL,
      size INTEGER NOT NULL,
      sha256 TEXT,
      content_type TEXT NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (release_id) REFERENCES ${RELEASES_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RELEASE_REVISIONS_TABLE} (
      id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (release_id) REFERENCES ${RELEASES_TABLE}(id) ON DELETE CASCADE
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_releases_channel ON ${RELEASES_TABLE}(channel);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_releases_status ON ${RELEASES_TABLE}(status);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_assets_release_id ON ${RELEASE_ASSETS_TABLE}(release_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_revisions_release_id ON ${RELEASE_REVISIONS_TABLE}(release_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_release_revisions_tag ON ${RELEASE_REVISIONS_TABLE}(tag);`).run()

  schemaInitialized = true
}

function mapReleaseRow(row: D1ReleaseRow): AppRelease {
  return {
    id: row.id,
    tag: row.tag,
    name: row.name,
    channel: row.channel as ReleaseChannel,
    version: row.version,
    notes: parseReleaseNotes(row.notes),
    notesHtml: parseReleaseNotesHtml(row.notes_html),
    status: row.status as ReleaseStatus,
    publishedAt: row.published_at,
    minAppVersion: row.min_app_version,
    isCritical: Boolean(row.is_critical),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAssetRow(row: D1ReleaseAssetRow): ReleaseAsset {
  return {
    id: row.id,
    releaseId: row.release_id,
    platform: row.platform as AssetPlatform,
    arch: row.arch as AssetArch,
    filename: row.filename,
    sourceType: row.source_type as AssetSourceType,
    fileKey: row.file_key,
    downloadUrl: row.download_url,
    size: row.size,
    sha256: row.sha256,
    contentType: row.content_type,
    downloadCount: row.download_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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

function validateChannel(channel: string): asserts channel is ReleaseChannel {
  const allowed: ReleaseChannel[] = ['RELEASE', 'BETA', 'SNAPSHOT']
  if (!allowed.includes(channel as ReleaseChannel))
    throw createError({ statusCode: 400, statusMessage: 'Invalid release channel.' })
}

function validatePlatform(platform: string): asserts platform is AssetPlatform {
  const allowed: AssetPlatform[] = ['darwin', 'win32', 'linux']
  if (!allowed.includes(platform as AssetPlatform))
    throw createError({ statusCode: 400, statusMessage: 'Invalid platform.' })
}

function validateArch(arch: string): asserts arch is AssetArch {
  const allowed: AssetArch[] = ['x64', 'arm64', 'universal']
  if (!allowed.includes(arch as AssetArch))
    throw createError({ statusCode: 400, statusMessage: 'Invalid architecture.' })
}

function validateSemanticVersion(version: string): boolean {
  const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*)?(?:\+(?:[0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i
  return semverPattern.test(version)
}

function normalizeReleaseNotes(input: unknown, fallback?: ReleaseNotes): ReleaseNotes {
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

  return fallback ?? { zh: '', en: '' }
}

function parseReleaseNotes(raw: string | null | undefined): ReleaseNotes {
  if (!raw) {
    return { zh: '', en: '' }
  }

  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return normalizeReleaseNotes(parsed)
    }
    catch {
      return normalizeReleaseNotes(raw)
    }
  }

  return normalizeReleaseNotes(raw)
}

function parseReleaseNotesHtml(raw: string | null | undefined): ReleaseNotes | null {
  if (!raw) {
    return null
  }

  const parsed = parseReleaseNotes(raw)
  if (!parsed.zh && !parsed.en) {
    return null
  }
  return parsed
}

function serializeReleaseNotes(notes: ReleaseNotes): string {
  return JSON.stringify(normalizeReleaseNotes(notes))
}

function serializeReleaseNotesHtml(notesHtml?: ReleaseNotes | null): string | null {
  if (!notesHtml) {
    return null
  }
  const normalized = normalizeReleaseNotes(notesHtml)
  if (!normalized.zh && !normalized.en) {
    return null
  }
  return JSON.stringify(normalized)
}

function normalizeReleaseRecord(release: AppRelease): AppRelease {
  const notes = normalizeReleaseNotes((release as any).notes)
  const notesHtmlRaw = (release as any).notesHtml
  const notesHtml = notesHtmlRaw ? normalizeReleaseNotes(notesHtmlRaw) : null
  return {
    ...release,
    notes,
    notesHtml,
  }
}

function fallbackRevisionSnapshot(raw: string): AppRelease {
  const now = new Date().toISOString()
  return {
    id: '',
    tag: '',
    name: '',
    channel: 'RELEASE',
    version: '',
    notes: normalizeReleaseNotes(raw),
    notesHtml: null,
    status: 'draft',
    publishedAt: null,
    minAppVersion: null,
    isCritical: false,
    createdBy: 'unknown',
    createdAt: now,
    updatedAt: now,
    assets: [],
  }
}

function parseReleaseRevisionSnapshot(raw: string): AppRelease {
  try {
    const parsed = JSON.parse(raw) as AppRelease
    return normalizeReleaseRecord(parsed)
  }
  catch {
    return fallbackRevisionSnapshot(raw)
  }
}

function mapReleaseRevisionRow(row: D1ReleaseRevisionRow): ReleaseRevision {
  return {
    id: row.id,
    releaseId: row.release_id,
    tag: row.tag,
    snapshot: parseReleaseRevisionSnapshot(row.snapshot),
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function listReleases(
  event: H3Event | undefined,
  options: {
    channel?: ReleaseChannel
    status?: ReleaseStatus
    includeAssets?: boolean
    limit?: number
  } = {},
): Promise<AppRelease[]> {
  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)

    let query = `
      SELECT *
      FROM ${RELEASES_TABLE}
      WHERE 1=1
    `
    const bindings: unknown[] = []
    let bindIndex = 1

    if (options.channel) {
      query += ` AND channel = ?${bindIndex++}`
      bindings.push(options.channel)
    }

    if (options.status) {
      query += ` AND status = ?${bindIndex++}`
      bindings.push(options.status)
    }

    query += ` ORDER BY datetime(created_at) DESC`

    if (options.limit) {
      query += ` LIMIT ?${bindIndex++}`
      bindings.push(options.limit)
    }

    const stmt = db.prepare(query)
    const { results } = bindings.length
      ? await stmt.bind(...bindings).all<D1ReleaseRow>()
      : await stmt.all<D1ReleaseRow>()

    const releases = (results ?? []).map(mapReleaseRow)

    if (options.includeAssets && releases.length) {
      const ids = releases.map(r => r.id)
      const placeholders = ids.map((_, idx) => `?${idx + 1}`).join(', ')

      const assetsQuery = `
        SELECT *
        FROM ${RELEASE_ASSETS_TABLE}
        WHERE release_id IN (${placeholders})
        ORDER BY platform, arch;
      `

      const assetResults = await db.prepare(assetsQuery).bind(...ids).all<D1ReleaseAssetRow>()
      const assets = (assetResults.results ?? []).map(mapAssetRow)

      const assetsByRelease = new Map<string, ReleaseAsset[]>()
      for (const asset of assets) {
        if (!assetsByRelease.has(asset.releaseId))
          assetsByRelease.set(asset.releaseId, [])
        assetsByRelease.get(asset.releaseId)!.push(asset)
      }

      return releases.map(release => ({
        ...release,
        assets: assetsByRelease.get(release.id) ?? [],
      }))
    }

    return releases
  }

  // Memory fallback
  let releases = (await readCollection<AppRelease>(RELEASES_KEY)).map(normalizeReleaseRecord)

  if (options.channel)
    releases = releases.filter(r => r.channel === options.channel)

  if (options.status)
    releases = releases.filter(r => r.status === options.status)

  releases = releases.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  if (options.limit)
    releases = releases.slice(0, options.limit)

  if (options.includeAssets) {
    const allAssets = await readCollection<ReleaseAsset>(RELEASE_ASSETS_KEY)
    const assetsByRelease = new Map<string, ReleaseAsset[]>()

    for (const asset of allAssets) {
      if (!assetsByRelease.has(asset.releaseId))
        assetsByRelease.set(asset.releaseId, [])
      assetsByRelease.get(asset.releaseId)!.push(asset)
    }

    return releases.map(release => ({
      ...release,
      assets: assetsByRelease.get(release.id) ?? [],
    }))
  }

  return releases
}

export async function getLatestRelease(
  event: H3Event | undefined,
  channel: ReleaseChannel = 'RELEASE',
  platform?: AssetPlatform,
): Promise<AppRelease | null> {
  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)

    const row = await db.prepare(`
      SELECT *
      FROM ${RELEASES_TABLE}
      WHERE channel = ?1 AND status = 'published'
      ORDER BY datetime(published_at) DESC
      LIMIT 1;
    `).bind(channel).first<D1ReleaseRow>()

    if (!row)
      return null

    const release = mapReleaseRow(row)

    let assetsQuery = `
      SELECT *
      FROM ${RELEASE_ASSETS_TABLE}
      WHERE release_id = ?1
    `
    const bindings: unknown[] = [release.id]

    if (platform) {
      assetsQuery += ` AND platform = ?2`
      bindings.push(platform)
    }

    assetsQuery += ` ORDER BY platform, arch;`

    const assetResults = await db.prepare(assetsQuery).bind(...bindings).all<D1ReleaseAssetRow>()
    const assets = (assetResults.results ?? []).map(mapAssetRow)

    return { ...release, assets }
  }

  // Memory fallback
  const releases = (await readCollection<AppRelease>(RELEASES_KEY)).map(normalizeReleaseRecord)
  const published = releases
    .filter(r => r.channel === channel && r.status === 'published')
    .sort((a, b) =>
      new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime(),
    )

  if (!published.length)
    return null

  const release = published[0]
  if (!release)
    return null
  let assets = await readCollection<ReleaseAsset>(RELEASE_ASSETS_KEY)
  assets = assets.filter(a => a.releaseId === release.id)

  if (platform)
    assets = assets.filter(a => a.platform === platform)

  return { ...release, assets }
}

export async function getReleaseByTag(
  event: H3Event | undefined,
  tag: string,
  includeAssets = true,
): Promise<AppRelease | null> {
  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)

    const row = await db.prepare(`
      SELECT *
      FROM ${RELEASES_TABLE}
      WHERE tag = ?1;
    `).bind(tag).first<D1ReleaseRow>()

    if (!row)
      return null

    const release = mapReleaseRow(row)

    if (!includeAssets)
      return release

    const assetResults = await db.prepare(`
      SELECT *
      FROM ${RELEASE_ASSETS_TABLE}
      WHERE release_id = ?1
      ORDER BY platform, arch;
    `).bind(release.id).all<D1ReleaseAssetRow>()

    const assets = (assetResults.results ?? []).map(mapAssetRow)
    return { ...release, assets }
  }

  // Memory fallback
  const releases = (await readCollection<AppRelease>(RELEASES_KEY)).map(normalizeReleaseRecord)
  const release = releases.find(r => r.tag === tag)

  if (!release)
    return null

  if (!includeAssets)
    return release

  const allAssets = await readCollection<ReleaseAsset>(RELEASE_ASSETS_KEY)
  const assets = allAssets.filter(a => a.releaseId === release.id)

  return { ...release, assets }
}

export async function createRelease(
  event: H3Event,
  input: CreateReleaseInput,
): Promise<AppRelease> {
  validateChannel(input.channel)

  if (!input.tag || typeof input.tag !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  if (!input.name || typeof input.name !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'Release name is required.' })

  if (!input.version || !validateSemanticVersion(input.version))
    throw createError({ statusCode: 400, statusMessage: 'Invalid semantic version.' })

  // Check for duplicate tag
  const existing = await getReleaseByTag(event, input.tag, false)
  if (existing)
    throw createError({ statusCode: 400, statusMessage: 'Release tag already exists.' })

  const now = new Date().toISOString()
  const normalizedNotes = normalizeReleaseNotes(input.notes)
  const normalizedNotesHtml = input.notesHtml ? normalizeReleaseNotes(input.notesHtml) : null
  const status = input.status ?? 'draft'
  const release: AppRelease = {
    id: randomUUID(),
    tag: input.tag,
    name: input.name,
    channel: input.channel,
    version: input.version,
    notes: normalizedNotes,
    notesHtml: normalizedNotesHtml,
    status,
    publishedAt: status === 'published' ? now : null,
    minAppVersion: input.minAppVersion ?? null,
    isCritical: input.isCritical ?? false,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  }

  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)
    const serializedNotes = serializeReleaseNotes(normalizedNotes)
    const serializedNotesHtml = serializeReleaseNotesHtml(normalizedNotesHtml)

    await db.prepare(`
      INSERT INTO ${RELEASES_TABLE} (
        id, tag, name, channel, version, notes, notes_html,
        status, published_at, min_app_version, is_critical,
        created_by, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);
    `).bind(
      release.id,
      release.tag,
      release.name,
      release.channel,
      release.version,
      serializedNotes,
      serializedNotesHtml,
      release.status,
      release.publishedAt,
      release.minAppVersion,
      release.isCritical ? 1 : 0,
      release.createdBy,
      release.createdAt,
      release.updatedAt,
    ).run()

    return release
  }

  // Memory fallback
  const releases = await readCollection<AppRelease>(RELEASES_KEY)
  releases.unshift(release)
  await writeCollection(RELEASES_KEY, releases)

  return release
}

export async function updateRelease(
  event: H3Event,
  tag: string,
  input: UpdateReleaseInput,
): Promise<AppRelease> {
  const existing = await getReleaseByTag(event, tag, false)
  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  const now = new Date().toISOString()
  const resolvedNotes = input.notes
    ? normalizeReleaseNotes(input.notes)
    : normalizeReleaseNotes(existing.notes)
  const resolvedNotesHtml = input.notesHtml === undefined
    ? (existing.notesHtml ? normalizeReleaseNotes(existing.notesHtml) : null)
    : input.notesHtml
      ? normalizeReleaseNotes(input.notesHtml)
      : null

  const updated: AppRelease = {
    ...existing,
    name: input.name ?? existing.name,
    notes: resolvedNotes,
    notesHtml: resolvedNotesHtml,
    status: input.status ?? existing.status,
    minAppVersion: input.minAppVersion !== undefined ? input.minAppVersion : existing.minAppVersion,
    isCritical: input.isCritical ?? existing.isCritical,
    publishedAt: input.publishedAt !== undefined ? input.publishedAt : existing.publishedAt,
    updatedAt: now,
  }

  // Auto-set publishedAt when status changes to published
  if (input.status === 'published' && !updated.publishedAt)
    updated.publishedAt = now

  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)
    const serializedNotes = serializeReleaseNotes(resolvedNotes)
    const serializedNotesHtml = serializeReleaseNotesHtml(resolvedNotesHtml)

    await db.prepare(`
      UPDATE ${RELEASES_TABLE}
      SET name = ?1, notes = ?2, notes_html = ?3, status = ?4,
          min_app_version = ?5, is_critical = ?6, published_at = ?7, updated_at = ?8
      WHERE tag = ?9;
    `).bind(
      updated.name,
      serializedNotes,
      serializedNotesHtml,
      updated.status,
      updated.minAppVersion,
      updated.isCritical ? 1 : 0,
      updated.publishedAt,
      updated.updatedAt,
      tag,
    ).run()

    return updated
  }

  // Memory fallback
  const releases = await readCollection<AppRelease>(RELEASES_KEY)
  const index = releases.findIndex(r => r.tag === tag)
  if (index !== -1) {
    releases[index] = updated
    await writeCollection(RELEASES_KEY, releases)
  }

  return updated
}

export async function createReleaseRevision(
  event: H3Event,
  release: AppRelease,
  createdBy: string,
): Promise<ReleaseRevision> {
  const db = getD1Database(event)
  const now = new Date().toISOString()
  const snapshot = normalizeReleaseRecord(release)

  const revision: ReleaseRevision = {
    id: randomUUID(),
    releaseId: release.id,
    tag: release.tag,
    snapshot,
    createdBy,
    createdAt: now,
  }

  if (db) {
    await ensureReleasesSchema(db)
    await db.prepare(`
      INSERT INTO ${RELEASE_REVISIONS_TABLE} (
        id, release_id, tag, snapshot, created_by, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6);
    `).bind(
      revision.id,
      revision.releaseId,
      revision.tag,
      JSON.stringify(revision.snapshot),
      revision.createdBy,
      revision.createdAt,
    ).run()
    return revision
  }

  const revisions = await readCollection<ReleaseRevision>(RELEASE_REVISIONS_KEY)
  revisions.unshift(revision)
  await writeCollection(RELEASE_REVISIONS_KEY, revisions)
  return revision
}

export async function listReleaseRevisions(
  event: H3Event | undefined,
  tag: string,
): Promise<ReleaseRevision[]> {
  const db = getD1Database(event)
  if (db) {
    await ensureReleasesSchema(db)
    const { results } = await db.prepare(`
      SELECT *
      FROM ${RELEASE_REVISIONS_TABLE}
      WHERE tag = ?1
      ORDER BY datetime(created_at) DESC;
    `).bind(tag).all<D1ReleaseRevisionRow>()
    return (results ?? []).map(mapReleaseRevisionRow)
  }

  const revisions = await readCollection<ReleaseRevision>(RELEASE_REVISIONS_KEY)
  return revisions
    .filter(revision => revision.tag === tag)
    .map(revision => ({
      ...revision,
      snapshot: normalizeReleaseRecord(revision.snapshot),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function deleteRelease(event: H3Event, tag: string): Promise<void> {
  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)

    // Delete assets first (if not using CASCADE)
    const release = await getReleaseByTag(event, tag, false)
    if (release) {
      await db.prepare(`DELETE FROM ${RELEASE_ASSETS_TABLE} WHERE release_id = ?1;`).bind(release.id).run()
    }

    const result = await db.prepare(`DELETE FROM ${RELEASES_TABLE} WHERE tag = ?1;`).bind(tag).run()
    const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0

    if (changes === 0)
      throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

    return
  }

  // Memory fallback
  const releases = await readCollection<AppRelease>(RELEASES_KEY)
  const release = releases.find(r => r.tag === tag)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  const nextReleases = releases.filter(r => r.tag !== tag)
  await writeCollection(RELEASES_KEY, nextReleases)

  // Delete associated assets
  const assets = await readCollection<ReleaseAsset>(RELEASE_ASSETS_KEY)
  const nextAssets = assets.filter(a => a.releaseId !== release.id)
  await writeCollection(RELEASE_ASSETS_KEY, nextAssets)
}

export async function createReleaseAsset(
  event: H3Event,
  input: CreateAssetInput,
): Promise<ReleaseAsset> {
  validatePlatform(input.platform)
  validateArch(input.arch)

  const now = new Date().toISOString()
  const asset: ReleaseAsset = {
    id: randomUUID(),
    releaseId: input.releaseId,
    platform: input.platform,
    arch: input.arch,
    filename: input.filename,
    sourceType: input.sourceType,
    fileKey: input.fileKey ?? null,
    downloadUrl: input.downloadUrl,
    size: input.size,
    sha256: input.sha256 ?? null,
    contentType: input.contentType,
    downloadCount: 0,
    createdAt: now,
    updatedAt: now,
  }

  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)

    await db.prepare(`
      INSERT INTO ${RELEASE_ASSETS_TABLE} (
        id, release_id, platform, arch, filename, source_type, file_key,
        download_url, size, sha256, content_type, download_count,
        created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);
    `).bind(
      asset.id,
      asset.releaseId,
      asset.platform,
      asset.arch,
      asset.filename,
      asset.sourceType,
      asset.fileKey,
      asset.downloadUrl,
      asset.size,
      asset.sha256,
      asset.contentType,
      asset.downloadCount,
      asset.createdAt,
      asset.updatedAt,
    ).run()

    return asset
  }

  // Memory fallback
  const assets = await readCollection<ReleaseAsset>(RELEASE_ASSETS_KEY)
  assets.push(asset)
  await writeCollection(RELEASE_ASSETS_KEY, assets)

  return asset
}

export async function incrementDownloadCount(
  event: H3Event,
  assetId: string,
): Promise<void> {
  const db = getD1Database(event)

  if (db) {
    await ensureReleasesSchema(db)

    await db.prepare(`
      UPDATE ${RELEASE_ASSETS_TABLE}
      SET download_count = download_count + 1, updated_at = ?1
      WHERE id = ?2;
    `).bind(new Date().toISOString(), assetId).run()

    return
  }

  // Memory fallback
  const assets = await readCollection<ReleaseAsset>(RELEASE_ASSETS_KEY)
  const index = assets.findIndex(a => a.id === assetId)
  if (index !== -1) {
    const existing = assets[index]
    if (!existing)
      return
    existing.downloadCount++
    existing.updatedAt = new Date().toISOString()
    await writeCollection(RELEASE_ASSETS_KEY, assets)
  }
}
