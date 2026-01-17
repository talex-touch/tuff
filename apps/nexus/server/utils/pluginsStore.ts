import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { useStorage } from '#imports'
import { createError } from 'h3'
import { isPluginCategoryId } from '~/utils/plugin-categories'
import { readCloudflareBindings } from './cloudflare'
import { deleteImage, uploadImageFromBuffer } from './imageStorage'
import { deletePluginPackage, uploadPluginPackage } from './pluginPackageStorage'
import { extractTpexMetadata } from './tpex'

const PLUGINS_KEY = 'dashboard:plugins'
const PLUGIN_VERSIONS_KEY = 'dashboard:pluginVersions'
const PLUGINS_TABLE = 'dashboard_plugins'
const PLUGIN_VERSIONS_TABLE = 'dashboard_plugin_versions'

const MAX_PLUGINS_PER_USER = 10
const SUBMISSION_COOLDOWN_MS = 5 * 60 * 1000

let schemaInitialized = false
let hasLoggedPluginsDb = false
let hasLoggedPluginsFallback = false
let hasLoggedShaFallback = false

// region debug [DBG-nexus-coreapp-planprd-2026-01-12]
const DBG_SID = 'DBG-nexus-coreapp-planprd-2026-01-12'
const DBG_ENABLED = process.env.TALEX_WORKFLOW_DEBUG === DBG_SID
const DBG_LOG_PATH = '.workflow/.debug/DBG-nexus-coreapp-planprd-2026-01-12/debug.log'

async function dbgLog(
  hid: string,
  loc: string,
  msg: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!DBG_ENABLED)
    return

  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    fs.mkdirSync(path.dirname(DBG_LOG_PATH), { recursive: true })
    fs.appendFileSync(
      DBG_LOG_PATH,
      `${JSON.stringify({ sid: DBG_SID, hid, loc, msg, data, ts: Date.now() })}\n`,
    )
  }
  catch {}
}
// endregion

export type PluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'
export type PluginStatus = 'draft' | 'pending' | 'approved' | 'rejected'
export type PluginVersionStatus = 'pending' | 'approved' | 'rejected'

export interface DashboardPluginAuthor {
  name: string
  avatarColor?: string
}

export interface DashboardPluginVersion {
  id: string
  pluginId: string
  createdBy: string
  channel: PluginChannel
  version: string
  signature: string
  packageKey: string
  packageUrl: string
  packageSize: number
  iconKey: string
  iconUrl: string
  readmeMarkdown?: string | null
  manifest?: Record<string, unknown> | null
  changelog?: string | null
  status: PluginVersionStatus
  reviewedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface DashboardPlugin {
  id: string
  userId: string
  ownerOrgId?: string | null
  slug: string
  name: string
  summary: string
  category: string
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: DashboardPluginAuthor | null
  status: PluginStatus
  readmeMarkdown?: string | null
  iconKey?: string | null
  iconUrl?: string | null
  createdAt: string
  updatedAt: string
  latestVersionId?: string | null
  versions?: DashboardPluginVersion[]
}

interface D1PluginRow {
  id: string
  user_id: string
  owner_org_id: string | null
  name: string
  summary: string
  category: string
  installs: number
  homepage: string | null
  icon: string | null
  image_url: string | null
  last_updated: string | null
  version: string | null
  is_official: number
  badges: string | null
  author: string | null
  slug: string | null
  status: string | null
  readme_markdown: string | null
  icon_key: string | null
  icon_url: string | null
  created_at: string
  updated_at: string
  latest_version_id: string | null
}

interface D1PluginVersionRow {
  id: string
  plugin_id: string
  created_by: string
  channel: string
  version: string
  signature: string
  package_key: string
  package_url: string
  package_size: number
  icon_key: string
  icon_url: string
  readme_markdown: string | null
  manifest: string | null
  notes: string | null
  status: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

interface PluginVisibilityOptions {
  ownerId?: string
  viewerId?: string
  viewerOrgIds?: string[]
  viewerIsAdmin?: boolean
  includeVersions?: boolean
  forMarket?: boolean
  statuses?: PluginStatus[]
}

interface CreatePluginInput {
  slug: string
  name: string
  summary: string
  category: string
  homepage?: string | null
  isOfficial?: boolean
  badges?: string[]
  author?: DashboardPluginAuthor | null
  readmeMarkdown?: string
  iconKey?: string | null
  iconUrl?: string | null
  status?: PluginStatus
}

interface UpdatePluginInput extends Partial<CreatePluginInput> {
  ownerOrgId?: string | null
}

interface PublishVersionInput {
  pluginId: string
  channel: PluginChannel
  version: string
  changelog: string
  packageFile: File
  createdBy: string
  canModerate?: boolean
  homepage?: string | null
  iconFile?: File
}

function sanitizeSerializable(value: unknown): unknown {
  if (value == null)
    return value

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))
    return (value as Buffer).toJSON()

  if (ArrayBuffer.isView(value)) {
    const view = value as { buffer: ArrayBuffer, byteOffset: number, byteLength: number }
    return Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
  }

  if (value instanceof ArrayBuffer)
    return Array.from(new Uint8Array(value))

  if (Array.isArray(value))
    return value.map(item => sanitizeSerializable(item))

  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto === null || proto === Object.prototype) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, sanitizeSerializable(nested)]),
      )
    }
  }

  return value
}

function sanitizeManifest(manifest: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!manifest)
    return null

  const sanitized = sanitizeSerializable(manifest)
  return sanitized && typeof sanitized === 'object'
    ? sanitized as Record<string, unknown>
    : null
}

function sanitizeVersion(version: DashboardPluginVersion): DashboardPluginVersion {
  return {
    ...version,
    manifest: sanitizeManifest(version.manifest ?? undefined),
  }
}

function getD1Database(event?: H3Event | null): D1Database | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  const db = bindings?.DB ?? null

  if (db) {
    if (!hasLoggedPluginsDb) {
      hasLoggedPluginsDb = true
    }
  }
  else if (!hasLoggedPluginsFallback) {
    console.warn('[pluginsStore] 未检测到 D1 绑定，插件数据仅存储在内存中。')
    hasLoggedPluginsFallback = true
  }

  return db
}

