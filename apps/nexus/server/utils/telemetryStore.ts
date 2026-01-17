import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { resolveRequestIp } from './ipSecurityStore'

const TELEMETRY_TABLE = 'telemetry_events'
const DAILY_STATS_TABLE = 'daily_stats'
const TELEMETRY_QUARANTINE_TABLE = 'telemetry_events_quarantine'

const ALLOWED_EVENT_TYPES = new Set([
  'search',
  'visit',
  'error',
  'feature_use',
  'performance',
])

const MAX_STRING_LENGTH = 128
const MAX_METADATA_STRING_LENGTH = 256
const MAX_METADATA_KEYS = 50
const MAX_METADATA_KEY_LENGTH = 64
const MAX_METADATA_DEPTH = 4
const MAX_METADATA_BYTES = 16_384
const MAX_QUARANTINE_PAYLOAD_BYTES = 8_192
const MAX_INPUT_TYPES = 10
const MAX_PROVIDER_TIMINGS = 50
const MAX_SEARCH_DURATION_MS = 5 * 60 * 1000
const MAX_PROVIDER_DURATION_MS = 5 * 60 * 1000
const MAX_SEARCH_RESULT_COUNT = 100_000

const REDACTED_METADATA_KEYS = new Set([
  'query',
  'queryText',
  'searchQuery',
  'searchTerm',
  'keyword',
  'text',
])

let telemetrySchemaInitialized = false

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object')
    return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function normalizeString(value: unknown, maxLength = MAX_STRING_LENGTH): string | undefined {
  if (typeof value !== 'string')
    return undefined
  const trimmed = value.trim()
  if (!trimmed)
    return undefined
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function normalizeNumber(
  value: unknown,
  options: { min?: number, max?: number } = {},
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return undefined
  const min = options.min ?? -Infinity
  const max = options.max ?? Infinity
  if (value < min || value > max)
    return undefined
  return value
}

function sanitizeStringArray(value: unknown, limit = MAX_INPUT_TYPES): string[] | undefined {
  if (!Array.isArray(value))
    return undefined
  const normalized = value
    .map(item => normalizeString(item, MAX_METADATA_STRING_LENGTH))
    .filter((item): item is string => Boolean(item))
    .slice(0, limit)
  return normalized.length ? normalized : undefined
}

function sanitizeProviderTimings(
  value: unknown,
  limit = MAX_PROVIDER_TIMINGS,
): Record<string, number> | undefined {
  if (!isPlainObject(value))
    return undefined
  const entries = Object.entries(value)
    .filter(([key]) => typeof key === 'string' && key.length > 0)
    .slice(0, limit)
  const sanitizedEntries: Array<[string, number]> = []
  for (const [key, raw] of entries) {
    const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
    const duration = normalizeNumber(raw, { min: 0, max: MAX_PROVIDER_DURATION_MS })
    if (!normalizedKey || duration === undefined)
      continue
    sanitizedEntries.push([normalizedKey, Math.round(duration)])
  }
  if (!sanitizedEntries.length)
    return undefined
  return Object.fromEntries(sanitizedEntries)
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (value == null)
    return value
  if (depth > MAX_METADATA_DEPTH)
    return undefined
  if (typeof value === 'string') {
    return value.length > MAX_METADATA_STRING_LENGTH
      ? value.slice(0, MAX_METADATA_STRING_LENGTH)
      : value
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean')
    return value
  if (Array.isArray(value)) {
    const trimmed = value
      .map(item => sanitizeMetadataValue(item, depth + 1))
      .filter(item => item !== undefined)
      .slice(0, MAX_METADATA_KEYS)
    return trimmed.length ? trimmed : undefined
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .filter(([key]) => typeof key === 'string' && key.length > 0)
      .slice(0, MAX_METADATA_KEYS)
    const sanitizedEntries: Array<[string, unknown]> = []
    for (const [key, raw] of entries) {
      const normalizedKey = normalizeString(key, MAX_METADATA_KEY_LENGTH)
      if (!normalizedKey || REDACTED_METADATA_KEYS.has(normalizedKey))
        continue
      const sanitized = sanitizeMetadataValue(raw, depth + 1)
      if (sanitized !== undefined)
        sanitizedEntries.push([normalizedKey, sanitized])
    }
    return sanitizedEntries.length ? Object.fromEntries(sanitizedEntries) : undefined
  }
  return undefined
}

function sanitizeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value))
    return undefined
  const sanitized = sanitizeMetadataValue(value, 0)
  if (!sanitized || !isPlainObject(sanitized))
    return undefined
  try {
    const json = JSON.stringify(sanitized)
    if (json.length > MAX_METADATA_BYTES)
      return undefined
  }
  catch {
    return undefined
  }
  return sanitized
}

