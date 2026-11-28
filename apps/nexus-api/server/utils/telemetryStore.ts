import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHash, randomUUID } from 'node:crypto'
import { createError, getHeader } from 'h3'
import { getUserById } from './authStore'
import { readCloudflareBindings, shouldUseCloudflareBindings } from './cloudflare'
import { defineD1Schema, ensureD1Schema } from './d1Schema'
import { resolveRequestGeo } from './requestGeo'
import { resolveRequestIp } from './requestIp'
import { resolveTelemetryUserId } from './telemetryIdentity'
import { isPlainObject, normalizeNumber, normalizeString } from './telemetrySanitizer'

const TELEMETRY_TABLE = 'telemetry_events'
const DAILY_STATS_TABLE = 'daily_stats'
const TELEMETRY_RECEIPTS_TABLE = 'telemetry_batch_receipts'
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const MAX_BATCH_EVENTS = 100
const RECEIPT_RETENTION_DAYS = 14

export type CanonicalTelemetryEventType = 'app_launch' | 'feature_use' | 'plugin_action' | 'error'

const CANONICAL_EVENT_TYPES = new Set<CanonicalTelemetryEventType>([
  'app_launch',
  'feature_use',
  'plugin_action',
  'error',
])

const SKIPPED_NOISE_EVENT_TYPES = new Set(['performance'])

export interface TelemetryIngestItemInput {
  eventType?: unknown
  userId?: unknown
  clientId?: unknown
  deviceFingerprint?: unknown
  platform?: unknown
  arch?: unknown
  version?: unknown
  channel?: unknown
  region?: unknown
  feature?: unknown
  pluginId?: unknown
  errorCode?: unknown
  searchDurationMs?: unknown
  searchResultCount?: unknown
  metadata?: unknown
  isAnonymous?: unknown
}

export interface NormalizedIngestEvent {
  eventType: CanonicalTelemetryEventType
  userId: string | null
  clientId: string | null
  deviceFingerprint: string | null
  platform: string | null
  arch: string | null
  version: string | null
  channel: string
  countryCode: string | null
  feature: string | null
  pluginId: string | null
  isAnonymous: boolean
  metadata: Record<string, unknown> | null
}

export interface TelemetryIngestSummary {
  success: true
  accepted: number
  rejected: number
  skipped: number
  duplicate: boolean
  processed: number
  dropped: number
}