async function ensurePluginSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGINS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      owner_org_id TEXT,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      installs INTEGER NOT NULL DEFAULT 0,
      homepage TEXT,
      icon TEXT,
      image_url TEXT,
      last_updated TEXT,
      version TEXT,
      is_official INTEGER NOT NULL DEFAULT 0,
      badges TEXT NOT NULL,
      author TEXT,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      readme_markdown TEXT,
      icon_key TEXT,
      icon_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      latest_version_id TEXT
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGIN_VERSIONS_TABLE} (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      channel TEXT NOT NULL,
      version TEXT NOT NULL,
      signature TEXT NOT NULL,
      package_key TEXT NOT NULL,
      package_url TEXT NOT NULL,
      package_size INTEGER NOT NULL,
      icon_key TEXT NOT NULL,
      icon_url TEXT NOT NULL,
      readme_markdown TEXT,
      manifest TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  // Add missing columns for backward compatibility
  const pluginColumns = await db.prepare(`PRAGMA table_info(${PLUGINS_TABLE});`).all<{ name: string }>()
  const columnNames = new Set((pluginColumns.results ?? []).map(col => col.name))

  const addColumnIfMissing = async (column: string, ddl: string) => {
    if (!columnNames.has(column)) {
      await db.prepare(`ALTER TABLE ${PLUGINS_TABLE} ADD COLUMN ${ddl};`).run()
    }
  }

  // Ensure all columns exist for backward compatibility
  await addColumnIfMissing('user_id', 'user_id TEXT')
  await addColumnIfMissing('owner_org_id', 'owner_org_id TEXT')
  await addColumnIfMissing('name', 'name TEXT')
  await addColumnIfMissing('summary', 'summary TEXT')
  await addColumnIfMissing('category', 'category TEXT')
  await addColumnIfMissing('installs', 'installs INTEGER DEFAULT 0')
  await addColumnIfMissing('homepage', 'homepage TEXT')
  await addColumnIfMissing('icon', 'icon TEXT')
  await addColumnIfMissing('image_url', 'image_url TEXT')
  await addColumnIfMissing('last_updated', 'last_updated TEXT')
  await addColumnIfMissing('version', 'version TEXT')
  await addColumnIfMissing('is_official', 'is_official INTEGER DEFAULT 0')
  await addColumnIfMissing('badges', 'badges TEXT')
  await addColumnIfMissing('author', 'author TEXT')
  await addColumnIfMissing('slug', 'slug TEXT')
  await addColumnIfMissing('status', 'status TEXT DEFAULT \'draft\'')
  await addColumnIfMissing('readme_markdown', 'readme_markdown TEXT')
  await addColumnIfMissing('icon_key', 'icon_key TEXT')
  await addColumnIfMissing('icon_url', 'icon_url TEXT')
  await addColumnIfMissing('created_at', 'created_at TEXT')
  await addColumnIfMissing('updated_at', 'updated_at TEXT')
  await addColumnIfMissing('latest_version_id', 'latest_version_id TEXT')

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${PLUGINS_TABLE}_slug ON ${PLUGINS_TABLE}(slug);`).run()

  const versionColumns = await db.prepare(`PRAGMA table_info(${PLUGIN_VERSIONS_TABLE});`).all<{ name: string }>()
  const versionColumnNames = new Set((versionColumns.results ?? []).map(col => col.name))

  const addVersionColumnIfMissing = async (column: string, ddl: string) => {
    if (!versionColumnNames.has(column))
      await db.prepare(`ALTER TABLE ${PLUGIN_VERSIONS_TABLE} ADD COLUMN ${ddl};`).run()
  }

  await addVersionColumnIfMissing('notes', 'notes TEXT')
  await addVersionColumnIfMissing('status', 'status TEXT NOT NULL DEFAULT \'pending\'')
  await addVersionColumnIfMissing('reviewed_at', 'reviewed_at TEXT')

  schemaInitialized = true
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

async function sha256Hex(data: Uint8Array): Promise<string> {
  if (typeof createHash === 'function') {
    try {
      return createHash('sha256').update(data).digest('hex')
    }
    catch {
      // fall through to WebCrypto
    }
  }

  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw createError({
      statusCode: 500,
      statusMessage: 'SHA-256 is not supported in this runtime.',
    })
  }

  if (!hasLoggedShaFallback) {
    console.warn('[pluginsStore] node crypto unavailable, falling back to WebCrypto SHA-256.')
    hasLoggedShaFallback = true
  }

  const digest = await subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function mapPluginRow(row: D1PluginRow): DashboardPlugin {
  return {
    id: row.id,
    userId: row.user_id,
    ownerOrgId: row.owner_org_id,
    slug: row.slug ?? row.id,
    name: row.name,
    summary: row.summary,
    category: row.category,
    installs: Number(row.installs ?? 0),
    homepage: row.homepage,
    isOfficial: Boolean(row.is_official),
    badges: parseJsonArray(row.badges),
    author: parseJsonObject<DashboardPluginAuthor>(row.author),
    status: (row.status as PluginStatus) || 'draft',
    readmeMarkdown: row.readme_markdown,
    iconKey: row.icon_key ?? row.icon ?? null,
    iconUrl: row.icon_url ?? row.image_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestVersionId: row.latest_version_id,
  }
}

function mapPluginVersionRow(row: D1PluginVersionRow): DashboardPluginVersion {
  return sanitizeVersion({
    id: row.id,
    pluginId: row.plugin_id,
    createdBy: row.created_by,
    channel: row.channel as PluginChannel,
    version: row.version,
    signature: row.signature,
    packageKey: row.package_key,
    packageUrl: row.package_url,
    packageSize: Number(row.package_size),
    iconKey: row.icon_key,
    iconUrl: row.icon_url,
    readmeMarkdown: row.readme_markdown,
    manifest: parseJsonObject<Record<string, unknown>>(row.manifest),
    changelog: row.notes,
    status: (row.status as PluginVersionStatus) || 'pending',
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function sanitizeBadges(badges?: string[]): string[] {
  return (badges ?? [])
    .map(badge => badge.trim())
    .filter(Boolean)
}

function validatePluginInput(input: CreatePluginInput, forUpdate = false) {
  if (!forUpdate) {
    if (!input.slug || typeof input.slug !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Plugin identifier is required.' })
    if (!input.name || typeof input.name !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Plugin name is required.' })
    if (!input.summary || typeof input.summary !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Plugin summary is required.' })
    if (!input.category || typeof input.category !== 'string' || !isPluginCategoryId(input.category))
      throw createError({ statusCode: 400, statusMessage: 'Plugin category is invalid.' })
    if (!input.readmeMarkdown || typeof input.readmeMarkdown !== 'string' || !input.readmeMarkdown.trim())
      throw createError({ statusCode: 400, statusMessage: 'Plugin README is required.' })
  }
  else {
    if (input.category && !isPluginCategoryId(input.category))
      throw createError({ statusCode: 400, statusMessage: 'Plugin category is invalid.' })
    if (input.readmeMarkdown !== undefined && input.readmeMarkdown !== null && !input.readmeMarkdown.trim())
      throw createError({ statusCode: 400, statusMessage: 'Plugin README cannot be empty.' })
  }

  if (input.slug) {
    const normalized = input.slug.trim()
    const slugPattern = /^[a-z0-9][a-z0-9\-_.]{1,62}[a-z0-9]$/
    if (!slugPattern.test(normalized))
      throw createError({ statusCode: 400, statusMessage: 'Plugin identifier must be 3-64 characters, lowercase, and may include numbers, dashes, underscores, or dots.' })
    input.slug = normalized
  }

  if (input.status) {
    const allowedStatuses: PluginStatus[] = ['draft', 'pending', 'approved', 'rejected']
    if (!allowedStatuses.includes(input.status))
      throw createError({ statusCode: 400, statusMessage: 'Plugin status is invalid.' })
  }

  if (input.homepage) {
    try {
      const url = new URL(input.homepage)
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Invalid protocol')
    }
    catch {
      throw createError({ statusCode: 400, statusMessage: 'Plugin homepage must be a valid URL.' })
    }
  }
}

function validateChannel(channel: string): asserts channel is PluginChannel {
  const allowed: PluginChannel[] = ['SNAPSHOT', 'BETA', 'RELEASE']
  if (!allowed.includes(channel as PluginChannel))
    throw createError({ statusCode: 400, statusMessage: 'Invalid plugin channel.' })
}

/**
 * Validate semantic version format (e.g., 1.0.0, 2.1.3-beta, 1.0.0-rc.1)
 * @param version - Version string to validate
 * @returns true if version follows semver format, false otherwise
 */
function validateSemanticVersion(version: string): boolean {
  // Standard semver pattern: major.minor.patch with optional pre-release and build metadata
  const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-z-][0-9a-z-]*))*))?(?:\+([0-9a-z-]+(?:\.[0-9a-z-]+)*))?$/i
  return semverPattern.test(version)
}

/**
 * Compare two semantic versions
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  // Extract major.minor.patch from version strings (ignore pre-release and build metadata)
  const normalize = (v: string) => v.split('-')[0].split('+')[0].split('.').map(Number)
  const parts1 = normalize(v1)
  const parts2 = normalize(v2)

  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i])
      return 1
    if (parts1[i] < parts2[i])
      return -1
  }
  return 0
}

async function ensureUniquePluginSlug(event: H3Event | undefined, slug: string, excludeId?: string) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    const existing = await db.prepare(`
      SELECT id
      FROM ${PLUGINS_TABLE}
      WHERE slug = ?1
      LIMIT 1;
    `).bind(slug).first<{ id: string }>()

    if (existing && existing.id !== excludeId)
      throw createError({ statusCode: 400, statusMessage: 'Plugin identifier is already in use.' })
    return
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const found = plugins.find(plugin => plugin.slug === slug && plugin.id !== excludeId)
  if (found)
    throw createError({ statusCode: 400, statusMessage: 'Plugin identifier is already in use.' })
}

function versionIsVisible(
  version: DashboardPluginVersion,
  plugin: DashboardPlugin,
  options: PluginVisibilityOptions,
): boolean {
  const viewerIsAdmin = Boolean(options.viewerIsAdmin)
  const isOwner = options.viewerId === plugin.userId

  if (options.forMarket)
    return version.status === 'approved'

  if (!viewerIsAdmin && !isOwner && version.status !== 'approved')
    return false

  if (version.channel !== 'BETA')
    return true

  if (viewerIsAdmin)
    return true

  if (isOwner)
    return true

  if (plugin.ownerOrgId && options.viewerOrgIds?.includes(plugin.ownerOrgId))
    return true

  return false
}

function selectLatestVisibleVersion(
  versions: DashboardPluginVersion[],
  plugin: DashboardPlugin,
  options: PluginVisibilityOptions,
): DashboardPluginVersion | undefined {
  const visible = versions.filter(version => versionIsVisible(version, plugin, options))
  if (!visible.length)
    return undefined

  const byChannelPriority = { RELEASE: 3, SNAPSHOT: 2, BETA: 1 } as const

  return visible
    .slice()
    .sort((a, b) => {
      const channelDiff = (byChannelPriority[b.channel] ?? 0) - (byChannelPriority[a.channel] ?? 0)
      if (channelDiff !== 0)
        return channelDiff
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })[0]
}

function pluginIsVisible(plugin: DashboardPlugin, options: PluginVisibilityOptions): boolean {
  if (options.statuses && options.statuses.length && !options.statuses.includes(plugin.status))
    return false

  if (options.forMarket)
    return plugin.status === 'approved'

  const viewerIsAdmin = Boolean(options.viewerIsAdmin)
  const isOwner = options.viewerId === plugin.userId

  if (viewerIsAdmin || isOwner)
    return true

  if (plugin.status === 'approved')
    return true

  if (plugin.status === 'pending' && plugin.ownerOrgId && options.viewerOrgIds?.includes(plugin.ownerOrgId))
    return true

  return false
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

async function readStoredPluginVersions(): Promise<DashboardPluginVersion[]> {
  const versions = await readCollection<DashboardPluginVersion>(PLUGIN_VERSIONS_KEY)
  return versions.map(version => sanitizeVersion({
    ...version,
    status: (version.status ?? 'pending') as PluginVersionStatus,
  }))
}

async function writeStoredPluginVersions(versions: DashboardPluginVersion[]) {
  await writeCollection(PLUGIN_VERSIONS_KEY, versions.map(sanitizeVersion))
}

async function countUserPluginsInDb(db: D1Database, userId: string) {
  const result = await db.prepare(`
    SELECT COUNT(*) as count
    FROM ${PLUGINS_TABLE}
    WHERE user_id = ?1;
  `).bind(userId).first<{ count: number }>()

  return Number(result?.count ?? 0)
}

async function checkUserPluginLimit(event: H3Event, userId: string) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    const count = await countUserPluginsInDb(db, userId)
    if (count >= MAX_PLUGINS_PER_USER) {
      throw createError({
        statusCode: 400,
        statusMessage: `Plugin limit reached (${MAX_PLUGINS_PER_USER}).`,
      })
    }
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const count = plugins.filter(plugin => plugin.userId === userId).length
    if (count >= MAX_PLUGINS_PER_USER) {
      throw createError({
        statusCode: 400,
        statusMessage: `Plugin limit reached (${MAX_PLUGINS_PER_USER}).`,
      })
    }
  }
}

async function ensureSubmissionCooldown(event: H3Event, userId: string) {
  const db = getD1Database(event)
  const now = Date.now()

  if (db) {
    await ensurePluginSchema(db)

    const row = await db.prepare(`
      SELECT created_at
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE created_by = ?1
      ORDER BY datetime(created_at) DESC
      LIMIT 1;
    `).bind(userId).first<{ created_at: string }>()

    if (row) {
      const last = new Date(row.created_at).getTime()
      if (!Number.isNaN(last) && now - last < SUBMISSION_COOLDOWN_MS) {
        throw createError({
          statusCode: 429,
          statusMessage: 'You are submitting too frequently. Please wait before publishing again.',
        })
      }
    }
  }
  else {
    const versions = await readStoredPluginVersions()
    const latest = versions
      .filter(version => version.createdBy === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

    if (latest) {
      const last = new Date(latest.createdAt).getTime()
      if (!Number.isNaN(last) && now - last < SUBMISSION_COOLDOWN_MS) {
        throw createError({
          statusCode: 429,
          statusMessage: 'You are submitting too frequently. Please wait before publishing again.',
        })
      }
    }
  }
}

export async function listPlugins(event: H3Event | undefined, options: PluginVisibilityOptions = {}): Promise<DashboardPlugin[]> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    let query = `
      SELECT
        id,
        user_id,
        owner_org_id,
        slug,
        name,
        summary,
        category,
        installs,
        homepage,
        is_official,
        badges,
        author,
        status,
        readme_markdown,
        icon,
        icon_key,
        icon_url,
        image_url,
        last_updated,
        version,
        created_at,
        updated_at,
        latest_version_id
      FROM ${PLUGINS_TABLE}`

    const bindings: unknown[] = []

    if (options.ownerId) {
      query += ` WHERE user_id = ?1`
      bindings.push(options.ownerId)
    }

    query += ` ORDER BY datetime(created_at) DESC;`

    const stmt = db.prepare(query)
    const { results } = bindings.length
      ? await stmt.bind(...bindings).all<D1PluginRow>()
      : await stmt.all<D1PluginRow>()

    const plugins = (results ?? []).map(mapPluginRow)
    const visiblePlugins = plugins.filter(plugin => pluginIsVisible(plugin, options))

    if (!options.includeVersions || !visiblePlugins.length)
      return visiblePlugins

    const ids = visiblePlugins.map(plugin => plugin.id)
    const placeholders = ids.map((_, idx) => `?${idx + 1}`).join(', ')

    const versionsQuery = `
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id IN (${placeholders})
      ORDER BY datetime(created_at) DESC;
    `

    const versionResults = await db.prepare(versionsQuery).bind(...ids).all<D1PluginVersionRow>()
    const versions = (versionResults.results ?? []).map(mapPluginVersionRow)

    const byPlugin = new Map<string, DashboardPluginVersion[]>()
    for (const version of versions) {
      if (!byPlugin.has(version.pluginId))
        byPlugin.set(version.pluginId, [])
      byPlugin.get(version.pluginId)!.push(version)
    }

    return visiblePlugins.map((plugin) => {
      const pluginVersions = byPlugin.get(plugin.id) ?? []
      const filtered = pluginVersions.filter(version => versionIsVisible(version, plugin, options))
      const latest = selectLatestVisibleVersion(pluginVersions, plugin, options)

      return {
        ...plugin,
        versions: filtered,
        latestVersionId: latest?.id ?? null,
      }
    })
  }

  const storedPlugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const normalized = storedPlugins.map(plugin => ({
    ...plugin,
    badges: Array.isArray(plugin.badges) ? plugin.badges : [],
    author: plugin.author ?? null,
    slug: plugin.slug ?? plugin.id,
    status: (plugin.status ?? 'draft') as PluginStatus,
  }))

  const plugins = normalized
    .filter(plugin => (options.ownerId ? plugin.userId === options.ownerId : true))
    .filter(plugin => pluginIsVisible(plugin, options))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  if (!options.includeVersions)
    return plugins

  const storedVersions = await readStoredPluginVersions()
  const byPlugin = new Map<string, DashboardPluginVersion[]>()

  for (const version of storedVersions) {
    if (!byPlugin.has(version.pluginId))
      byPlugin.set(version.pluginId, [])
    byPlugin.get(version.pluginId)!.push(version)
  }

  return plugins.map((plugin) => {
    const pluginVersions = (byPlugin.get(plugin.id) ?? [])
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const filtered = pluginVersions.filter(version => versionIsVisible(version, plugin, options))
    const latest = selectLatestVisibleVersion(pluginVersions, plugin, options)

    return {
      ...plugin,
      versions: filtered,
      latestVersionId: latest?.id ?? null,
    }
  })
}

export async function getPluginById(event: H3Event | undefined, id: string, options: PluginVisibilityOptions = {}) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    const row = await db.prepare(`
      SELECT *
      FROM ${PLUGINS_TABLE}
      WHERE id = ?1;
    `).bind(id).first<D1PluginRow>()

    if (!row)
      return null

    const plugin = mapPluginRow(row)

    if (!options.includeVersions)
      return plugin

    const versionResults = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1
      ORDER BY datetime(created_at) DESC;
    `).bind(id).all<D1PluginVersionRow>()

    const versions = (versionResults.results ?? []).map(mapPluginVersionRow)
    const filtered = versions.filter(version => versionIsVisible(version, plugin, options))
    const latest = selectLatestVisibleVersion(versions, plugin, options)

    return {
      ...plugin,
      versions: filtered,
      latestVersionId: latest?.id ?? null,
    }
  }

  const storedPlugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const normalized = storedPlugins.map(item => ({
    ...item,
    badges: Array.isArray(item.badges) ? item.badges : [],
    author: item.author ?? null,
  }))

  const plugin = normalized.find(item => item.id === id)

  if (!plugin)
    return null

  if (!options.includeVersions)
    return plugin

  const versions = await readStoredPluginVersions()
  const pluginVersions = versions
    .filter(version => version.pluginId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const filtered = pluginVersions.filter(version => versionIsVisible(version, plugin, options))
  const latest = selectLatestVisibleVersion(pluginVersions, plugin, options)

  return {
    ...plugin,
    versions: filtered,
    latestVersionId: latest?.id ?? null,
  }
}