function isAllowedEventType(value: unknown): value is TelemetryEvent['eventType'] {
  return typeof value === 'string' && ALLOWED_EVENT_TYPES.has(value)
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureTelemetrySchema(db: D1Database) {
  if (telemetrySchemaInitialized)
    return

  // Telemetry events table - stores individual events
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TELEMETRY_TABLE} (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      user_id TEXT,
      client_id TEXT,
      device_fingerprint TEXT,
      platform TEXT,
      version TEXT,
      region TEXT,
      ip TEXT,
      search_query TEXT,
      search_duration_ms INTEGER,
      search_result_count INTEGER,
      provider_timings TEXT,
      input_types TEXT,
      metadata TEXT,
      is_anonymous INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `).run()

  // Daily aggregated stats table
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DAILY_STATS_TABLE} (
      date TEXT NOT NULL,
      stat_type TEXT NOT NULL,
      stat_key TEXT NOT NULL DEFAULT '',
      value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, stat_type, stat_key)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TELEMETRY_QUARANTINE_TABLE} (
      id TEXT PRIMARY KEY,
      event_type TEXT,
      reason TEXT NOT NULL,
      payload TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );
  `).run()

  await ensureTelemetryColumns(db)

  // Indexes for efficient queries
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON ${TELEMETRY_TABLE}(created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_event_type ON ${TELEMETRY_TABLE}(event_type);
  `).run()

  try {
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_ip_created_at ON ${TELEMETRY_TABLE}(ip, created_at);
    `).run()
  }
  catch {
    // ignore index creation failures for older schemas
  }

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON ${DAILY_STATS_TABLE}(date);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_quarantine_created_at ON ${TELEMETRY_QUARANTINE_TABLE}(created_at);
  `).run()

  telemetrySchemaInitialized = true
}

async function ensureTelemetryColumns(db: D1Database): Promise<void> {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${TELEMETRY_TABLE});`).all<{ name?: string }>()
    const columns = new Set((results ?? []).map(item => item.name).filter(Boolean) as string[])
    if (!columns.has('ip')) {
      await db.prepare(`ALTER TABLE ${TELEMETRY_TABLE} ADD COLUMN ip TEXT;`).run()
    }
    if (!columns.has('client_id')) {
      await db.prepare(`ALTER TABLE ${TELEMETRY_TABLE} ADD COLUMN client_id TEXT;`).run()
    }
  }
  catch {
    // ignore schema evolution failures
  }
}

export interface TelemetryEvent {
  id: string
  eventType: 'search' | 'visit' | 'error' | 'feature_use' | 'performance'
  userId?: string
  clientId?: string
  deviceFingerprint?: string
  platform?: string
  version?: string
  region?: string
  searchQuery?: string
  searchDurationMs?: number
  searchResultCount?: number
  providerTimings?: Record<string, number>
  inputTypes?: string[]
  metadata?: Record<string, unknown>
  isAnonymous: boolean
  createdAt: string
}

export interface TelemetryEventInput {
  eventType?: unknown
  userId?: unknown
  clientId?: unknown
  deviceFingerprint?: unknown
  platform?: unknown
  version?: unknown
  region?: unknown
  searchQuery?: unknown
  searchDurationMs?: unknown
  searchResultCount?: unknown
  providerTimings?: unknown
  inputTypes?: unknown
  metadata?: unknown
  isAnonymous?: unknown
}

export interface DailyStats {
  date: string
  totalVisits: number
  uniqueUsers: number
  totalSearches: number
  avgSearchDuration: number
  deviceDistribution: Record<string, number>
  regionDistribution: Record<string, number>
  hourlyDistribution: Record<string, number>
}

interface NormalizedTelemetryResult {
  telemetry: Omit<TelemetryEvent, 'id' | 'createdAt'> | null
  reason?: string
}

function normalizeTelemetryInput(input: TelemetryEventInput): NormalizedTelemetryResult {
  if (!input || typeof input !== 'object')
    return { telemetry: null, reason: 'invalid_payload' }

  if (!isAllowedEventType(input.eventType))
    return { telemetry: null, reason: 'invalid_event_type' }

  const isAnonymous = input.isAnonymous !== false

  return {
    telemetry: {
      eventType: input.eventType,
      userId: normalizeString(input.userId),
      clientId: normalizeString(input.clientId),
      deviceFingerprint: normalizeString(input.deviceFingerprint),
      platform: normalizeString(input.platform),
      version: normalizeString(input.version, MAX_METADATA_STRING_LENGTH),
      region: normalizeString(input.region, 8),
      searchQuery: normalizeString(input.searchQuery, MAX_METADATA_STRING_LENGTH),
      searchDurationMs: normalizeNumber(input.searchDurationMs, { min: 0, max: MAX_SEARCH_DURATION_MS }),
      searchResultCount: normalizeNumber(input.searchResultCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT }),
      providerTimings: sanitizeProviderTimings(input.providerTimings),
      inputTypes: sanitizeStringArray(input.inputTypes),
      metadata: sanitizeMetadata(input.metadata),
      isAnonymous,
    },
  }
}