const TELEMETRY_SCHEMA = defineD1Schema('telemetry-v2', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${TELEMETRY_TABLE} (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT,
      client_id TEXT,
      device_fingerprint TEXT,
      platform TEXT,
      arch TEXT,
      version TEXT,
      channel TEXT,
      region TEXT,
      country_code TEXT,
      feature TEXT,
      plugin_id TEXT,
      ip TEXT,
      metadata TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${DAILY_STATS_TABLE} (
      date TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      stat_key TEXT NOT NULL DEFAULT '',
      value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, stat_type, stat_key)
    )`,
    `CREATE TABLE IF NOT EXISTS ${TELEMETRY_RECEIPTS_TABLE} (
      scope TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (scope, idempotency_key)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_telemetry_event_geo ON ${TELEMETRY_TABLE}(event_type, created_at, country_code)`,
  ],
  columns: [
    {
      table: TELEMETRY_TABLE,
      columns: [
        { name: 'arch', ddl: 'arch TEXT' },
        { name: 'channel', ddl: 'channel TEXT' },
        { name: 'country_code', ddl: 'country_code TEXT' },
        { name: 'feature', ddl: 'feature TEXT' },
        { name: 'plugin_id', ddl: 'plugin_id TEXT' },
        { name: 'client_id', ddl: 'client_id TEXT' },
        { name: 'ip', ddl: 'ip TEXT' },
      ],
    },
  ],
})

function getD1Database(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

function stableSerialize(value: unknown): string {
  if (value === null || value === undefined)
    return 'null'
  if (typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(entry => (entry === undefined ? 'null' : stableSerialize(entry))).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
}

export function normalizeTelemetryIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return IDEMPOTENCY_KEY_PATTERN.test(trimmed) ? trimmed : null
}

export function digestTelemetryPayload(payload: unknown): string {
  return createHash('sha256').update(stableSerialize(payload)).digest('hex')
}

function inferChannel(rawChannel: unknown, version: string | null): string {
  const explicit = normalizeString(rawChannel, 32)?.toUpperCase()
  if (explicit === 'RELEASE' || explicit === 'BETA' || explicit === 'SNAPSHOT')
    return explicit
  if (version) {
    const lower = version.toLowerCase()
    if (lower.includes('snapshot') || lower.includes('nightly') || lower.includes('canary'))
      return 'SNAPSHOT'
    if (lower.includes('beta') || lower.includes('alpha') || lower.includes('rc'))
      return 'BETA'
  }
  return 'RELEASE'
}

function sanitizeCompactMetadata(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw))
    return null
  const redacted = new Set(['query', 'queryText', 'searchQuery', 'searchTerm', 'keyword', 'text', 'token', 'secret', 'password'])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw).slice(0, 24)) {
    const cleanKey = normalizeString(key, 64)
    if (!cleanKey || redacted.has(cleanKey))
      continue
    if (typeof value === 'string') {
      const cleanVal = normalizeString(value, 180)
      if (cleanVal)
        out[cleanKey] = cleanVal
    }
    else if (typeof value === 'number' && Number.isFinite(value)) {
      out[cleanKey] = value
    }
    else if (typeof value === 'boolean') {
      out[cleanKey] = value
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function normalizeEventType(rawType: unknown): {
  kind: 'accepted'
  eventType: CanonicalTelemetryEventType
  legacySource?: 'visit' | 'search'
} | {
  kind: 'skipped'
  reason: string
} | {
  kind: 'rejected'
  reason: string
} {
  if (typeof rawType !== 'string')
    return { kind: 'rejected', reason: 'invalid_event_type' }
  const normalized = rawType.trim().toLowerCase()
  if (CANONICAL_EVENT_TYPES.has(normalized as CanonicalTelemetryEventType))
    return { kind: 'accepted', eventType: normalized as CanonicalTelemetryEventType }
  if (normalized === 'visit')
    return { kind: 'accepted', eventType: 'app_launch', legacySource: 'visit' }
  if (normalized === 'search')
    return { kind: 'accepted', eventType: 'feature_use', legacySource: 'search' }
  if (SKIPPED_NOISE_EVENT_TYPES.has(normalized))
    return { kind: 'skipped', reason: 'low_value_event' }
  return { kind: 'rejected', reason: 'unsupported_event_type' }
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed|PRIMARY KEY constraint failed|SQLITE_CONSTRAINT/i.test(message)
}

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /no such table/i.test(message)
}

interface DailyDelta {
  date: string
  statType: string
  statKey: string
  value: number
}

function mergeDailyDelta(map: Map<string, DailyDelta>, date: string, statType: string, statKey: string, delta = 1) {
  const key = `${date}\u0000${statType}\u0000${statKey}`
  const existing = map.get(key)
  if (existing) {
    existing.value += delta
    return
  }
  map.set(key, { date, statType, statKey, value: delta })
}

function extractSingleEventIdempotencyKey(event: H3Event, raw: TelemetryIngestItemInput): string | null {
  const headerKey = normalizeTelemetryIdempotencyKey(getHeader(event, 'x-idempotency-key'))
  if (headerKey)
    return headerKey
  if (isPlainObject(raw.metadata))
    return normalizeTelemetryIdempotencyKey(raw.metadata.idempotencyKey)
  return null
}

async function resolvePrivacyPolicy(event: H3Event, userId: string | null) {
  if (!userId)
    return { analytics: true, crashReports: true, usageData: true }
  const user = await getUserById(event, userId).catch(() => null)
  if (!user)
    return { analytics: true, crashReports: true, usageData: true }
  return {
    analytics: user.privacySettings.analytics !== false,
    crashReports: user.privacySettings.crashReports !== false,
    usageData: user.privacySettings.usageData !== false,
  }
}

function isAllowedByPrivacy(
  eventType: CanonicalTelemetryEventType,
  policy: { analytics: boolean, crashReports: boolean, usageData: boolean },
): boolean {
  if (eventType === 'error')
    return policy.crashReports
  if (eventType === 'feature_use' || eventType === 'plugin_action')
    return policy.analytics && policy.usageData
  return policy.analytics
}

export async function ingestTelemetryEvents(
  event: H3Event,
  rawBody: unknown,
  options: {
    scope: 'ingest' | 'record' | 'batch'
    requireIdempotencyKey?: boolean
  } = { scope: 'ingest' },
): Promise<TelemetryIngestSummary> {
  if (!rawBody || typeof rawBody !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Telemetry payload must be a JSON object.' })
  }

  const bodyObj = rawBody as Record<string, unknown>
  const isBatchShape = Array.isArray(bodyObj.events)
  if (options.scope === 'batch' && !isBatchShape) {
    throw createError({ statusCode: 400, statusMessage: 'events array is required.' })
  }

  const rawEvents: TelemetryIngestItemInput[] = isBatchShape
    ? (bodyObj.events as TelemetryIngestItemInput[])
    : [bodyObj as TelemetryIngestItemInput]

  if (rawEvents.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'At least one telemetry event is required.' })
  }
  if (rawEvents.length > MAX_BATCH_EVENTS) {
    throw createError({ statusCode: 400, statusMessage: `Maximum ${MAX_BATCH_EVENTS} events per request.` })
  }

  const headerIdempotencyKey = normalizeTelemetryIdempotencyKey(getHeader(event, 'x-idempotency-key'))
  const rawHeaderKey = getHeader(event, 'x-idempotency-key')
  if (rawHeaderKey && !headerIdempotencyKey) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid X-Idempotency-Key header.' })
  }
  if (options.requireIdempotencyKey && !headerIdempotencyKey) {
    throw createError({ statusCode: 400, statusMessage: 'X-Idempotency-Key header is required.' })
  }

  const idempotencyKey = headerIdempotencyKey
    ?? (!isBatchShape && rawEvents[0] ? extractSingleEventIdempotencyKey(event, rawEvents[0]) : null)

  const db = getD1Database(event)
  if (!db) {
    if (shouldUseCloudflareBindings())
      console.warn('[telemetryStore] D1 database binding is unavailable.')
    return {
      success: true,
      accepted: 0,
      rejected: 0,
      skipped: 0,
      duplicate: false,
      processed: 0,
      dropped: rawEvents.length,
    }
  }

  await ensureD1Schema(db, TELEMETRY_SCHEMA)

  const receiptScope = `telemetry:${options.scope}`
  const payloadHash = idempotencyKey ? digestTelemetryPayload(rawBody) : null

  if (idempotencyKey && payloadHash) {
    const existing = await db.prepare(`
      SELECT payload_hash, response_json
      FROM ${TELEMETRY_RECEIPTS_TABLE}
      WHERE scope = ?1 AND idempotency_key = ?2
      LIMIT 1
    `).bind(receiptScope, idempotencyKey).first<{ payload_hash: string, response_json: string }>()

    if (existing) {
      if (existing.payload_hash !== payloadHash) {
        throw createError({
          statusCode: 409,
          statusMessage: 'X-Idempotency-Key was already used with a different payload.',
        })
      }
      const cached = JSON.parse(existing.response_json) as TelemetryIngestSummary
      return {
        ...cached,
        duplicate: true,
      }
    }
  }

  // Verified caller identity only — never trust body.userId (#901).
  const verifiedUserId = await resolveTelemetryUserId(event)
  const privacy = await resolvePrivacyPolicy(event, verifiedUserId)
  const geo = resolveRequestGeo(event)
  const ip = resolveRequestIp(event) || null
  const now = new Date()
  const nowIso = now.toISOString()
  const today = nowIso.slice(0, 10)

  const rowStatements: D1PreparedStatement[] = []
  const dailyDeltas = new Map<string, DailyDelta>()
  let accepted = 0
  let rejected = 0
  let skipped = 0

  for (const item of rawEvents) {
    if (!item || typeof item !== 'object') {
      rejected += 1
      continue
    }

    const typeResult = normalizeEventType(item.eventType)
    if (typeResult.kind === 'rejected') {
      rejected += 1
      continue
    }
    if (typeResult.kind === 'skipped') {
      skipped += 1
      continue
    }

    if (!isAllowedByPrivacy(typeResult.eventType, privacy)) {
      skipped += 1
      continue
    }

    const meta = sanitizeCompactMetadata(item.metadata) ?? {}
    const version = normalizeString(item.version, 64) ?? null
    const platform = normalizeString(item.platform, 32)?.toLowerCase() ?? null
    const arch = normalizeString(item.arch ?? meta.arch, 32)?.toLowerCase() ?? null
    const channel = inferChannel(item.channel ?? meta.channel, version)
    const countryCode = geo.countryCode || normalizeString(item.region, 8)?.toUpperCase() || null
    const clientId = normalizeString(item.clientId, 128) ?? null
    const deviceFingerprint = normalizeString(item.deviceFingerprint, 128) ?? null
    const isAnonymous = verifiedUserId ? item.isAnonymous === true : true
    const attributedUserId = isAnonymous ? null : verifiedUserId

    const pluginId = normalizeString(item.pluginId ?? meta.pluginId ?? meta.pluginName, 128) ?? null
    const feature = typeResult.legacySource === 'search'
      ? 'search'
      : normalizeString(
          item.feature ?? meta.feature ?? meta.featureId ?? meta.sourceType ?? meta.action,
          128,
        ) ?? null

    if (typeResult.legacySource === 'search') {
      const dur = normalizeNumber(item.searchDurationMs, { min: 0, max: 300_000 })
      const count = normalizeNumber(item.searchResultCount, { min: 0, max: 100_000 })
      if (dur !== undefined)
        meta.searchDurationMs = Math.round(dur)
      if (count !== undefined)
        meta.searchResultCount = Math.round(count)
    }

    if (typeResult.eventType === 'error') {
      const errCode = normalizeString(item.errorCode ?? meta.errorCode ?? meta.code, 96)
      if (errCode)
        meta.errorCode = errCode
    }

    const serializedMeta = Object.keys(meta).length > 0 ? JSON.stringify(meta) : null

    rowStatements.push(
      db.prepare(`
        INSERT INTO ${TELEMETRY_TABLE} (
          id, event_type, user_id, client_id, device_fingerprint,
          platform, arch, version, channel, region, country_code,
          feature, plugin_id, ip, metadata, is_anonymous, created_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17
        )
      `).bind(
        randomUUID(),
        typeResult.eventType,
        attributedUserId,
        clientId,
        deviceFingerprint,
        platform,
        arch,
        version,
        channel,
        countryCode,
        countryCode,
        feature,
        pluginId,
        ip,
        serializedMeta,
        isAnonymous ? 1 : 0,
        nowIso,
      ),
    )

    mergeDailyDelta(dailyDeltas, today, `event:${typeResult.eventType}`, '', 1)
    if (feature)
      mergeDailyDelta(dailyDeltas, today, 'feature', feature, 1)
    if (pluginId && (typeResult.eventType === 'plugin_action' || typeResult.eventType === 'feature_use'))
      mergeDailyDelta(dailyDeltas, today, 'plugin_action', pluginId, 1)

    accepted += 1
  }

  const summary: TelemetryIngestSummary = {
    success: true,
    accepted,
    rejected,
    skipped,
    duplicate: false,
    processed: accepted,
    dropped: rejected + skipped,
  }

  const dailyStatements = [...dailyDeltas.values()].map(delta =>
    db.prepare(`
      INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
      VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = value + ?4
    `).bind(delta.date, delta.statType, delta.statKey, delta.value),
  )

  const receiptStatements: D1PreparedStatement[] = []
  if (idempotencyKey && payloadHash) {
    const expiresAt = new Date(now.getTime() + RECEIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    receiptStatements.push(
      db.prepare(`
        INSERT INTO ${TELEMETRY_RECEIPTS_TABLE} (
          scope, idempotency_key, payload_hash, response_json, created_at, expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      `).bind(
        receiptScope,
        idempotencyKey,
        payloadHash,
        JSON.stringify(summary),
        nowIso,
        expiresAt,
      ),
    )
  }

  const allStatements = [...rowStatements, ...dailyStatements, ...receiptStatements]
  if (allStatements.length > 0) {
    try {
      await db.batch(allStatements)
    }
    catch (error) {
      // Handle concurrent duplicate race atomically rolled back by D1 batch
      if (idempotencyKey && payloadHash && isUniqueConstraintError(error)) {
        const winner = await db.prepare(`
          SELECT payload_hash, response_json
          FROM ${TELEMETRY_RECEIPTS_TABLE}
          WHERE scope = ?1 AND idempotency_key = ?2
          LIMIT 1
        `).bind(receiptScope, idempotencyKey).first<{ payload_hash: string, response_json: string }>()
        if (winner) {
          if (winner.payload_hash !== payloadHash) {
            throw createError({
              statusCode: 409,
              statusMessage: 'X-Idempotency-Key was already used with a different payload.',
            })
          }
          const cached = JSON.parse(winner.response_json) as TelemetryIngestSummary
          return { ...cached, duplicate: true }
        }
      }
      throw error
    }
  }

  return summary
}

export interface AdminUsageAnalyticsPayload {
  days: number
  since: string
  generatedAt: string
  activeUsers: {
    dau: number
    wau: number
    mau: number
    activeDevices: number
    totalRegisteredUsers: number
    dailySeries: Array<{
      date: string
      dau: number
      launches: number
      errors: number
    }>
  }
  distribution: {
    versions: Array<{ version: string, channel: string, count: number, uniqueClients: number }>
    platforms: Array<{ platform: string, arch: string, count: number, uniqueClients: number }>
  }
  regions: Array<{ countryCode: string, count: number, uniqueClients: number }>
  topFeatures: Array<{ feature: string, count: number, uniqueClients: number }>
  ecosystem: {
    topPlugins: Array<{ pluginId: string, name: string, installs: number, actions: number }>
    aiGateway: {
      totalRequests: number
      successCount: number
      errorCount: number
      successRate: number
      avgLatencyMs: number
      totalTokens: number
      byModel: Array<{ model: string, requests: number, successRate: number, avgLatencyMs: number, totalTokens: number }>
      byProvider: Array<{ providerId: string, providerType: string, requests: number, successRate: number, avgLatencyMs: number, totalTokens: number }>
    }
  }
  stability: {
    totalErrors: number
    totalLaunches: number
    errorRate: number
    byVersion: Array<{ version: string, errors: number, launches: number, errorRate: number }>
  }
}

async function safeAll<T>(stmt: D1PreparedStatement): Promise<T[]> {
  try {
    const { results } = await stmt.all<T>()
    return results ?? []
  }
  catch (error) {
    if (isMissingTableError(error))
      return []
    throw error
  }
}

async function safeFirst<T>(stmt: D1PreparedStatement): Promise<T | null> {
  try {
    return (await stmt.first<T>()) ?? null
  }
  catch (error) {
    if (isMissingTableError(error))
      return null
    throw error
  }
}

/**
 * Single SQL-aggregated boss analytics query covering all 6 usage dimensions.
 * Every aggregation uses D1 SQL GROUP BY / COUNT(DISTINCT ...) — zero in-memory row scans.
 */
export async function getAdminUsageAnalytics(
  event: H3Event,
  options: { days?: number } = {},
): Promise<AdminUsageAnalyticsPayload> {
  const days = Math.min(Math.max(Math.floor(options.days ?? 30) || 30, 1), 365)
  const now = new Date()
  const nowMs = now.getTime()
  const since = new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString()
  const since1d = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const since7d = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
  const since30d = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString()

  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 503, statusMessage: 'Database not available' })
  }

  await ensureD1Schema(db, TELEMETRY_SCHEMA)

  const actorExpr = `COALESCE(NULLIF(user_id, ''), NULLIF(client_id, ''), NULLIF(device_fingerprint, ''))`
  const deviceExpr = `COALESCE(NULLIF(client_id, ''), NULLIF(device_fingerprint, ''))`
  const launchTypes = `'app_launch', 'visit'`
  const featureTypes = `'feature_use', 'search'`

  const [
    activeRow,
    registeredUsersRow,
    dailyRows,
    versionRows,
    platformRows,
    regionRows,
    featureRows,
    pluginInstallRows,
    pluginActionRows,
    aiTotalsRow,
    aiModelRows,
    aiProviderRows,
    stabilityRows,
  ] = await Promise.all([
    // 1a. DAU / WAU / MAU & active devices
    safeFirst<{ dau: number, wau: number, mau: number, active_devices: number }>(
      db.prepare(`
        SELECT
          COUNT(DISTINCT CASE WHEN created_at >= ?1 THEN ${actorExpr} END) AS dau,
          COUNT(DISTINCT CASE WHEN created_at >= ?2 THEN ${actorExpr} END) AS wau,
          COUNT(DISTINCT CASE WHEN created_at >= ?3 THEN ${actorExpr} END) AS mau,
          COUNT(DISTINCT CASE WHEN created_at >= ?4 THEN ${deviceExpr} END) AS active_devices
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= CASE WHEN ?4 < ?3 THEN ?4 ELSE ?3 END
      `).bind(since1d, since7d, since30d, since),
    ),
    // 1b. Total registered active users
    safeFirst<{ total: number }>(
      db.prepare(`SELECT COUNT(*) AS total FROM auth_users WHERE status = 'active'`),
    ),
    // 1c. Daily series
    safeAll<{ date: string, dau: number, launches: number, errors: number }>(
      db.prepare(`
        SELECT
          substr(created_at, 1, 10) AS date,
          COUNT(DISTINCT ${actorExpr}) AS dau,
          SUM(CASE WHEN event_type IN (${launchTypes}) THEN 1 ELSE 0 END) AS launches,
          SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) AS errors
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= ?1
        GROUP BY substr(created_at, 1, 10)
        ORDER BY date ASC
      `).bind(since),
    ),
    // 2a. Version / channel distribution
    safeAll<{ version: string, channel: string, count: number, unique_clients: number }>(
      db.prepare(`
        SELECT
          COALESCE(NULLIF(version, ''), 'unknown') AS version,
          COALESCE(NULLIF(channel, ''), 'RELEASE') AS channel,
          COUNT(*) AS count,
          COUNT(DISTINCT ${deviceExpr}) AS unique_clients
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= ?1 AND event_type IN (${launchTypes})
        GROUP BY COALESCE(NULLIF(version, ''), 'unknown'), COALESCE(NULLIF(channel, ''), 'RELEASE')
        ORDER BY unique_clients DESC, count DESC
        LIMIT 30
      `).bind(since),
    ),
    // 2b. OS / arch distribution
    safeAll<{ platform: string, arch: string, count: number, unique_clients: number }>(
      db.prepare(`
        SELECT
          COALESCE(NULLIF(platform, ''), 'unknown') AS platform,
          COALESCE(NULLIF(arch, ''), 'unknown') AS arch,
          COUNT(*) AS count,
          COUNT(DISTINCT ${deviceExpr}) AS unique_clients
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= ?1 AND event_type IN (${launchTypes})
        GROUP BY COALESCE(NULLIF(platform, ''), 'unknown'), COALESCE(NULLIF(arch, ''), 'unknown')
        ORDER BY unique_clients DESC, count DESC
        LIMIT 30
      `).bind(since),
    ),
    // 3. Country/region Top 20 from cf.country
    safeAll<{ country_code: string, count: number, unique_clients: number }>(
      db.prepare(`
        SELECT
          COALESCE(NULLIF(country_code, ''), NULLIF(region, ''), 'UNKNOWN') AS country_code,
          COUNT(*) AS count,
          COUNT(DISTINCT ${deviceExpr}) AS unique_clients
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= ?1
        GROUP BY COALESCE(NULLIF(country_code, ''), NULLIF(region, ''), 'UNKNOWN')
        ORDER BY unique_clients DESC, count DESC
        LIMIT 20
      `).bind(since),
    ),
    // 4. Top feature usage
    safeAll<{ feature: string, count: number, unique_clients: number }>(
      db.prepare(`
        SELECT
          COALESCE(NULLIF(feature, ''), event_type) AS feature,
          COUNT(*) AS count,
          COUNT(DISTINCT ${actorExpr}) AS unique_clients
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= ?1 AND event_type IN (${featureTypes})
        GROUP BY COALESCE(NULLIF(feature, ''), event_type)
        ORDER BY count DESC
        LIMIT 20
      `).bind(since),
    ),
    // 5a. Top plugin installs from store table
    safeAll<{ slug: string, name: string, installs: number }>(
      db.prepare(`
        SELECT slug, name, COALESCE(installs, 0) AS installs
        FROM plugins
        WHERE status = 'approved'
        ORDER BY installs DESC
        LIMIT 20
      `),
    ),
    // 5b. Plugin action counts from telemetry
    safeAll<{ plugin_id: string, actions: number }>(
      db.prepare(`
        SELECT plugin_id, COUNT(*) AS actions
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= ?1 AND plugin_id IS NOT NULL AND plugin_id != ''
        GROUP BY plugin_id
        ORDER BY actions DESC
        LIMIT 30
      `).bind(since),
    ),
    // 5c. AI Gateway totals (SQL GROUP BY — never in-memory scan)
    safeFirst<{
      total_requests: number
      success_count: number
      avg_latency_ms: number
      total_tokens: number
    }>(
      db.prepare(`
        SELECT
          COUNT(*) AS total_requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          AVG(COALESCE(latency, 0)) AS avg_latency_ms,
          SUM(COALESCE(
            CAST(json_extract(metadata, '$.tokens') AS INTEGER),
            CAST(json_extract(metadata, '$.totalTokens') AS INTEGER),
            CAST(json_extract(metadata, '$.usage.totalTokens') AS INTEGER),
            0
          )) AS total_tokens
        FROM intelligence_audits
        WHERE created_at >= ?1
      `).bind(since),
    ),
    // 5d. AI Gateway by model
    safeAll<{
      model: string
      requests: number
      success_count: number
      avg_latency_ms: number
      total_tokens: number
    }>(
      db.prepare(`
        SELECT
          COALESCE(NULLIF(model, ''), 'unknown') AS model,
          COUNT(*) AS requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          AVG(COALESCE(latency, 0)) AS avg_latency_ms,
          SUM(COALESCE(
            CAST(json_extract(metadata, '$.tokens') AS INTEGER),
            CAST(json_extract(metadata, '$.totalTokens') AS INTEGER),
            CAST(json_extract(metadata, '$.usage.totalTokens') AS INTEGER),
            0
          )) AS total_tokens
        FROM intelligence_audits
        WHERE created_at >= ?1
        GROUP BY COALESCE(NULLIF(model, ''), 'unknown')
        ORDER BY requests DESC
        LIMIT 20
      `).bind(since),
    ),
    // 5e. AI Gateway by provider
    safeAll<{
      provider_id: string
      provider_type: string
      requests: number
      success_count: number
      avg_latency_ms: number
      total_tokens: number
    }>(
      db.prepare(`
        SELECT
          COALESCE(NULLIF(provider_id, ''), 'unknown') AS provider_id,
          COALESCE(NULLIF(provider_type, ''), 'unknown') AS provider_type,
          COUNT(*) AS requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS success_count,
          AVG(COALESCE(latency, 0)) AS avg_latency_ms,
          SUM(COALESCE(
            CAST(json_extract(metadata, '$.tokens') AS INTEGER),
            CAST(json_extract(metadata, '$.totalTokens') AS INTEGER),
            CAST(json_extract(metadata, '$.usage.totalTokens') AS INTEGER),
            0
          )) AS total_tokens
        FROM intelligence_audits
        WHERE created_at >= ?1
        GROUP BY COALESCE(NULLIF(provider_id, ''), 'unknown'), COALESCE(NULLIF(provider_type, ''), 'unknown')
        ORDER BY requests DESC
        LIMIT 20
      `).bind(since),
    ),
    // 6. Stability / error rate by version
    safeAll<{ version: string, errors: number, launches: number }>(
      db.prepare(`
        SELECT
          COALESCE(NULLIF(version, ''), 'unknown') AS version,
          SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END) AS errors,
          SUM(CASE WHEN event_type IN (${launchTypes}) THEN 1 ELSE 0 END) AS launches
        FROM ${TELEMETRY_TABLE}
        WHERE created_at >= ?1 AND event_type IN ('error', ${launchTypes})
        GROUP BY COALESCE(NULLIF(version, ''), 'unknown')
        ORDER BY errors DESC, launches DESC
        LIMIT 30
      `).bind(since),
    ),
  ])

  const actionByPlugin = new Map<string, number>()
  for (const row of pluginActionRows)
    actionByPlugin.set(row.plugin_id, Number(row.actions ?? 0))

  const pluginMap = new Map<string, { pluginId: string, name: string, installs: number, actions: number }>()
  for (const row of pluginInstallRows) {
    pluginMap.set(row.slug, {
      pluginId: row.slug,
      name: row.name,
      installs: Number(row.installs ?? 0),
      actions: actionByPlugin.get(row.slug) ?? 0,
    })
  }
  for (const [pluginId, actions] of actionByPlugin.entries()) {
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        pluginId,
        name: pluginId,
        installs: 0,
        actions,
      })
    }
  }
  const topPlugins = [...pluginMap.values()]
    .sort((a, b) => (b.installs - a.installs) || (b.actions - a.actions))
    .slice(0, 20)

  const totalAiRequests = Number(aiTotalsRow?.total_requests ?? 0)
  const successAiCount = Number(aiTotalsRow?.success_count ?? 0)
  const totalErrors = stabilityRows.reduce((sum, row) => sum + Number(row.errors ?? 0), 0)
  const totalLaunches = stabilityRows.reduce((sum, row) => sum + Number(row.launches ?? 0), 0)

  return {
    days,
    since,
    generatedAt: now.toISOString(),
    activeUsers: {
      dau: Number(activeRow?.dau ?? 0),
      wau: Number(activeRow?.wau ?? 0),
      mau: Number(activeRow?.mau ?? 0),
      activeDevices: Number(activeRow?.active_devices ?? 0),
      totalRegisteredUsers: Number(registeredUsersRow?.total ?? 0),
      dailySeries: dailyRows.map(row => ({
        date: row.date,
        dau: Number(row.dau ?? 0),
        launches: Number(row.launches ?? 0),
        errors: Number(row.errors ?? 0),
      })),
    },
    distribution: {
      versions: versionRows.map(row => ({
        version: row.version,
        channel: row.channel,
        count: Number(row.count ?? 0),
        uniqueClients: Number(row.unique_clients ?? 0),
      })),
      platforms: platformRows.map(row => ({
        platform: row.platform,
        arch: row.arch,
        count: Number(row.count ?? 0),
        uniqueClients: Number(row.unique_clients ?? 0),
      })),
    },
    regions: regionRows.map(row => ({
      countryCode: row.country_code,
      count: Number(row.count ?? 0),
      uniqueClients: Number(row.unique_clients ?? 0),
    })),
    topFeatures: featureRows.map(row => ({
      feature: row.feature,
      count: Number(row.count ?? 0),
      uniqueClients: Number(row.unique_clients ?? 0),
    })),
    ecosystem: {
      topPlugins,
      aiGateway: {
        totalRequests: totalAiRequests,
        successCount: successAiCount,
        errorCount: Math.max(0, totalAiRequests - successAiCount),
        successRate: totalAiRequests > 0 ? Number((successAiCount / totalAiRequests).toFixed(4)) : 0,
        avgLatencyMs: Math.round(Number(aiTotalsRow?.avg_latency_ms ?? 0)),
        totalTokens: Number(aiTotalsRow?.total_tokens ?? 0),
        byModel: aiModelRows.map((row) => {
          const requests = Number(row.requests ?? 0)
          const success = Number(row.success_count ?? 0)
          return {
            model: row.model,
            requests,
            successRate: requests > 0 ? Number((success / requests).toFixed(4)) : 0,
            avgLatencyMs: Math.round(Number(row.avg_latency_ms ?? 0)),
            totalTokens: Number(row.total_tokens ?? 0),
          }
        }),
        byProvider: aiProviderRows.map((row) => {
          const requests = Number(row.requests ?? 0)
          const success = Number(row.success_count ?? 0)
          return {
            providerId: row.provider_id,
            providerType: row.provider_type,
            requests,
            successRate: requests > 0 ? Number((success / requests).toFixed(4)) : 0,
            avgLatencyMs: Math.round(Number(row.avg_latency_ms ?? 0)),
            totalTokens: Number(row.total_tokens ?? 0),
          }
        }),
      },
    },
    stability: {
      totalErrors,
      totalLaunches,
      errorRate: totalLaunches > 0 ? Number((totalErrors / totalLaunches).toFixed(4)) : 0,
      byVersion: stabilityRows.map((row) => {
        const errors = Number(row.errors ?? 0)
        const launches = Number(row.launches ?? 0)
        return {
          version: row.version,
          errors,
          launches,
          errorRate: launches > 0 ? Number((errors / launches).toFixed(4)) : 0,
        }
      }),
    },
  }
}