export async function getPluginBySlug(event: H3Event | undefined, slug: string, options: PluginVisibilityOptions = {}) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    const row = await db.prepare(`
      SELECT id
      FROM ${PLUGINS_TABLE}
      WHERE slug = ?1
      LIMIT 1;
    `).bind(slug).first<{ id: string }>()

    if (!row)
      return null

    return getPluginById(event, row.id, options)
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const match = plugins.find(plugin => (plugin.slug ?? plugin.id) === slug)
  if (!match)
    return null

  return getPluginById(event, match.id, options)
}

export async function createPlugin(event: H3Event, input: CreatePluginInput & { userId: string, ownerOrgId?: string | null }) {
  validatePluginInput(input)
  await ensureUniquePluginSlug(event, input.slug)
  await checkUserPluginLimit(event, input.userId)

  const now = new Date().toISOString()
  const status: PluginStatus = input.status ?? 'draft'

  const plugin: DashboardPlugin = {
    id: randomUUID(),
    userId: input.userId,
    ownerOrgId: input.ownerOrgId ?? null,
    slug: input.slug,
    name: input.name,
    summary: input.summary,
    category: input.category,
    installs: 0,
    homepage: input.homepage ?? null,
    isOfficial: Boolean(input.isOfficial),
    badges: sanitizeBadges(input.badges),
    author: input.author ?? null,
    status,
    readmeMarkdown: input.readmeMarkdown ?? '',
    iconKey: input.iconKey ?? null,
    iconUrl: input.iconUrl ?? null,
    createdAt: now,
    updatedAt: now,
    latestVersionId: null,
  }

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      INSERT INTO ${PLUGINS_TABLE} (
        id,
        user_id,
        owner_org_id,
        name,
        summary,
        category,
        installs,
        homepage,
        icon,
        image_url,
        last_updated,
        version,
        is_official,
        badges,
        author,
        slug,
        status,
        readme_markdown,
        icon_key,
        icon_url,
        created_at,
        updated_at,
        latest_version_id
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?19, '', ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, NULL);
    `).bind(
      plugin.id,
      plugin.userId,
      plugin.ownerOrgId ?? null,
      plugin.name,
      plugin.summary,
      plugin.category,
      plugin.installs,
      plugin.homepage ?? null,
      plugin.iconKey ?? null,
      plugin.iconUrl ?? null,
      plugin.isOfficial ? 1 : 0,
      JSON.stringify(plugin.badges),
      plugin.author ? JSON.stringify(plugin.author) : null,
      plugin.slug,
      plugin.status,
      plugin.readmeMarkdown ?? null,
      plugin.iconKey ?? null,
      plugin.iconUrl ?? null,
      plugin.createdAt,
      plugin.updatedAt,
    ).run()

    return plugin
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  plugins.unshift(plugin)
  await writeCollection(PLUGINS_KEY, plugins)
  return plugin
}

export async function updatePlugin(event: H3Event, id: string, input: UpdatePluginInput) {
  const existing = await getPluginById(event, id)

  if (!existing)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  if (input.slug && input.slug !== existing.slug)
    throw createError({ statusCode: 400, statusMessage: 'Plugin identifier cannot be changed once created.' })

  const merged: CreatePluginInput & { userId: string, ownerOrgId?: string | null, slug: string } = {
    userId: existing.userId,
    ownerOrgId: input.ownerOrgId ?? existing.ownerOrgId ?? null,
    slug: existing.slug,
    name: input.name ?? existing.name,
    summary: input.summary ?? existing.summary,
    category: input.category ?? existing.category,
    homepage: input.homepage ?? existing.homepage ?? null,
    isOfficial: input.isOfficial ?? existing.isOfficial,
    badges: input.badges ?? existing.badges,
    author: input.author ?? existing.author ?? null,
    readmeMarkdown: input.readmeMarkdown ?? existing.readmeMarkdown ?? '',
    iconKey: input.iconKey === undefined ? existing.iconKey ?? null : input.iconKey,
    iconUrl: input.iconUrl === undefined ? existing.iconUrl ?? null : input.iconUrl,
    status: input.status ?? existing.status,
  }

  validatePluginInput(merged, true)

  const updated: DashboardPlugin = {
    ...existing,
    ...merged,
    badges: sanitizeBadges(merged.badges),
    readmeMarkdown: merged.readmeMarkdown ?? '',
    iconKey: merged.iconKey ?? null,
    iconUrl: merged.iconUrl ?? null,
    status: merged.status ?? existing.status,
    updatedAt: new Date().toISOString(),
  }

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET
        name = ?1,
        summary = ?2,
        category = ?3,
        homepage = ?4,
        is_official = ?5,
        badges = ?6,
        author = ?7,
        owner_org_id = ?8,
        status = ?9,
        readme_markdown = ?10,
        icon = ?11,
        image_url = ?12,
        icon_key = ?13,
        icon_url = ?14,
        updated_at = ?15
      WHERE id = ?16;
    `).bind(
      updated.name,
      updated.summary,
      updated.category,
      updated.homepage ?? null,
      updated.isOfficial ? 1 : 0,
      JSON.stringify(updated.badges),
      updated.author ? JSON.stringify(updated.author) : null,
      updated.ownerOrgId ?? null,
      updated.status,
      updated.readmeMarkdown ?? null,
      updated.iconKey ?? null,
      updated.iconUrl ?? null,
      updated.iconKey ?? null,
      updated.iconUrl ?? null,
      updated.updatedAt,
      updated.id,
    ).run()

    if (existing.iconKey && existing.iconKey !== updated.iconKey)
      await deleteImage(event, existing.iconKey)

    return updated
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const index = plugins.findIndex(plugin => plugin.id === id)

  if (index === -1)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  plugins[index] = updated
  await writeCollection(PLUGINS_KEY, plugins)

  if (existing.iconKey && existing.iconKey !== updated.iconKey)
    await deleteImage(event, existing.iconKey)

  return updated
}