function safeStringify(value: unknown, maxBytes = MAX_QUARANTINE_PAYLOAD_BYTES): string | null {
  try {
    const raw = JSON.stringify(value)
    if (raw.length <= maxBytes)
      return raw
    return raw.slice(0, maxBytes)
  }
  catch {
    return null
  }
}

async function recordTelemetryQuarantine(
  db: D1Database,
  payload: TelemetryEventInput,
  reason: string,
  ip?: string,
  eventType?: string,
): Promise<void> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const payloadText = safeStringify(payload)
  await db.prepare(`
    INSERT INTO ${TELEMETRY_QUARANTINE_TABLE} (
      id, event_type, reason, payload, ip, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6);
  `).bind(
    id,
    eventType ?? null,
    reason,
    payloadText,
    ip ?? null,
    now,
  ).run()
}

/**
 * Record a telemetry event
 */
export async function recordTelemetryEvent(
  event: H3Event,
  telemetry: TelemetryEventInput,
): Promise<void> {
  const db = getD1Database(event)
  if (!db) {
    console.warn('Telemetry: Database not available')
    return
  }

  await ensureTelemetrySchema(db)

  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const ip = resolveRequestIp(event)
  const normalized = normalizeTelemetryInput(telemetry)
  if (!normalized.telemetry) {
    await recordTelemetryQuarantine(db, telemetry, normalized.reason || 'invalid_event', ip)
    await incrementDailyStat(db, today, 'events_quarantined', normalized.reason || 'invalid_event', 1)
    return
  }

  const id = crypto.randomUUID()
  const safeSearchQuery = undefined
  const region = resolveRequestRegion(event) || normalized.telemetry.region
  const sanitized = normalized.telemetry

  // Insert telemetry event
  await db.prepare(`
    INSERT INTO ${TELEMETRY_TABLE} (
      id, event_type, user_id, client_id, device_fingerprint, platform, version,
      region, ip, search_query, search_duration_ms, search_result_count,
      provider_timings, input_types, metadata, is_anonymous, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17);
  `).bind(
    id,
    sanitized.eventType,
    sanitized.userId || null,
    sanitized.clientId || null,
    sanitized.deviceFingerprint || null,
    sanitized.platform || null,
    sanitized.version || null,
    region || null,
    ip || null,
    safeSearchQuery || null,
    sanitized.searchDurationMs ?? null,
    sanitized.searchResultCount ?? null,
    sanitized.providerTimings ? JSON.stringify(sanitized.providerTimings) : null,
    sanitized.inputTypes ? JSON.stringify(sanitized.inputTypes) : null,
    sanitized.metadata ? JSON.stringify(sanitized.metadata) : null,
    sanitized.isAnonymous ? 1 : 0,
    now,
  ).run()

  // Update daily stats
  await incrementDailyStat(db, today, 'total_events', '', 1)

  if (sanitized.eventType === 'search' || sanitized.eventType === 'visit') {
    const hour = new Date(now).getUTCHours().toString().padStart(2, '0')
    await incrementDailyStat(db, today, 'hour', hour, 1)
  }

  if (sanitized.eventType === 'visit') {
    await incrementDailyStat(db, today, 'visits', '', 1)
    const uniqueKey = sanitized.clientId || sanitized.userId || sanitized.deviceFingerprint
    if (uniqueKey) {
      await incrementDailyStat(db, today, 'unique_users', uniqueKey, 1)
    }
    if (sanitized.platform) {
      await incrementDailyStat(db, today, 'platform', sanitized.platform, 1)
    }
    if (region) {
      await incrementDailyStat(db, today, 'region', region, 1)
    }
    if (sanitized.metadata && typeof sanitized.metadata === 'object') {
      const meta = sanitized.metadata as Record<string, unknown>
      if (meta.kind === 'startup') {
        const mainProcess = meta.mainProcess as { moduleDetails?: Array<{ name?: string, loadTime?: number }> } | undefined
        const moduleDetails = Array.isArray(mainProcess?.moduleDetails) ? mainProcess?.moduleDetails : []
        for (const detail of moduleDetails) {
          const moduleName = typeof detail.name === 'string' ? detail.name : 'unknown'
          const loadTime = normalizeNumber(detail.loadTime, { min: 0, max: MAX_SEARCH_DURATION_MS }) ?? 0
          await incrementDailyStat(db, today, 'module_load_total', moduleName, loadTime)
          await incrementDailyStat(db, today, 'module_load_count', moduleName, 1)
          await updateDailyStatMax(db, today, 'module_load_max', moduleName, loadTime)
          await updateDailyStatMin(db, today, 'module_load_min', moduleName, loadTime)
        }
      }
    }
  }

  if (sanitized.eventType === 'search') {
    await incrementDailyStat(db, today, 'searches', '', 1)
    if (typeof sanitized.searchDurationMs === 'number') {
      await incrementDailyStat(db, today, 'search_duration_total', '', sanitized.searchDurationMs)
      await updateDailyStatMax(db, today, 'search_duration_max', '', sanitized.searchDurationMs)
      await updateDailyStatMin(db, today, 'search_duration_min', '', sanitized.searchDurationMs)
    }
    if (typeof sanitized.searchResultCount === 'number') {
      await incrementDailyStat(db, today, 'search_result_total', '', sanitized.searchResultCount)
      await incrementDailyStat(db, today, 'search_result_count', '', 1)
    }
    // Track input types only (search text is never stored)
    if (Array.isArray(sanitized.inputTypes)) {
      for (const inputType of sanitized.inputTypes) {
        await incrementDailyStat(db, today, 'search_input_type', inputType, 1)
      }
    }
    if (sanitized.providerTimings) {
      for (const [providerId, duration] of Object.entries(sanitized.providerTimings)) {
        await incrementDailyStat(db, today, 'search_provider', providerId, 1)
        if (typeof duration === 'number') {
          await incrementDailyStat(db, today, 'search_provider_time_total', providerId, duration)
          await incrementDailyStat(db, today, 'search_provider_time_count', providerId, 1)
          await updateDailyStatMax(db, today, 'search_provider_time_max', providerId, duration)
          await updateDailyStatMin(db, today, 'search_provider_time_min', providerId, duration)
        }
      }
    }
    if (sanitized.metadata && typeof sanitized.metadata === 'object') {
      const meta = sanitized.metadata as Record<string, unknown>
      const queryLength = normalizeNumber(meta.queryLength, { min: 0, max: 2048 })
      if (typeof queryLength === 'number') {
        await incrementDailyStat(db, today, 'search_query_length_total', '', queryLength)
        await incrementDailyStat(db, today, 'search_query_length_count', '', 1)
      }
      const sortingDuration = normalizeNumber(meta.sortingDuration, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof sortingDuration === 'number') {
        await incrementDailyStat(db, today, 'search_sorting_total', '', sortingDuration)
        await incrementDailyStat(db, today, 'search_sorting_count', '', 1)
        await updateDailyStatMax(db, today, 'search_sorting_max', '', sortingDuration)
        await updateDailyStatMin(db, today, 'search_sorting_min', '', sortingDuration)
      }
      if (typeof meta.queryType === 'string') {
        await incrementDailyStat(db, today, 'search_query_type', meta.queryType, 1)
      }
      if (typeof meta.searchScene === 'string') {
        await incrementDailyStat(db, today, 'search_scene', meta.searchScene, 1)
      }
      if (typeof meta.providerFilter === 'string') {
        await incrementDailyStat(db, today, 'search_provider_filter', meta.providerFilter, 1)
      }
      if (meta.resultCategories && typeof meta.resultCategories === 'object') {
        for (const [key, value] of Object.entries(meta.resultCategories as Record<string, unknown>)) {
          const normalizedValue = normalizeNumber(value, { min: 0, max: MAX_SEARCH_RESULT_COUNT })
          if (typeof normalizedValue === 'number') {
            await incrementDailyStat(db, today, 'search_result_category', key, normalizedValue)
          }
        }
      }
      if (meta.providerResults && typeof meta.providerResults === 'object') {
        for (const [key, value] of Object.entries(meta.providerResults as Record<string, unknown>)) {
          const normalizedValue = normalizeNumber(value, { min: 0, max: MAX_SEARCH_RESULT_COUNT })
          if (typeof normalizedValue === 'number') {
            await incrementDailyStat(db, today, 'search_provider_result', key, normalizedValue)
          }
        }
      }
    }
  }

  if (sanitized.eventType === 'feature_use') {
    await incrementDailyStat(db, today, 'feature_use', '', 1)
    if (sanitized.metadata && typeof sanitized.metadata === 'object') {
      const meta = sanitized.metadata as Record<string, unknown>
      if (typeof meta.sourceType === 'string') {
        await incrementDailyStat(db, today, 'feature_use_source_type', meta.sourceType, 1)
      }
      if (typeof meta.itemKind === 'string') {
        await incrementDailyStat(db, today, 'feature_use_item_kind', meta.itemKind, 1)
      }
      if (typeof meta.pluginName === 'string') {
        await incrementDailyStat(db, today, 'feature_use_plugin', meta.pluginName, 1)
      }
      if (typeof meta.entityId === 'string') {
        const entityType = typeof meta.entityType === 'string' ? meta.entityType : 'entity'
        await incrementDailyStat(db, today, 'feature_use_entity', `${entityType}:${meta.entityId}`, 1)
      }
      const executeLatencyMs = normalizeNumber(meta.executeLatencyMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof executeLatencyMs === 'number') {
        await incrementDailyStat(db, today, 'execute_latency_total', '', executeLatencyMs)
        await incrementDailyStat(db, today, 'execute_latency_count', '', 1)
        await updateDailyStatMax(db, today, 'execute_latency_max', '', executeLatencyMs)
        await updateDailyStatMin(db, today, 'execute_latency_min', '', executeLatencyMs)
      }
    }
  }

  if (sanitized.eventType === 'performance') {
    if (sanitized.metadata && typeof sanitized.metadata === 'object') {
      const meta = sanitized.metadata as Record<string, unknown>
      const longTaskTotalMs = normalizeNumber(meta.longTaskTotalMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof longTaskTotalMs === 'number') {
        await incrementDailyStat(db, today, 'perf_longtask_total_ms', '', longTaskTotalMs)
      }
      const longTaskCount = normalizeNumber(meta.longTaskCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT })
      if (typeof longTaskCount === 'number') {
        await incrementDailyStat(db, today, 'perf_longtask_count', '', longTaskCount)
      }
      const longTaskMaxMs = normalizeNumber(meta.longTaskMaxMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof longTaskMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_longtask_max_ms', '', longTaskMaxMs)
      }
      const rafJankTotalMs = normalizeNumber(meta.rafJankTotalMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof rafJankTotalMs === 'number') {
        await incrementDailyStat(db, today, 'perf_raf_jank_total_ms', '', rafJankTotalMs)
      }
      const rafJankCount = normalizeNumber(meta.rafJankCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT })
      if (typeof rafJankCount === 'number') {
        await incrementDailyStat(db, today, 'perf_raf_jank_count', '', rafJankCount)
      }
      const rafJankMaxMs = normalizeNumber(meta.rafJankMaxMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof rafJankMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_raf_jank_max_ms', '', rafJankMaxMs)
      }
      const eventLoopDelayP95Ms = normalizeNumber(meta.eventLoopDelayP95Ms, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof eventLoopDelayP95Ms === 'number') {
        await incrementDailyStat(db, today, 'perf_event_loop_delay_p95_total_ms', '', eventLoopDelayP95Ms)
        await incrementDailyStat(db, today, 'perf_event_loop_delay_p95_count', '', 1)
      }
      const eventLoopDelayMaxMs = normalizeNumber(meta.eventLoopDelayMaxMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof eventLoopDelayMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_event_loop_delay_max_ms', '', eventLoopDelayMaxMs)
      }
      const unresponsiveTotalMs = normalizeNumber(meta.unresponsiveTotalMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof unresponsiveTotalMs === 'number') {
        await incrementDailyStat(db, today, 'perf_unresponsive_total_ms', '', unresponsiveTotalMs)
      }
      const unresponsiveCount = normalizeNumber(meta.unresponsiveCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT })
      if (typeof unresponsiveCount === 'number') {
        await incrementDailyStat(db, today, 'perf_unresponsive_count', '', unresponsiveCount)
      }
      const unresponsiveMaxMs = normalizeNumber(meta.unresponsiveMaxMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof unresponsiveMaxMs === 'number') {
        await updateDailyStatMax(db, today, 'perf_unresponsive_max_ms', '', unresponsiveMaxMs)
      }
    }
  }
}