/**
 * Update plugin icon (used when auto-extracting icon from tpex package)
 */
async function updatePluginIcon(event: H3Event, pluginId: string, iconKey: string, iconUrl: string) {
  const db = getD1Database(event)
  const now = new Date().toISOString()

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET
        icon_key = ?1,
        icon_url = ?2,
        updated_at = ?3
      WHERE id = ?4;
    `).bind(iconKey, iconUrl, now, pluginId).run()
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === pluginId)
    if (index !== -1) {
      plugins[index] = {
        ...plugins[index],
        iconKey,
        iconUrl,
        updatedAt: now,
      }
      await writeCollection(PLUGINS_KEY, plugins)
    }
  }
}

export async function deletePlugin(event: H3Event, id: string) {
  const plugin = await getPluginById(event, id, { includeVersions: true })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    const versionRows = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(id).all<D1PluginVersionRow>()

    const versions = (versionRows.results ?? []).map(mapPluginVersionRow)

    for (const version of versions) {
      await deletePluginPackage(event, version.packageKey)
      await deleteImage(event, version.iconKey)
    }

    await db.prepare(`
      DELETE FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(id).run()

    await db.prepare(`
      DELETE FROM ${PLUGINS_TABLE}
      WHERE id = ?1;
    `).bind(id).run()
    if (plugin.iconKey)
      await deleteImage(event, plugin.iconKey)
  }
  else {
    const versions = await readStoredPluginVersions()
    const remainingVersions = versions.filter(version => version.pluginId !== id)

    const orphaned = versions.filter(version => version.pluginId === id)
    for (const version of orphaned) {
      await deletePluginPackage(event, version.packageKey)
      await deleteImage(event, version.iconKey)
    }

    await writeStoredPluginVersions(remainingVersions)

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const pluginToDelete = plugins.find(item => item.id === id)
    await writeCollection(
      PLUGINS_KEY,
      plugins.filter(item => item.id !== id),
    )
    if (pluginToDelete?.iconKey)
      await deleteImage(event, pluginToDelete.iconKey)
  }

  return plugin
}

export async function setPluginStatus(event: H3Event, id: string, status: PluginStatus) {
  const plugin = await getPluginById(event, id)

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  if (plugin.status === status)
    return plugin

  const now = new Date().toISOString()
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET status = ?1, updated_at = ?2
      WHERE id = ?3;
    `).bind(status, now, id).run()
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === id)
    if (index === -1)
      throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })
    plugins[index] = {
      ...plugins[index],
      status,
      updatedAt: now,
    }
    await writeCollection(PLUGINS_KEY, plugins)
  }

  return {
    ...plugin,
    status,
    updatedAt: now,
  }
}

export async function setPluginVersionStatus(event: H3Event, pluginId: string, versionId: string, status: PluginVersionStatus) {
  const plugin = await getPluginById(event, pluginId, { includeVersions: true, viewerIsAdmin: true })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const version = (plugin.versions ?? []).find(item => item.id === versionId)

  if (!version)
    throw createError({ statusCode: 404, statusMessage: 'Version not found.' })

  if (version.status === status)
    return version

  const now = new Date().toISOString()
  const reviewedAt = status === 'approved' ? now : null
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)
    await db.prepare(`
      UPDATE ${PLUGIN_VERSIONS_TABLE}
      SET status = ?1, reviewed_at = ?2, updated_at = ?3
      WHERE id = ?4;
    `).bind(status, reviewedAt, now, versionId).run()
  }
  else {
    const versions = await readStoredPluginVersions()
    const index = versions.findIndex(item => item.id === versionId)
    if (index === -1)
      throw createError({ statusCode: 404, statusMessage: 'Version not found.' })
    versions[index] = {
      ...versions[index],
      status,
      reviewedAt,
      updatedAt: now,
    }
    await writeStoredPluginVersions(versions)
  }

  if (db) {
    const refreshed = await getPluginById(event, pluginId, {
      includeVersions: true,
      viewerIsAdmin: true,
    })

    if (refreshed) {
      const latest = selectLatestVisibleVersion(refreshed.versions ?? [], refreshed, {
        viewerIsAdmin: true,
      })

      await db.prepare(`
        UPDATE ${PLUGINS_TABLE}
        SET latest_version_id = ?1, updated_at = ?2
        WHERE id = ?3;
      `).bind(latest?.id ?? null, now, pluginId).run()
    }
  }
  else {
    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === pluginId)
    if (index !== -1) {
      const refreshed = await getPluginById(event, pluginId, {
        includeVersions: true,
        viewerIsAdmin: true,
      })
      const latest = selectLatestVisibleVersion(refreshed?.versions ?? [], refreshed ?? plugin, {
        viewerIsAdmin: true,
      })
      plugins[index] = {
        ...plugins[index],
        latestVersionId: latest?.id ?? plugins[index].latestVersionId ?? null,
        updatedAt: now,
      }
      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  return {
    ...version,
    status,
    reviewedAt,
    updatedAt: now,
  }
}

export async function publishPluginVersion(event: H3Event, input: PublishVersionInput) {
  validateChannel(input.channel)

  // Validate semantic version format
  if (!validateSemanticVersion(input.version)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Version must follow semantic versioning format (e.g., 1.0.0, 2.1.3-beta)',
    })
  }

  if (!input.changelog || !input.changelog.trim())
    throw createError({ statusCode: 400, statusMessage: 'Changelog is required.' })

  const plugin = await getPluginById(event, input.pluginId)

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const isCreator = plugin.userId === input.createdBy
  const canModerate = Boolean(input.canModerate)

  if (!isCreator && !canModerate)
    throw createError({ statusCode: 403, statusMessage: 'You cannot publish versions for this plugin.' })

  const pluginWithVersions = await getPluginById(event, plugin.id, {
    includeVersions: true,
    viewerId: input.createdBy,
    viewerOrgIds: plugin.ownerOrgId ? [plugin.ownerOrgId] : [],
    viewerIsAdmin: false,
  })
  const currentVersions = pluginWithVersions?.versions ?? []

  // Check for version downgrade and duplicates
  for (const existing of currentVersions) {
    // Check for exact duplicate
    if (existing.version === input.version) {
      throw createError({
        statusCode: 400,
        statusMessage: `Version ${input.version} already exists`,
      })
    }

    // Check for version downgrade
    const comparison = compareVersions(input.version, existing.version)
    if (comparison < 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Cannot downgrade version from ${existing.version} to ${input.version}`,
      })
    }
  }

  await ensureSubmissionCooldown(event, input.createdBy)

  const packageArrayBuffer = await input.packageFile.arrayBuffer()
  const packageBuffer = Buffer.from(packageArrayBuffer)
  const signature = await sha256Hex(packageBuffer)

  const metadata = await extractTpexMetadata(packageBuffer)

  // Auto-extract and upload icon from package if plugin doesn't have one
  let iconKey = plugin.iconKey ?? null
  let iconUrl = plugin.iconUrl ?? null

  if (!iconKey || !iconUrl) {
    // Try to extract icon from package
    if (metadata.iconBuffer && metadata.iconFileName && metadata.iconMimeType) {
      try {
        const iconResult = await uploadImageFromBuffer(
          event,
          metadata.iconBuffer,
          metadata.iconFileName,
          metadata.iconMimeType,
        )
        iconKey = iconResult.key
        iconUrl = iconResult.url

        // Update plugin with the new icon
        await updatePluginIcon(event, plugin.id, iconKey, iconUrl)
      }
      catch (err) {
        console.error('[publishPluginVersion] Failed to upload extracted icon:', err)
        throw createError({
          statusCode: 400,
          statusMessage: 'Failed to extract icon from package. Please ensure your package includes a valid icon file (SVG recommended).',
        })
      }
    }
    else {
      // No icon in package and plugin has no icon - reject
      throw createError({
        statusCode: 400,
        statusMessage: 'Plugin icon is required. Please include an icon file (icon.svg or logo.svg recommended) in your package, or set the "icon" field in manifest.json.',
      })
    }
  }

  const packageResult = await uploadPluginPackage(event, input.packageFile, packageArrayBuffer)

  const now = new Date().toISOString()
  const status: PluginVersionStatus = 'pending'
  const reviewedAt: string | null = null
  const rawVersion: DashboardPluginVersion = {
    id: randomUUID(),
    pluginId: plugin.id,
    createdBy: input.createdBy,
    channel: input.channel,
    version: input.version,
    signature,
    packageKey: packageResult.key,
    packageUrl: packageResult.url,
    packageSize: packageResult.size,
    iconKey,
    iconUrl,
    readmeMarkdown: metadata.readmeMarkdown ?? null,
    manifest: metadata.manifest ?? null,
    changelog: input.changelog,
    status,
    reviewedAt,
    createdAt: now,
    updatedAt: now,
  }
  const version = sanitizeVersion(rawVersion)

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    const existing = await db.prepare(`
      SELECT id FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE plugin_id = ?1 AND version = ?2 AND channel = ?3;
    `).bind(plugin.id, input.version, input.channel).first<{ id: string }>()

    if (existing)
      throw createError({ statusCode: 400, statusMessage: 'This version and channel have already been published.' })

    await db.prepare(`
      INSERT INTO ${PLUGIN_VERSIONS_TABLE} (
        id,
        plugin_id,
        created_by,
        channel,
        version,
        signature,
        package_key,
        package_url,
        package_size,
        icon_key,
        icon_url,
        readme_markdown,
        manifest,
        notes,
        status,
        reviewed_at,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18);
    `).bind(
      version.id,
      version.pluginId,
      version.createdBy,
      version.channel,
      version.version,
      version.signature,
      version.packageKey,
      version.packageUrl,
      version.packageSize,
      version.iconKey,
      version.iconUrl,
      version.readmeMarkdown ?? null,
      version.manifest ? JSON.stringify(version.manifest) : null,
      version.changelog ?? null,
      version.status,
      version.reviewedAt ?? null,
      version.createdAt,
      version.updatedAt,
    ).run()

    const latest = selectLatestVisibleVersion(
      [...currentVersions, version],
      { ...plugin, versions: currentVersions },
      { viewerId: plugin.userId, viewerOrgIds: plugin.ownerOrgId ? [plugin.ownerOrgId] : [], viewerIsAdmin: false },
    )

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET
        latest_version_id = ?1,
        updated_at = ?2
      WHERE id = ?3;
    `).bind(
      latest?.id ?? version.id,
      version.createdAt,
      plugin.id,
    ).run()
  }
  else {
    const versions = await readStoredPluginVersions()
    if (versions.some(item => item.pluginId === plugin.id && item.version === input.version && item.channel === input.channel)) {
      throw createError({ statusCode: 400, statusMessage: 'This version and channel have already been published.' })
    }

    const updatedVersions = [version, ...versions]
    await writeStoredPluginVersions(updatedVersions)

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === plugin.id)
    if (index !== -1) {
      const latest = selectLatestVisibleVersion(
        [...currentVersions, version],
        { ...plugin, versions: currentVersions },
        { viewerId: plugin.userId, viewerOrgIds: plugin.ownerOrgId ? [plugin.ownerOrgId] : [], viewerIsAdmin: false },
      )

      plugins[index] = {
        ...plugins[index],
        latestVersionId: latest?.id ?? version.id,
        updatedAt: version.createdAt,
      }

      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  if (!canModerate && plugin.status === 'draft')
    await setPluginStatus(event, plugin.id, 'pending')
  else if (canModerate && plugin.status !== 'approved')
    await setPluginStatus(event, plugin.id, 'approved')

  return version
}

export async function listPluginVersions(event: H3Event | undefined, pluginId: string, options: PluginVisibilityOptions = {}) {
  const plugin = await getPluginById(event, pluginId, { includeVersions: true, ...options })
  return plugin?.versions ?? []
}

export async function deletePluginVersion(event: H3Event, pluginId: string, versionId: string, options: { bypassOwnerCheck?: boolean } = {}) {
  const plugin = await getPluginById(event, pluginId, { includeVersions: true })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const version = (plugin.versions ?? []).find(item => item.id === versionId)

  if (!version)
    throw createError({ statusCode: 404, statusMessage: 'Version not found.' })

  if (!options.bypassOwnerCheck && version.createdBy !== plugin.userId)
    throw createError({ statusCode: 403, statusMessage: 'You cannot delete this version.' })

  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      DELETE FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE id = ?1;
    `).bind(version.id).run()

    await deletePluginPackage(event, version.packageKey)
    await deleteImage(event, version.iconKey)

    const latest = selectLatestVisibleVersion(
      (plugin.versions ?? []).filter(item => item.id !== version.id),
      plugin,
      { viewerId: plugin.userId, viewerOrgIds: plugin.ownerOrgId ? [plugin.ownerOrgId] : [], viewerIsAdmin: false },
    )

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET latest_version_id = ?1, updated_at = ?2
      WHERE id = ?3;
    `).bind(
      latest?.id ?? null,
      new Date().toISOString(),
      plugin.id,
    ).run()
  }
  else {
    const versions = await readStoredPluginVersions()
    const remaining = versions.filter(item => item.id !== version.id)
    await writeStoredPluginVersions(remaining)

    await deletePluginPackage(event, version.packageKey)
    await deleteImage(event, version.iconKey)

    const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
    const index = plugins.findIndex(item => item.id === plugin.id)
    if (index !== -1) {
      const remainingVersions = (plugin.versions ?? []).filter(item => item.id !== version.id)
      const latest = selectLatestVisibleVersion(
        remainingVersions,
        plugin,
        { viewerId: plugin.userId, viewerOrgIds: plugin.ownerOrgId ? [plugin.ownerOrgId] : [], viewerIsAdmin: false },
      )

      plugins[index] = {
        ...plugins[index],
        latestVersionId: latest?.id ?? null,
        updatedAt: new Date().toISOString(),
      }

      await writeCollection(PLUGINS_KEY, plugins)
    }
  }

  return version
}

export async function incrementPluginInstalls(event: H3Event, pluginId: string): Promise<number> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET installs = installs + 1
      WHERE id = ?1;
    `).bind(pluginId).run()

    const row = await db.prepare(`
      SELECT installs FROM ${PLUGINS_TABLE} WHERE id = ?1;
    `).bind(pluginId).first<{ installs: number }>()

    const installs = Number(row?.installs ?? 0)
    // region debug [H2]
    await dbgLog(
      'H2',
      'nexus/server/utils/pluginsStore.ts:incrementPluginInstalls',
      'increment installs (d1)',
      { pluginId, hasDb: true, installs },
    )
    // endregion
    return installs
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const index = plugins.findIndex(item => item.id === pluginId)

  if (index === -1)
    return 0

  plugins[index] = {
    ...plugins[index],
    installs: (plugins[index].installs ?? 0) + 1,
  }
  await writeCollection(PLUGINS_KEY, plugins)

  // region debug [H2]
  await dbgLog(
    'H2',
    'nexus/server/utils/pluginsStore.ts:incrementPluginInstalls',
    'increment installs (fallback)',
    { pluginId, hasDb: false, installs: plugins[index].installs },
  )
  // endregion
  return plugins[index].installs
}