function resolveRequestRegion(event: H3Event): string | undefined {
  const raw
    = getHeader(event, 'cf-ipcountry')
      || getHeader(event, 'CF-IPCountry')
      || getHeader(event, 'x-vercel-ip-country')
      || getHeader(event, 'x-nf-country')
      || undefined

  if (!raw)
    return undefined

  const normalized = raw.trim().toUpperCase()
  if (!normalized || normalized === 'XX')
    return undefined
  if (!/^[A-Z]{2}$/.test(normalized))
    return undefined
  return normalized
}

async function incrementDailyStat(
  db: D1Database,
  date: string,
  statType: string,
  statKey: string,
  increment: number,
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = value + ?4;
  `).bind(date, statType, statKey, increment).run()
}

async function updateDailyStatMax(
  db: D1Database,
  date: string,
  statType: string,
  statKey: string,
  value: number,
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = MAX(value, ?4);
  `).bind(date, statType, statKey, value).run()
}

async function updateDailyStatMin(
  db: D1Database,
  date: string,
  statType: string,
  statKey: string,
  value: number,
): Promise<void> {
  await db.prepare(`
    INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET value = MIN(value, ?4);
  `).bind(date, statType, statKey, value).run()
}

/**
 * Get analytics summary for admin dashboard
 */