export async function decrementPluginInstalls(event: H3Event, pluginId: string): Promise<number> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    await db.prepare(`
      UPDATE ${PLUGINS_TABLE}
      SET installs = MAX(0, installs - 1)
      WHERE id = ?1;
    `).bind(pluginId).run()

    const row = await db.prepare(`
      SELECT installs FROM ${PLUGINS_TABLE} WHERE id = ?1;
    `).bind(pluginId).first<{ installs: number }>()

    return Number(row?.installs ?? 0)
  }

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const index = plugins.findIndex(item => item.id === pluginId)

  if (index === -1)
    return 0

  plugins[index] = {
    ...plugins[index],
    installs: Math.max(0, (plugins[index].installs ?? 0) - 1),
  }
  await writeCollection(PLUGINS_KEY, plugins)

  return plugins[index].installs
}

export async function findVersionByPackageKey(event: H3Event, packageKey: string) {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginSchema(db)

    const versionRow = await db.prepare(`
      SELECT *
      FROM ${PLUGIN_VERSIONS_TABLE}
      WHERE package_key = ?1
      LIMIT 1;
    `).bind(packageKey).first<D1PluginVersionRow>()

    if (!versionRow)
      return null

    const pluginRow = await db.prepare(`
      SELECT *
      FROM ${PLUGINS_TABLE}
      WHERE id = ?1
      LIMIT 1;
    `).bind(versionRow.plugin_id).first<D1PluginRow>()

    if (!pluginRow)
      return null

    return {
      plugin: mapPluginRow(pluginRow),
      version: mapPluginVersionRow(versionRow),
    }
  }

  const versions = await readStoredPluginVersions()
  const version = versions.find(item => item.packageKey === packageKey)

  if (!version)
    return null

  const plugins = await readCollection<DashboardPlugin>(PLUGINS_KEY)
  const plugin = plugins.find(item => item.id === version.pluginId)

  if (!plugin)
    return null

  return {
    plugin,
    version,
  }
}