export async function getAnalyticsSummary(
  event: H3Event,
  options: { days?: number } = {},
): Promise<{
  totalEvents: number
  totalUsers: number
  totalSearches: number
  avgSearchDuration: number
  avgQueryLength: number
  avgSortingDuration: number
  avgResultCount: number
  avgExecuteLatency: number
  performance: {
    longTaskCount: number
    longTaskTotalMs: number
    longTaskMaxMs: number
    longTaskAvgMs: number
    rafJankCount: number
    rafJankTotalMs: number
    rafJankMaxMs: number
    rafJankAvgMs: number
    eventLoopDelayP95AvgMs: number
    eventLoopDelayMaxMs: number
    unresponsiveCount: number
    unresponsiveTotalMs: number
    unresponsiveMaxMs: number
    unresponsiveAvgMs: number
  }
  dailyStats: Array<{
    date: string
    visits: number
    searches: number
    avgDuration: number
  }>
  deviceDistribution: Record<string, number>
  regionDistribution: Record<string, number>
  hourlyDistribution: Record<string, number>
  searchSceneDistribution: Record<string, number>
  searchInputTypeDistribution: Record<string, number>
  searchProviderDistribution: Record<string, number>
  searchProviderResultDistribution: Record<string, number>
  searchResultCategoryDistribution: Record<string, number>
  featureUseSourceTypeDistribution: Record<string, number>
  featureUseItemKindDistribution: Record<string, number>
  featureUsePluginDistribution: Record<string, number>
  featureUseEntityDistribution: Record<string, number>
  moduleLoadMetrics: Array<{
    module: string
    avgDuration: number
    maxDuration: number
    minDuration: number
    ratio: number
  }>
}> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTelemetrySchema(db)

  const days = options.days || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString().split('T')[0]

  // Get daily stats
  const { results: dailyResults } = await db.prepare(`
    SELECT date, stat_type, stat_key, value
    FROM ${DAILY_STATS_TABLE}
    WHERE date >= ?1
    ORDER BY date DESC;
  `).bind(startDateStr).all<{ date: string, stat_type: string, stat_key: string, value: number }>()

  // Aggregate stats
  const dailyMap = new Map<string, { visits: number, searches: number, durationTotal: number }>()
  const deviceDist: Record<string, number> = {}
  const regionDist: Record<string, number> = {}
  const hourlyDist: Record<string, number> = {}
  const searchSceneDist: Record<string, number> = {}
  const searchInputDist: Record<string, number> = {}
  const searchProviderDist: Record<string, number> = {}
  const searchProviderResultDist: Record<string, number> = {}
  const searchResultCategoryDist: Record<string, number> = {}
  const featureUseSourceTypeDist: Record<string, number> = {}
  const featureUseItemKindDist: Record<string, number> = {}
  const featureUsePluginDist: Record<string, number> = {}
  const featureUseEntityDist: Record<string, number> = {}
  const moduleLoadTotals: Record<string, number> = {}
  const moduleLoadCounts: Record<string, number> = {}
  const moduleLoadMax: Record<string, number> = {}
  const moduleLoadMin: Record<string, number> = {}
  let totalEvents = 0
  let totalUsers = 0
  let totalSearches = 0
  let totalDuration = 0
  let queryLengthTotal = 0
  let queryLengthCount = 0
  let sortingTotal = 0
  let resultTotal = 0
  let resultCount = 0
  let executeLatencyTotal = 0
  let executeLatencyCount = 0
  let perfLongTaskTotalMs = 0
  let perfLongTaskCount = 0
  let perfLongTaskMaxMs = 0
  let perfRafJankTotalMs = 0
  let perfRafJankCount = 0
  let perfRafJankMaxMs = 0
  let perfEventLoopDelayP95TotalMs = 0
  let perfEventLoopDelayP95Count = 0
  let perfEventLoopDelayMaxMs = 0
  let perfUnresponsiveTotalMs = 0
  let perfUnresponsiveCount = 0
  let perfUnresponsiveMaxMs = 0

  for (const row of dailyResults ?? []) {
    if (!dailyMap.has(row.date)) {
      dailyMap.set(row.date, { visits: 0, searches: 0, durationTotal: 0 })
    }
    const day = dailyMap.get(row.date)!

    switch (row.stat_type) {
      case 'visits':
        day.visits += row.value
        break
      case 'total_events':
        totalEvents += row.value
        break
      case 'searches':
        day.searches += row.value
        totalSearches += row.value
        break
      case 'search_duration_total':
        day.durationTotal += row.value
        totalDuration += row.value
        break
      case 'search_query_length_total':
        queryLengthTotal += row.value
        break
      case 'search_query_length_count':
        queryLengthCount += row.value
        break
      case 'search_sorting_total':
        sortingTotal += row.value
        break
      case 'search_result_total':
        resultTotal += row.value
        break
      case 'search_result_count':
        resultCount += row.value
        break
      case 'unique_users':
        totalUsers += 1 // Count distinct keys
        break
      case 'platform':
        deviceDist[row.stat_key] = (deviceDist[row.stat_key] || 0) + row.value
        break
      case 'region':
        regionDist[row.stat_key] = (regionDist[row.stat_key] || 0) + row.value
        break
      case 'hour':
        hourlyDist[row.stat_key] = (hourlyDist[row.stat_key] || 0) + row.value
        break
      case 'search_scene':
        searchSceneDist[row.stat_key] = (searchSceneDist[row.stat_key] || 0) + row.value
        break
      case 'search_input_type':
        searchInputDist[row.stat_key] = (searchInputDist[row.stat_key] || 0) + row.value
        break
      case 'search_provider':
        searchProviderDist[row.stat_key] = (searchProviderDist[row.stat_key] || 0) + row.value
        break
      case 'search_provider_result':
        searchProviderResultDist[row.stat_key] = (searchProviderResultDist[row.stat_key] || 0) + row.value
        break
      case 'search_result_category':
        searchResultCategoryDist[row.stat_key] = (searchResultCategoryDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_source_type':
        featureUseSourceTypeDist[row.stat_key] = (featureUseSourceTypeDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_item_kind':
        featureUseItemKindDist[row.stat_key] = (featureUseItemKindDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_plugin':
        featureUsePluginDist[row.stat_key] = (featureUsePluginDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_entity':
        featureUseEntityDist[row.stat_key] = (featureUseEntityDist[row.stat_key] || 0) + row.value
        break
      case 'module_load_total':
        moduleLoadTotals[row.stat_key] = (moduleLoadTotals[row.stat_key] || 0) + row.value
        break
      case 'module_load_count':
        moduleLoadCounts[row.stat_key] = (moduleLoadCounts[row.stat_key] || 0) + row.value
        break
      case 'module_load_max':
        moduleLoadMax[row.stat_key] = Math.max(moduleLoadMax[row.stat_key] || 0, row.value)
        break
      case 'module_load_min':
        moduleLoadMin[row.stat_key] = Math.min(moduleLoadMin[row.stat_key] ?? row.value, row.value)
        break
      case 'execute_latency_total':
        executeLatencyTotal += row.value
        break
      case 'execute_latency_count':
        executeLatencyCount += row.value
        break
      case 'perf_longtask_total_ms':
        perfLongTaskTotalMs += row.value
        break
      case 'perf_longtask_count':
        perfLongTaskCount += row.value
        break
      case 'perf_longtask_max_ms':
        perfLongTaskMaxMs = Math.max(perfLongTaskMaxMs, row.value)
        break
      case 'perf_raf_jank_total_ms':
        perfRafJankTotalMs += row.value
        break
      case 'perf_raf_jank_count':
        perfRafJankCount += row.value
        break
      case 'perf_raf_jank_max_ms':
        perfRafJankMaxMs = Math.max(perfRafJankMaxMs, row.value)
        break
      case 'perf_event_loop_delay_p95_total_ms':
        perfEventLoopDelayP95TotalMs += row.value
        break
      case 'perf_event_loop_delay_p95_count':
        perfEventLoopDelayP95Count += row.value
        break
      case 'perf_event_loop_delay_max_ms':
        perfEventLoopDelayMaxMs = Math.max(perfEventLoopDelayMaxMs, row.value)
        break
      case 'perf_unresponsive_total_ms':
        perfUnresponsiveTotalMs += row.value
        break
      case 'perf_unresponsive_count':
        perfUnresponsiveCount += row.value
        break
      case 'perf_unresponsive_max_ms':
        perfUnresponsiveMaxMs = Math.max(perfUnresponsiveMaxMs, row.value)
        break
    }
  }

  // Convert to arrays
  const dailyStats = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({
      date,
      visits: stats.visits,
      searches: stats.searches,
      avgDuration: stats.searches > 0 ? Math.round(stats.durationTotal / stats.searches) : 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const moduleLoadMetrics = Object.keys({
    ...moduleLoadTotals,
    ...moduleLoadCounts,
    ...moduleLoadMax,
    ...moduleLoadMin,
  }).map((moduleName) => {
    const total = moduleLoadTotals[moduleName] || 0
    const count = moduleLoadCounts[moduleName] || 0
    const max = moduleLoadMax[moduleName] || 0
    const min = moduleLoadMin[moduleName] || 0
    const avg = count > 0 ? total / count : 0
    const ratio = min > 0 ? max / min : 0
    return {
      module: moduleName,
      avgDuration: Math.round(avg),
      maxDuration: Math.round(max),
      minDuration: Math.round(min),
      ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : 0,
    }
  }).sort((a, b) => b.avgDuration - a.avgDuration)

  return {
    totalEvents,
    totalUsers,
    totalSearches,
    avgSearchDuration: totalSearches > 0 ? Math.round(totalDuration / totalSearches) : 0,
    avgQueryLength: queryLengthCount > 0 ? Math.round(queryLengthTotal / queryLengthCount) : 0,
    avgSortingDuration: totalSearches > 0 ? Math.round(sortingTotal / totalSearches) : 0,
    avgResultCount: resultCount > 0 ? Math.round(resultTotal / resultCount) : 0,
    avgExecuteLatency: executeLatencyCount > 0 ? Math.round(executeLatencyTotal / executeLatencyCount) : 0,
    performance: {
      longTaskCount: perfLongTaskCount,
      longTaskTotalMs: perfLongTaskTotalMs,
      longTaskMaxMs: perfLongTaskMaxMs,
      longTaskAvgMs: perfLongTaskCount > 0 ? Math.round(perfLongTaskTotalMs / perfLongTaskCount) : 0,
      rafJankCount: perfRafJankCount,
      rafJankTotalMs: perfRafJankTotalMs,
      rafJankMaxMs: perfRafJankMaxMs,
      rafJankAvgMs: perfRafJankCount > 0 ? Math.round(perfRafJankTotalMs / perfRafJankCount) : 0,
      eventLoopDelayP95AvgMs: perfEventLoopDelayP95Count > 0 ? Math.round(perfEventLoopDelayP95TotalMs / perfEventLoopDelayP95Count) : 0,
      eventLoopDelayMaxMs: perfEventLoopDelayMaxMs,
      unresponsiveCount: perfUnresponsiveCount,
      unresponsiveTotalMs: perfUnresponsiveTotalMs,
      unresponsiveMaxMs: perfUnresponsiveMaxMs,
      unresponsiveAvgMs: perfUnresponsiveCount > 0 ? Math.round(perfUnresponsiveTotalMs / perfUnresponsiveCount) : 0,
    },
    dailyStats,
    deviceDistribution: deviceDist,
    regionDistribution: regionDist,
    hourlyDistribution: hourlyDist,
    searchSceneDistribution: searchSceneDist,
    searchInputTypeDistribution: searchInputDist,
    searchProviderDistribution: searchProviderDist,
    searchProviderResultDistribution: searchProviderResultDist,
    searchResultCategoryDistribution: searchResultCategoryDist,
    featureUseSourceTypeDistribution: featureUseSourceTypeDist,
    featureUseItemKindDistribution: featureUseItemKindDist,
    featureUsePluginDistribution: featureUsePluginDist,
    featureUseEntityDistribution: featureUseEntityDist,
    moduleLoadMetrics,
  }
}

/**
 * Get real-time stats (last 24 hours)
 */
export async function getRealTimeStats(event: H3Event): Promise<{
  searchesLast24h: number
  visitsLast24h: number
  activeUsers: number
  avgLatency: number
}> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTelemetrySchema(db)

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString()

  // Count recent events
  const { results } = await db.prepare(`
    SELECT 
      event_type,
      COUNT(*) as count,
      AVG(search_duration_ms) as avg_duration
    FROM ${TELEMETRY_TABLE}
    WHERE created_at >= ?1
    GROUP BY event_type;
  `).bind(yesterdayStr).all<{ event_type: string, count: number, avg_duration: number | null }>()

  let searchesLast24h = 0
  let visitsLast24h = 0
  let avgLatency = 0

  for (const row of results ?? []) {
    if (row.event_type === 'search') {
      searchesLast24h = row.count
      avgLatency = row.avg_duration ? Math.round(row.avg_duration) : 0
    }
    else if (row.event_type === 'visit') {
      visitsLast24h = row.count
    }
  }

  // Count unique users in last 24h
  const { results: userResults } = await db.prepare(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM ${TELEMETRY_TABLE}
    WHERE created_at >= ?1 AND user_id IS NOT NULL;
  `).bind(yesterdayStr).all<{ count: number }>()

  const activeUsers = userResults?.[0]?.count || 0

  return {
    searchesLast24h,
    visitsLast24h,
    activeUsers,
    avgLatency,
  }
}
