import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings, shouldUseCloudflareBindings } from './cloudflare'
import { resolveRequestIp } from './ipSecurityStore'
import { recordPlatformGovernanceEvent, type RecordPlatformGovernanceEventInput } from './platformGovernanceStore'
import { resolveRequestGeo } from './requestGeo'
import { scheduleTelemetryDailyRollup, withUnrolledTelemetryDays } from './telemetryDailyRollup'
import { scheduleTelemetryRetentionMaintenance } from './telemetryRetentionMaintenance'
import {
  MAX_PROVIDER_DURATION_MS,
  MAX_SEARCH_DURATION_MS,
  MAX_SEARCH_RESULT_COUNT,
  TELEMETRY_EVENT_TYPES_SQL,
  isPlainObject,
  normalizeNumber,
  normalizeString,
  normalizeTelemetryInput,
  normalizeUsageCategoryPart,
  resolveAppCategory,
  safeStringify,
  type TelemetryEventInput,
} from './telemetrySanitizer'

export type { TelemetryEventInput } from './telemetrySanitizer'

const TELEMETRY_TABLE = 'telemetry_events'
const DAILY_STATS_TABLE = 'daily_stats'
const TELEMETRY_QUARANTINE_TABLE = 'telemetry_events_quarantine'
const TELEMETRY_BATCH_RECEIPTS_TABLE = 'telemetry_batch_receipts'

let telemetrySchemaInitialized = false

export interface TelemetryRecordResult {
  status: 'accepted' | 'quarantined' | 'dropped'
  reason?: string
}

export interface TelemetryBatchReceipt<TResponse extends Record<string, unknown> = Record<string, unknown>> {
  scope: string
  idempotencyKey: string
  payloadHash: string
  response: TResponse
  createdAt: string
  expiresAt: string
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureTelemetrySchema(db: D1Database) {
  if (telemetrySchemaInitialized)
    return

  // One round trip for the tables and one for the indexes, instead of one per statement: this
  // runs on the first telemetry request of every isolate, which on Workers is often.
  await db.batch([
    // Telemetry events table - stores individual events
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ${TELEMETRY_TABLE} (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        user_id TEXT,
        client_id TEXT,
        device_fingerprint TEXT,
        platform TEXT,
        version TEXT,
        region TEXT,
        country_code TEXT,
        region_code TEXT,
        region_name TEXT,
        city TEXT,
        latitude REAL,
        longitude REAL,
        timezone TEXT,
        geo_source TEXT,
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
    `),
    // Daily aggregated stats table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ${DAILY_STATS_TABLE} (
        date TEXT NOT NULL,
        stat_type TEXT NOT NULL,
        stat_key TEXT NOT NULL DEFAULT '',
        value INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, stat_type, stat_key)
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ${TELEMETRY_QUARANTINE_TABLE} (
        id TEXT PRIMARY KEY,
        event_type TEXT,
        reason TEXT NOT NULL,
        payload TEXT,
        ip TEXT,
        created_at TEXT NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ${TELEMETRY_BATCH_RECEIPTS_TABLE} (
        scope TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (scope, idempotency_key)
      );
    `),
  ])

  await ensureTelemetryColumns(db)

  // Indexes for efficient queries. D1 bills each index entry an insert writes as another written
  // row, and event inserts are most of the database's writes: on 2026-10-09 an event cost five, its
  // row and four index entries. So `telemetry_events` has no `created_at`-only and no
  // `event_type`-only index: a query bounds `created_at` and names the event types it reads
  // (`TELEMETRY_EVENT_TYPES_SQL` for all of them), which `idx_telemetry_event_geo` (event_type,
  // created_at, ...) serves; and only searches are looked up by IP, so only searches are in the IP
  // index. `daily_stats` needs no `date` index beside its primary key, which leads with `date`, and
  // nothing reads the batch receipts by `expires_at`. The indexes these replace
  // (`idx_telemetry_created_at`, `idx_telemetry_ip_created_at`, `idx_daily_stats_date`,
  // `idx_telemetry_batch_receipts_expires_at`) are dropped by hand, not here: an isolate still on
  // the previous release would build them again, at a written row per row in the table.
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_telemetry_quarantine_created_at ON ${TELEMETRY_QUARANTINE_TABLE}(created_at);
  `).run()

  // These two depend on columns added by `ensureTelemetryColumns`; an older schema that could not
  // be evolved must not block ingestion, so each stays on its own and may fail quietly.
  try {
    // A query uses a partial index only when its WHERE repeats the index's term, literally:
    // `event_type = 'search'`, not a bound parameter.
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_search_ip
      ON ${TELEMETRY_TABLE}(ip, created_at) WHERE event_type = 'search';
    `).run()
  }
  catch {
    // ignore index creation failures for older schemas
  }

  try {
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_telemetry_event_geo
      ON ${TELEMETRY_TABLE}(event_type, created_at, country_code, region_code);
    `).run()
  }
  catch {
    // ignore index creation failures for older schemas
  }

  telemetrySchemaInitialized = true
}

/** The shape the batch and record routes accept from `X-Idempotency-Key` (or the startup report's metadata). */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

export function normalizeTelemetryIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return IDEMPOTENCY_KEY_PATTERN.test(trimmed) ? trimmed : null
}

export function digestTelemetryBatchPayload(payload: unknown): string {
  return createHash('sha256').update(stableSerialize(payload)).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
}

export async function getTelemetryBatchReceipt<TResponse extends Record<string, unknown>>(
  event: H3Event,
  scope: string,
  idempotencyKey: string,
): Promise<TelemetryBatchReceipt<TResponse> | null> {
  const db = getD1Database(event)
  if (!db)
    throw createError({ statusCode: 503, statusMessage: 'Telemetry database not available' })

  await ensureTelemetrySchema(db)

  const row = await db.prepare(`
    SELECT scope, idempotency_key, payload_hash, response_json, created_at, expires_at
    FROM ${TELEMETRY_BATCH_RECEIPTS_TABLE}
    WHERE scope = ?1 AND idempotency_key = ?2
    LIMIT 1;
  `).bind(scope, idempotencyKey).first<{
    scope: string
    idempotency_key: string
    payload_hash: string
    response_json: string
    created_at: string
    expires_at: string
  }>()

  if (!row)
    return null

  try {
    const response = JSON.parse(row.response_json) as TResponse
    return {
      scope: row.scope,
      idempotencyKey: row.idempotency_key,
      payloadHash: row.payload_hash,
      response,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }
  }
  catch {
    throw createError({ statusCode: 500, statusMessage: 'Telemetry idempotency receipt is invalid' })
  }
}

export interface TelemetryBatchReceiptInput {
  scope: string
  idempotencyKey: string
  payloadHash: string
  response: Record<string, unknown>
  now?: Date
  retentionDays?: number
}

/**
 * The receipt row as a statement, so a route can commit it in the same `db.batch()` as the event
 * rows it acknowledges. A receipt without its rows, or rows without their receipt, is exactly the
 * false-success / duplicate-on-retry pair #1788 describes.
 */
export function buildTelemetryBatchReceiptStatement(
  db: D1Database,
  input: TelemetryBatchReceiptInput,
): D1PreparedStatement {
  const now = input.now ?? new Date()
  const retentionDays = Number.isFinite(input.retentionDays) ? Math.max(14, Number(input.retentionDays)) : 14
  const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000).toISOString()
  return db.prepare(`
    INSERT INTO ${TELEMETRY_BATCH_RECEIPTS_TABLE} (
      scope, idempotency_key, payload_hash, response_json, created_at, expires_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(scope, idempotency_key) DO NOTHING;
  `).bind(
    input.scope,
    input.idempotencyKey,
    input.payloadHash,
    JSON.stringify(input.response),
    now.toISOString(),
    expiresAt,
  )
}

export async function storeTelemetryBatchReceipt(
  event: H3Event,
  input: TelemetryBatchReceiptInput,
): Promise<void> {
  const db = getD1Database(event)
  if (!db)
    throw createError({ statusCode: 503, statusMessage: 'Telemetry database not available' })

  await ensureTelemetrySchema(db)
  await buildTelemetryBatchReceiptStatement(db, input).run()
}

async function ensureTelemetryColumns(db: D1Database): Promise<void> {
  try {
    const { results } = await db.prepare(`PRAGMA table_info(${TELEMETRY_TABLE});`).all<{ name?: string }>()
    const columns = new Set((results ?? []).map(item => item.name).filter(Boolean) as string[])
    const addColumnIfMissing = async (column: string, ddl: string) => {
      if (!columns.has(column)) {
        await db.prepare(`ALTER TABLE ${TELEMETRY_TABLE} ADD COLUMN ${ddl};`).run()
      }
    }

    await addColumnIfMissing('ip', 'ip TEXT')
    await addColumnIfMissing('client_id', 'client_id TEXT')
    await addColumnIfMissing('country_code', 'country_code TEXT')
    await addColumnIfMissing('region_code', 'region_code TEXT')
    await addColumnIfMissing('region_name', 'region_name TEXT')
    await addColumnIfMissing('city', 'city TEXT')
    await addColumnIfMissing('latitude', 'latitude REAL')
    await addColumnIfMissing('longitude', 'longitude REAL')
    await addColumnIfMissing('timezone', 'timezone TEXT')
    await addColumnIfMissing('geo_source', 'geo_source TEXT')
  }
  catch {
    // ignore schema evolution failures
  }
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

function buildTelemetryQuarantineStatement(
  db: D1Database,
  payload: TelemetryEventInput,
  reason: string,
  ip?: string,
  eventType?: string,
): D1PreparedStatement {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const payloadText = safeStringify(payload)
  return db.prepare(`
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
  )
}

type DailyStatOp = 'inc' | 'max' | 'min'

interface DailyStatDelta {
  date: string
  statType: string
  statKey: string
  op: DailyStatOp
  value: number
}

const DAILY_STAT_UPDATE: Record<DailyStatOp, string> = {
  inc: 'value = value + ?4',
  max: 'value = MAX(value, ?4)',
  min: 'value = MIN(value, ?4)',
}

/**
 * Everything one request wants written, collected so it can go to D1 as a single `batch()`.
 *
 * `db.batch()` runs its statements in one implicit transaction: either every row and counter
 * lands, or none does. The previous shape ran each statement on its own round trip -- about 90
 * for a single search event -- so a failure part-way through a batch left some events persisted
 * with no receipt, and the client's retry (same idempotency key, receipt not found) persisted
 * them again (#1788).
 *
 * Daily counters are merged before they become statements: twenty feature-use events increment
 * `feature_use` once with +20 rather than twenty times with +1. That is also what keeps the batch
 * small enough to send as one request.
 */
export class TelemetryWriteBatch {
  private readonly rows: D1PreparedStatement[] = []
  private readonly stats = new Map<string, DailyStatDelta>()
  readonly governance: RecordPlatformGovernanceEventInput[] = []

  constructor(private readonly db: D1Database) {}

  /** Rows plus one statement per distinct counter: what `toStatements()` will produce. */
  get size(): number {
    return this.rows.length + this.stats.size
  }

  add(statement: D1PreparedStatement): void {
    this.rows.push(statement)
  }

  inc(date: string, statType: string, statKey: string, increment: number): void {
    this.merge('inc', date, statType, statKey, increment, (current, next) => current + next)
  }

  max(date: string, statType: string, statKey: string, value: number): void {
    this.merge('max', date, statType, statKey, value, Math.max)
  }

  min(date: string, statType: string, statKey: string, value: number): void {
    this.merge('min', date, statType, statKey, value, Math.min)
  }

  toStatements(): D1PreparedStatement[] {
    const statements = [...this.rows]
    for (const delta of this.stats.values()) {
      statements.push(this.db.prepare(`
        INSERT INTO ${DAILY_STATS_TABLE} (date, stat_type, stat_key, value)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(date, stat_type, stat_key) DO UPDATE SET ${DAILY_STAT_UPDATE[delta.op]};
      `).bind(delta.date, delta.statType, delta.statKey, delta.value))
    }
    return statements
  }

  private merge(
    op: DailyStatOp,
    date: string,
    statType: string,
    statKey: string,
    value: number,
    combine: (current: number, next: number) => number,
  ): void {
    const key = `${op}\u0000${date}\u0000${statType}\u0000${statKey}`
    const current = this.stats.get(key)
    if (current) {
      current.value = combine(current.value, value)
      return
    }
    this.stats.set(key, { date, statType, statKey, op, value })
  }
}

interface TelemetryRequestContext {
  ip: string | undefined
  geo: ReturnType<typeof resolveRequestGeo>
  now: string
  today: string
}

/** Resolved once per request: every event in a batch arrived on the same connection at the same time. */
function resolveTelemetryRequestContext(event: H3Event): TelemetryRequestContext {
  const now = new Date().toISOString()
  return {
    ip: resolveRequestIp(event) || undefined,
    geo: resolveRequestGeo(event),
    now,
    today: now.slice(0, 10),
  }
}

/**
 * Adds one event's row, counters and governance follow-ups to the batch. Nothing is written here.
 */
function planTelemetryEvent(
  db: D1Database,
  batch: TelemetryWriteBatch,
  context: TelemetryRequestContext,
  telemetry: TelemetryEventInput,
): TelemetryRecordResult {
  const { ip, geo, now, today } = context
  const normalized = normalizeTelemetryInput(telemetry)
  if (!normalized.telemetry) {
    const reason = normalized.reason || 'invalid_event'
    batch.add(buildTelemetryQuarantineStatement(db, telemetry, reason, ip))
    batch.inc(today, 'events_quarantined', reason, 1)
    return { status: 'quarantined', reason }
  }

  const id = crypto.randomUUID()
  const safeSearchQuery = undefined
  const countryCode = geo.countryCode || normalized.telemetry.region || null
  const region = countryCode
  const sanitized = normalized.telemetry
  const actorId = sanitized.userId || sanitized.clientId || sanitized.deviceFingerprint

  batch.add(db.prepare(`
    INSERT INTO ${TELEMETRY_TABLE} (
      id, event_type, user_id, client_id, device_fingerprint, platform, version,
      region, country_code, region_code, region_name, city, latitude, longitude, timezone, geo_source,
      ip, search_query, search_duration_ms, search_result_count,
      provider_timings, input_types, metadata, is_anonymous, created_at
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
      ?19, ?20, ?21, ?22, ?23, ?24, ?25
    );
  `).bind(
    id,
    sanitized.eventType,
    sanitized.userId || null,
    sanitized.clientId || null,
    sanitized.deviceFingerprint || null,
    sanitized.platform || null,
    sanitized.version || null,
    region || null,
    countryCode,
    geo.regionCode,
    geo.regionName,
    geo.city,
    geo.latitude,
    geo.longitude,
    geo.timezone,
    geo.source,
    ip || null,
    safeSearchQuery || null,
    sanitized.searchDurationMs ?? null,
    sanitized.searchResultCount ?? null,
    sanitized.providerTimings ? JSON.stringify(sanitized.providerTimings) : null,
    sanitized.inputTypes ? JSON.stringify(sanitized.inputTypes) : null,
    sanitized.metadata ? JSON.stringify(sanitized.metadata) : null,
    sanitized.isAnonymous ? 1 : 0,
    now,
  ))

  // Visits, searches, performance samples and the day's totals are counted from these rows by the
  // daily rollup (`telemetryDailyRollup.ts`). Upserting every counter per event cost about 90 D1
  // writes for one search event, and the free plan stops all writes at 100,000 a day.

  if (sanitized.eventType === 'visit') {
    const meta = sanitized.metadata && typeof sanitized.metadata === 'object'
      ? sanitized.metadata as Record<string, unknown>
      : {}
    const visitRoute = normalizeString(meta.route, 180)
    const visitSurface = normalizeString(meta.surface, 80)
    batch.governance.push({
      scope: 'app',
      action: 'visit',
      actorId,
      resourceType: visitRoute ? 'route' : 'platform',
      resourceId: visitRoute || sanitized.platform || 'unknown',
      channel: visitSurface || sanitized.version || 'unknown',
      unit: 'visit',
      quantity: 1,
      metadata: {
        platform: sanitized.platform ?? null,
        version: sanitized.version ?? null,
        route: visitRoute ?? null,
        page: normalizeString(meta.page, 120) ?? null,
        screen: normalizeString(meta.screen, 120) ?? null,
        surface: visitSurface ?? null,
        referrer: normalizeString(meta.referrer, 180) ?? null,
        source: normalizeString(meta.source, 120) ?? null,
        localHour: normalizeNumber(meta.localHour, { min: 0, max: 23 }) ?? null,
        localDayOfWeek: normalizeNumber(meta.localDayOfWeek, { min: 0, max: 6 }) ?? null,
        countryCode,
        regionCode: geo.regionCode,
        timezone: geo.timezone,
      },
    })
  }

  if (sanitized.eventType === 'search') {
    const meta = sanitized.metadata && typeof sanitized.metadata === 'object'
      ? sanitized.metadata as Record<string, unknown>
      : {}
    batch.governance.push({
      scope: 'app',
      action: 'search',
      actorId,
      resourceType: 'search',
      resourceId: normalizeString(meta.searchScene, 48) || normalizeString(meta.queryType, 32) || 'corebox',
      channel: normalizeString(meta.providerFilter, 64) || 'all',
      unit: 'search',
      quantity: 1,
      metadata: {
        queryType: normalizeString(meta.queryType, 32) ?? null,
        searchScene: normalizeString(meta.searchScene, 48) ?? null,
        providerFilter: normalizeString(meta.providerFilter, 64) ?? null,
        contextAppCategory: normalizeString(meta.contextAppCategory, 48) ?? null,
        contextSource: normalizeString(meta.contextSource, 48) ?? null,
        entryPoint: normalizeString(meta.entryPoint, 48) ?? null,
        triggerType: normalizeString(meta.triggerType, 48) ?? null,
        userPreferenceMode: normalizeString(meta.userPreferenceMode, 48) ?? null,
        sessionBucket: normalizeString(meta.sessionBucket, 64) ?? null,
        hasFilters: typeof meta.hasFilters === 'boolean' ? meta.hasFilters : null,
        queryLength: normalizeNumber(meta.queryLength, { min: 0, max: 2048 }) ?? null,
        localHour: normalizeNumber(meta.localHour, { min: 0, max: 23 }) ?? null,
        localDayOfWeek: normalizeNumber(meta.localDayOfWeek, { min: 0, max: 6 }) ?? null,
        firstResultMs: normalizeNumber(meta.firstResultMs, { min: 0, max: MAX_SEARCH_DURATION_MS }) ?? null,
        totalDurationMs: normalizeNumber(meta.totalDurationMs, { min: 0, max: MAX_SEARCH_DURATION_MS }) ?? null,
        searchDurationMs: sanitized.searchDurationMs ?? null,
        searchResultCount: sanitized.searchResultCount ?? null,
        firstResultCount: normalizeNumber(meta.firstResultCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT }) ?? null,
        providerErrorCount: normalizeNumber(meta.providerErrorCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT }) ?? null,
        providerTimeoutCount: normalizeNumber(meta.providerTimeoutCount, { min: 0, max: MAX_SEARCH_RESULT_COUNT }) ?? null,
        selected: typeof meta.selected === 'boolean' ? meta.selected : null,
        selectedProvider: normalizeString(meta.selectedProvider, 128) ?? null,
        selectedCategory: normalizeString(meta.selectedCategory, 64) ?? null,
        selectedPluginId: normalizeString(meta.selectedPluginId, 128) ?? null,
        selectedRank: normalizeNumber(meta.selectedRank, { min: 0, max: MAX_SEARCH_RESULT_COUNT }) ?? null,
        filterKinds: Array.isArray(meta.filterKinds) ? meta.filterKinds : [],
        filterSources: Array.isArray(meta.filterSources) ? meta.filterSources : [],
        pluginIds: Array.isArray(meta.pluginIds) ? meta.pluginIds : [],
        pluginCategories: Array.isArray(meta.pluginCategories) ? meta.pluginCategories : [],
        contextTags: Array.isArray(meta.contextTags) ? meta.contextTags : [],
        inputTypes: sanitized.inputTypes ?? [],
        providerTimings: sanitized.providerTimings ?? {},
        providerResults: isPlainObject(meta.providerResults) ? meta.providerResults : {},
        resultCategories: isPlainObject(meta.resultCategories) ? meta.resultCategories : {},
        providerStatus: isPlainObject(meta.providerStatus) ? meta.providerStatus : {},
        countryCode,
        regionCode: geo.regionCode,
        timezone: geo.timezone,
      },
    })
  }

  if (sanitized.eventType === 'feature_use') {
    batch.inc(today, 'feature_use', '', 1)
    if (sanitized.metadata && typeof sanitized.metadata === 'object') {
      const meta = sanitized.metadata as Record<string, unknown>
      if (typeof meta.sourceType === 'string') {
        batch.inc(today, 'feature_use_source_type', meta.sourceType, 1)
      }
      if (typeof meta.itemKind === 'string') {
        batch.inc(today, 'feature_use_item_kind', meta.itemKind, 1)
      }
      if (typeof meta.pluginName === 'string') {
        batch.inc(today, 'feature_use_plugin', meta.pluginName, 1)
      }
      const pluginId = normalizeString(meta.pluginId, 128)
      const pluginName = normalizeString(meta.pluginName, 128)
      if (pluginId || pluginName) {
        batch.governance.push({
          scope: 'plugin',
          action: 'invoke',
          actorId: sanitized.userId || sanitized.clientId || sanitized.deviceFingerprint,
          resourceType: 'plugin',
          resourceId: pluginId || pluginName,
          channel: normalizeString(meta.featureId, 128) || normalizeString(meta.sourceType, 64) || 'feature_use',
          unit: 'call',
          quantity: 1,
          metadata: {
            pluginName: pluginName ?? null,
            featureId: normalizeString(meta.featureId, 128) ?? null,
            itemKind: normalizeString(meta.itemKind, 64) ?? null,
            sourceType: normalizeString(meta.sourceType, 64) ?? null,
            countryCode,
          },
        })
      }
      if (meta.sourceType === 'update') {
        const updateAction = normalizeString(meta.action, 64)
        let updateStage = normalizeString(meta.stage, 32)
        let updateResult = normalizeString(meta.result, 32)
        if ((!updateStage || !updateResult) && updateAction) {
          const [stage, ...rest] = updateAction.split('_')
          if (!updateStage && stage) {
            updateStage = stage
          }
          if (!updateResult && rest.length) {
            updateResult = rest.join('_')
          }
        }
        if (updateAction) {
          batch.inc(today, 'update_action', updateAction, 1)
        }
        if (updateStage) {
          batch.inc(today, 'update_stage', updateStage, 1)
        }
        if (updateResult) {
          batch.inc(today, 'update_result', updateResult, 1)
        }
        const updateChannel = normalizeString(meta.sourceId, 64)
        if (updateChannel) {
          batch.inc(today, 'update_channel', updateChannel, 1)
        }
        const updateSource = normalizeString(meta.sourceName, 64)
        if (updateSource) {
          batch.inc(today, 'update_source', updateSource, 1)
        }
        const updateTag = normalizeString(meta.sourceVersion, 64)
        if (updateTag) {
          batch.inc(today, 'update_tag', updateTag, 1)
        }
        const updateItemKind = normalizeString(meta.itemKind, 32)
        if (updateItemKind) {
          batch.inc(today, 'update_item_kind', updateItemKind, 1)
        }
      }
      const categoryL1 = normalizeUsageCategoryPart(meta.usageCategoryL1) || 'others'
      const categoryL2 = normalizeUsageCategoryPart(meta.usageCategoryL2) || 'others'
      batch.inc(today, 'feature_use_category', `${categoryL1}:${categoryL2}`, 1)
      const executeLatencyMs = normalizeNumber(meta.executeLatencyMs, { min: 0, max: MAX_SEARCH_DURATION_MS })
      if (typeof executeLatencyMs === 'number') {
        batch.inc(today, 'execute_latency_total', '', executeLatencyMs)
        batch.inc(today, 'execute_latency_count', '', 1)
        batch.max(today, 'execute_latency_max', '', executeLatencyMs)
        batch.min(today, 'execute_latency_min', '', executeLatencyMs)
      }
    }
  }

  return { status: 'accepted' }
}

export interface PreparedTelemetryWrite {
  /** `null` when no D1 binding is available; every result is then `dropped`. */
  db: D1Database | null
  batch: TelemetryWriteBatch | null
  results: TelemetryRecordResult[]
}

/**
 * Plans every event of one request without writing anything, so the caller can decide the
 * acknowledgement first and commit rows, counters and that acknowledgement's receipt together.
 */
export async function prepareTelemetryWrite(
  event: H3Event,
  inputs: TelemetryEventInput[],
): Promise<PreparedTelemetryWrite> {
  const db = getD1Database(event)
  if (!db) {
    if (shouldUseCloudflareBindings())
      console.warn('Telemetry: Database not available')
    return {
      db: null,
      batch: null,
      results: inputs.map(() => ({ status: 'dropped', reason: 'database_unavailable' })),
    }
  }

  await ensureTelemetrySchema(db)

  const context = resolveTelemetryRequestContext(event)
  const batch = new TelemetryWriteBatch(db)
  const results = inputs.map(input => planTelemetryEvent(db, batch, context, input))
  return { db, batch, results }
}

export interface CommitTelemetryWriteOptions {
  /** Appended after the telemetry rows and counters, inside the same transaction (the receipt). */
  extraStatements?: D1PreparedStatement[]
}

/**
 * One `db.batch()` for the whole request; governance follow-ups and retention maintenance run
 * only after it committed, so they never describe rows that did not land.
 */
export async function commitTelemetryWrite(
  event: H3Event,
  prepared: { db: D1Database, batch: TelemetryWriteBatch },
  options: CommitTelemetryWriteOptions = {},
): Promise<void> {
  const statements = [...prepared.batch.toStatements(), ...(options.extraStatements ?? [])]
  if (statements.length > 0)
    await prepared.db.batch(statements)

  for (const input of prepared.batch.governance) {
    await recordPlatformGovernanceEvent(event, input).catch(() => {})
  }

  scheduleTelemetryRetentionMaintenance(event, prepared.db)
  scheduleTelemetryDailyRollup(event, prepared.db)
}

/**
 * Record a telemetry event
 */
export async function recordTelemetryEvent(
  event: H3Event,
  telemetry: TelemetryEventInput,
): Promise<TelemetryRecordResult> {
  const prepared = await prepareTelemetryWrite(event, [telemetry])
  const result = prepared.results[0] ?? { status: 'dropped', reason: 'database_unavailable' }
  if (!prepared.db || !prepared.batch)
    return result
  await commitTelemetryWrite(event, { db: prepared.db, batch: prepared.batch })
  return result
}

function percentile(values: number[], ratio: number): number {
  if (!values.length)
    return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return Math.round(sorted[index] || 0)
}

async function getSearchProviderP95Durations(
  db: D1Database,
  startTime: string,
): Promise<Record<string, number>> {
  const { results } = await db.prepare(`
    SELECT provider_timings
    FROM ${TELEMETRY_TABLE}
    WHERE event_type = 'search'
      AND created_at >= ?1
      AND provider_timings IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5000;
  `).bind(startTime).all<{ provider_timings?: string | null }>()

  const buckets = new Map<string, number[]>()
  for (const row of results ?? []) {
    if (!row.provider_timings)
      continue
    try {
      const parsed = JSON.parse(row.provider_timings) as Record<string, unknown>
      if (!isPlainObject(parsed))
        continue
      for (const [provider, rawDuration] of Object.entries(parsed)) {
        const duration = normalizeNumber(rawDuration, { min: 0, max: MAX_PROVIDER_DURATION_MS })
        if (typeof duration !== 'number')
          continue
        const list = buckets.get(provider) ?? []
        list.push(duration)
        buckets.set(provider, list)
      }
    }
    catch {
      // Ignore malformed historical rows.
    }
  }

  const result: Record<string, number> = {}
  for (const [provider, durations] of buckets.entries()) {
    result[provider] = percentile(durations, 0.95)
  }
  return result
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
  searchSlowCount: number
  avgFirstResultMs: number
  providerMetrics: Array<{
    provider: string
    calls: number
    avgDuration: number
    p95Duration: number
    maxDuration: number
    resultCount: number
    errorCount: number
    timeoutCount: number
    slowCount: number
    slowRate: number
  }>
  featureUseSourceTypeDistribution: Record<string, number>
  featureUseItemKindDistribution: Record<string, number>
  featureUsePluginDistribution: Record<string, number>
  featureUseCategoryDistribution: Record<string, number>
  updateActionDistribution: Record<string, number>
  updateStageDistribution: Record<string, number>
  updateResultDistribution: Record<string, number>
  updateChannelDistribution: Record<string, number>
  updateSourceDistribution: Record<string, number>
  updateTagDistribution: Record<string, number>
  updateItemKindDistribution: Record<string, number>
  versionDistribution: Record<string, number>
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
  const startDateStr = startDate.toISOString().slice(0, 10)

  // Get daily stats
  const { results: storedDailyResults } = await db.prepare(`
    SELECT date, stat_type, stat_key, value
    FROM ${DAILY_STATS_TABLE}
    WHERE date >= ?1
    ORDER BY date DESC;
  `).bind(startDateStr).all<{ date: string, stat_type: string, stat_key: string, value: number }>()
  const dailyResults = await withUnrolledTelemetryDays(db, storedDailyResults ?? [], { from: startDateStr })

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
  const searchProviderTimeTotals: Record<string, number> = {}
  const searchProviderTimeCounts: Record<string, number> = {}
  const searchProviderTimeMax: Record<string, number> = {}
  const searchProviderErrorCounts: Record<string, number> = {}
  const searchProviderTimeoutCounts: Record<string, number> = {}
  const searchProviderSlowCounts: Record<string, number> = {}
  const featureUseSourceTypeDist: Record<string, number> = {}
  const featureUseItemKindDist: Record<string, number> = {}
  const featureUsePluginDist: Record<string, number> = {}
  const featureUseCategoryDist: Record<string, number> = {}
  const updateActionDist: Record<string, number> = {}
  const updateStageDist: Record<string, number> = {}
  const updateResultDist: Record<string, number> = {}
  const updateChannelDist: Record<string, number> = {}
  const updateSourceDist: Record<string, number> = {}
  const updateTagDist: Record<string, number> = {}
  const updateItemKindDist: Record<string, number> = {}
  const moduleLoadTotals: Record<string, number> = {}
  const moduleLoadCounts: Record<string, number> = {}
  const moduleLoadMax: Record<string, number> = {}
  const moduleLoadMin: Record<string, number> = {}
  const versionDistribution: Record<string, number> = {}
  let totalEvents = 0
  let totalUsers = 0
  let totalSearches = 0
  let totalDuration = 0
  let queryLengthTotal = 0
  let queryLengthCount = 0
  let sortingTotal = 0
  let resultTotal = 0
  let resultCount = 0
  let firstResultTotal = 0
  let firstResultCount = 0
  let searchSlowCount = 0
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

  for (const row of dailyResults) {
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
      case 'search_provider_time_total':
        searchProviderTimeTotals[row.stat_key] =
          (searchProviderTimeTotals[row.stat_key] || 0) + row.value
        break
      case 'search_provider_time_count':
        searchProviderTimeCounts[row.stat_key] =
          (searchProviderTimeCounts[row.stat_key] || 0) + row.value
        break
      case 'search_provider_time_max':
        searchProviderTimeMax[row.stat_key] = Math.max(
          searchProviderTimeMax[row.stat_key] || 0,
          row.value,
        )
        break
      case 'search_provider_error':
        searchProviderErrorCounts[row.stat_key] =
          (searchProviderErrorCounts[row.stat_key] || 0) + row.value
        break
      case 'search_provider_timeout':
        searchProviderTimeoutCounts[row.stat_key] =
          (searchProviderTimeoutCounts[row.stat_key] || 0) + row.value
        break
      case 'search_provider_slow':
        searchProviderSlowCounts[row.stat_key] =
          (searchProviderSlowCounts[row.stat_key] || 0) + row.value
        break
      case 'search_provider_result':
        searchProviderResultDist[row.stat_key] = (searchProviderResultDist[row.stat_key] || 0) + row.value
        break
      case 'search_result_category':
        searchResultCategoryDist[row.stat_key] = (searchResultCategoryDist[row.stat_key] || 0) + row.value
        break
      case 'search_first_result_total':
        firstResultTotal += row.value
        break
      case 'search_first_result_count':
        firstResultCount += row.value
        break
      case 'search_slow_count':
        searchSlowCount += row.value
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
      case 'feature_use_category':
        featureUseCategoryDist[row.stat_key] = (featureUseCategoryDist[row.stat_key] || 0) + row.value
        break
      case 'update_action':
        updateActionDist[row.stat_key] = (updateActionDist[row.stat_key] || 0) + row.value
        break
      case 'update_stage':
        updateStageDist[row.stat_key] = (updateStageDist[row.stat_key] || 0) + row.value
        break
      case 'update_result':
        updateResultDist[row.stat_key] = (updateResultDist[row.stat_key] || 0) + row.value
        break
      case 'update_channel':
        updateChannelDist[row.stat_key] = (updateChannelDist[row.stat_key] || 0) + row.value
        break
      case 'update_source':
        updateSourceDist[row.stat_key] = (updateSourceDist[row.stat_key] || 0) + row.value
        break
      case 'update_tag':
        updateTagDist[row.stat_key] = (updateTagDist[row.stat_key] || 0) + row.value
        break
      case 'update_item_kind':
        updateItemKindDist[row.stat_key] = (updateItemKindDist[row.stat_key] || 0) + row.value
        break
      case 'feature_use_entity': {
        const [entityType, entityId = ''] = row.stat_key.split(':')
        const level1 = normalizeUsageCategoryPart(entityType) || 'others'
        const level2 = level1 === 'app'
          ? resolveAppCategory(entityId)
          : 'others'
        const categoryKey = `${level1}:${level2}`
        featureUseCategoryDist[categoryKey] = (featureUseCategoryDist[categoryKey] || 0) + row.value
        break
      }
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

  const startTime = startDate.toISOString()
  const { results: versionRows } = await db.prepare(`
    SELECT version, COUNT(DISTINCT COALESCE(user_id, client_id, device_fingerprint)) as users
    FROM ${TELEMETRY_TABLE}
    WHERE event_type = 'visit'
      AND version IS NOT NULL
      AND version != ''
      AND created_at >= ?1
    GROUP BY version
    ORDER BY users DESC
    LIMIT 50;
  `).bind(startTime).all<{ version: string, users: number }>()

  for (const row of versionRows ?? []) {
    if (!row?.version)
      continue
    versionDistribution[row.version] = Number(row.users) || 0
  }

  const providerIds = new Set([
    ...Object.keys(searchProviderDist),
    ...Object.keys(searchProviderTimeTotals),
    ...Object.keys(searchProviderTimeCounts),
    ...Object.keys(searchProviderResultDist),
    ...Object.keys(searchProviderErrorCounts),
    ...Object.keys(searchProviderTimeoutCounts),
    ...Object.keys(searchProviderSlowCounts),
  ])
  const providerP95 = await getSearchProviderP95Durations(db, startTime)
  const providerMetrics = Array.from(providerIds)
    .map((provider) => {
      const calls = searchProviderDist[provider] || searchProviderTimeCounts[provider] || 0
      const timeCount = searchProviderTimeCounts[provider] || calls
      const totalTime = searchProviderTimeTotals[provider] || 0
      const avgDuration = timeCount > 0 ? Math.round(totalTime / timeCount) : 0
      const slowCount = searchProviderSlowCounts[provider] || 0
      return {
        provider,
        calls,
        avgDuration,
        p95Duration: providerP95[provider] || 0,
        maxDuration: Math.round(searchProviderTimeMax[provider] || 0),
        resultCount: searchProviderResultDist[provider] || 0,
        errorCount: searchProviderErrorCounts[provider] || 0,
        timeoutCount: searchProviderTimeoutCounts[provider] || 0,
        slowCount,
        slowRate: calls > 0 ? Number(((slowCount / calls) * 100).toFixed(1)) : 0,
      }
    })
    .sort((a, b) => b.slowRate - a.slowRate || b.p95Duration - a.p95Duration || b.calls - a.calls)

  return {
    totalEvents,
    totalUsers,
    totalSearches,
    avgSearchDuration: totalSearches > 0 ? Math.round(totalDuration / totalSearches) : 0,
    avgQueryLength: queryLengthCount > 0 ? Math.round(queryLengthTotal / queryLengthCount) : 0,
    avgSortingDuration: totalSearches > 0 ? Math.round(sortingTotal / totalSearches) : 0,
    avgResultCount: resultCount > 0 ? Math.round(resultTotal / resultCount) : 0,
    avgFirstResultMs: firstResultCount > 0 ? Math.round(firstResultTotal / firstResultCount) : 0,
    searchSlowCount,
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
    providerMetrics,
    featureUseSourceTypeDistribution: featureUseSourceTypeDist,
    featureUseItemKindDistribution: featureUseItemKindDist,
    featureUsePluginDistribution: featureUsePluginDist,
    featureUseCategoryDistribution: featureUseCategoryDist,
    updateActionDistribution: updateActionDist,
    updateStageDistribution: updateStageDist,
    updateResultDistribution: updateResultDist,
    updateChannelDistribution: updateChannelDist,
    updateSourceDistribution: updateSourceDist,
    updateTagDistribution: updateTagDist,
    updateItemKindDistribution: updateItemKindDist,
    versionDistribution,
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

  // Count recent searches and visits, the two types read below. Bounded by `created_at` alone, the
  // planner walked all of `idx_telemetry_event_geo` for the GROUP BY: every event in the table, on
  // every view of the analytics page.
  const { results } = await db.prepare(`
    SELECT
      event_type,
      COUNT(*) as count,
      AVG(search_duration_ms) as avg_duration
    FROM ${TELEMETRY_TABLE}
    WHERE event_type IN ('search', 'visit') AND created_at >= ?1
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
    WHERE event_type IN (${TELEMETRY_EVENT_TYPES_SQL}) AND created_at >= ?1 AND user_id IS NOT NULL;
  `).bind(yesterdayStr).all<{ count: number }>()

  const activeUsers = userResults?.[0]?.count || 0

  return {
    searchesLast24h,
    visitsLast24h,
    activeUsers,
    avgLatency,
  }
}

const GEO_COUNTRY_EXPR = `COALESCE(NULLIF(country_code, ''), NULLIF(region, ''), 'Unknown')`
const GEO_SUBDIVISION_EXPR = `COALESCE(NULLIF(region_code, ''), NULLIF(region_name, ''), 'Unknown')`

function normalizeCountryFilter(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim().toUpperCase()
  if (!normalized) {
    return null
  }
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

function toNullableNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : null
}

export interface AdminGeoAnalytics {
  summary: {
    totalSearches: number
    uniqueIps: number
    countryCount: number
    subdivisionCount: number
    version: string | null
  }
  countries: Array<{
    countryCode: string
    count: number
    latitude: number | null
    longitude: number | null
  }>
  subdivisions: Array<{
    countryCode: string
    regionCode: string | null
    regionName: string | null
    count: number
    latitude: number | null
    longitude: number | null
  }>
  topIps: Array<{
    ip: string
    count: number
    lastSeenAt: string
    countryCode: string | null
    regionCode: string | null
    city: string | null
  }>
  generatedAt: string
}

export async function getAdminGeoAnalytics(
  event: H3Event,
  options: { days?: number, country?: string | null, version?: string | null, limit?: number } = {},
): Promise<AdminGeoAnalytics> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTelemetrySchema(db)

  const days = Math.max(1, Math.min(90, Number(options.days) || 30))
  const limit = Math.min(Math.max(Math.round(options.limit || 200), 10), 500)
  const countryFilter = normalizeCountryFilter(options.country)
  const requestedVersion = typeof options.version === 'string' ? options.version.trim() : ''
  const versionFilter = requestedVersion || null

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString()

  const summary = await db.prepare(`
    SELECT
      COUNT(*) AS total_searches,
      COUNT(DISTINCT CASE WHEN ip IS NOT NULL AND ip != '' THEN ip END) AS unique_ips,
      COUNT(DISTINCT ${GEO_COUNTRY_EXPR}) AS country_count,
      COUNT(DISTINCT (${GEO_COUNTRY_EXPR} || ':' || ${GEO_SUBDIVISION_EXPR})) AS subdivision_count
    FROM ${TELEMETRY_TABLE}
    WHERE event_type = 'search'
      AND created_at >= ?1
      AND (?2 IS NULL OR ${GEO_COUNTRY_EXPR} = ?2)
      AND (?3 IS NULL OR version = ?3);
  `).bind(startDateStr, countryFilter, versionFilter).first<{
    total_searches?: number
    unique_ips?: number
    country_count?: number
    subdivision_count?: number
  }>()

  const countryRows = await db.prepare(`
    SELECT
      ${GEO_COUNTRY_EXPR} AS country_code,
      COUNT(*) AS count,
      AVG(latitude) AS latitude,
      AVG(longitude) AS longitude
    FROM ${TELEMETRY_TABLE}
    WHERE event_type = 'search'
      AND created_at >= ?1
      AND (?2 IS NULL OR ${GEO_COUNTRY_EXPR} = ?2)
      AND (?4 IS NULL OR version = ?4)
    GROUP BY country_code
    ORDER BY count DESC
    LIMIT ?3;
  `).bind(startDateStr, countryFilter, limit, versionFilter).all<{
    country_code?: string
    count?: number
    latitude?: number | null
    longitude?: number | null
  }>()

  const subdivisionRows = await db.prepare(`
    SELECT
      ${GEO_COUNTRY_EXPR} AS country_code,
      NULLIF(region_code, '') AS region_code,
      NULLIF(region_name, '') AS region_name,
      COUNT(*) AS count,
      AVG(latitude) AS latitude,
      AVG(longitude) AS longitude
    FROM ${TELEMETRY_TABLE}
    WHERE event_type = 'search'
      AND created_at >= ?1
      AND (?2 IS NULL OR ${GEO_COUNTRY_EXPR} = ?2)
      AND (?4 IS NULL OR version = ?4)
    GROUP BY country_code, ${GEO_SUBDIVISION_EXPR}
    ORDER BY count DESC
    LIMIT ?3;
  `).bind(startDateStr, countryFilter, limit, versionFilter).all<{
    country_code?: string
    region_code?: string | null
    region_name?: string | null
    count?: number
    latitude?: number | null
    longitude?: number | null
  }>()

  const ipRows = await db.prepare(`
    SELECT
      te.ip AS ip,
      COUNT(*) AS count,
      MAX(te.created_at) AS last_seen_at,
      (
        SELECT ${GEO_COUNTRY_EXPR}
        FROM ${TELEMETRY_TABLE} latest
        WHERE latest.ip = te.ip
          AND latest.event_type = 'search'
          AND latest.created_at >= ?1
          AND (?4 IS NULL OR latest.version = ?4)
        ORDER BY latest.created_at DESC
        LIMIT 1
      ) AS country_code,
      (
        SELECT NULLIF(region_code, '')
        FROM ${TELEMETRY_TABLE} latest
        WHERE latest.ip = te.ip
          AND latest.event_type = 'search'
          AND latest.created_at >= ?1
          AND (?4 IS NULL OR latest.version = ?4)
        ORDER BY latest.created_at DESC
        LIMIT 1
      ) AS region_code,
      (
        SELECT NULLIF(city, '')
        FROM ${TELEMETRY_TABLE} latest
        WHERE latest.ip = te.ip
          AND latest.event_type = 'search'
          AND latest.created_at >= ?1
          AND (?4 IS NULL OR latest.version = ?4)
        ORDER BY latest.created_at DESC
        LIMIT 1
      ) AS city
    FROM ${TELEMETRY_TABLE} te
    WHERE te.event_type = 'search'
      AND te.created_at >= ?1
      AND te.ip IS NOT NULL
      AND te.ip != ''
      AND (?2 IS NULL OR ${GEO_COUNTRY_EXPR} = ?2)
      AND (?4 IS NULL OR te.version = ?4)
    GROUP BY te.ip
    ORDER BY count DESC, last_seen_at DESC
    LIMIT ?3;
  `).bind(startDateStr, countryFilter, limit, versionFilter).all<{
    ip?: string
    count?: number
    last_seen_at?: string
    country_code?: string | null
    region_code?: string | null
    city?: string | null
  }>()

  return {
    summary: {
      totalSearches: Number(summary?.total_searches ?? 0),
      uniqueIps: Number(summary?.unique_ips ?? 0),
      countryCount: Number(summary?.country_count ?? 0),
      subdivisionCount: Number(summary?.subdivision_count ?? 0),
      version: versionFilter,
    },
    countries: (countryRows.results ?? []).map(row => ({
      countryCode: row.country_code || 'Unknown',
      count: Number(row.count ?? 0),
      latitude: toNullableNumber(row.latitude),
      longitude: toNullableNumber(row.longitude),
    })),
    subdivisions: (subdivisionRows.results ?? []).map(row => ({
      countryCode: row.country_code || 'Unknown',
      regionCode: row.region_code ?? null,
      regionName: row.region_name ?? null,
      count: Number(row.count ?? 0),
      latitude: toNullableNumber(row.latitude),
      longitude: toNullableNumber(row.longitude),
    })),
    topIps: (ipRows.results ?? [])
      .filter(row => typeof row.ip === 'string' && row.ip.trim())
      .map(row => ({
        ip: row.ip as string,
        count: Number(row.count ?? 0),
        lastSeenAt: row.last_seen_at || '',
        countryCode: row.country_code ?? null,
        regionCode: row.region_code ?? null,
        city: row.city ?? null,
      })),
    generatedAt: new Date().toISOString(),
  }
}

export interface AdminVersionAnalytics {
  summary: {
    days: number
    totalVisits: number
    totalSearches: number
    versionCount: number
  }
  versions: Array<{
    version: string
    visits: number
    searches: number
    users: number
    avgSearchDuration: number
    firstSeenAt: string | null
    lastSeenAt: string | null
  }>
  generatedAt: string
}

export async function getAdminVersionAnalytics(
  event: H3Event,
  options: { days?: number } = {},
): Promise<AdminVersionAnalytics> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTelemetrySchema(db)

  // Same 90-day ceiling as `getAdminGeoAnalytics`: the two are read together in
  // the Versions & Geo panel, so a window they disagree about would print two
  // ranges under one selector.
  const days = Math.max(1, Math.min(90, Number(options.days) || 30))

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startDateStr = startDate.toISOString()

  const versionRows = await db.prepare(`
    SELECT
      version AS version,
      COUNT(CASE WHEN event_type = 'visit' THEN 1 END) AS visits,
      COUNT(CASE WHEN event_type = 'search' THEN 1 END) AS searches,
      COUNT(DISTINCT COALESCE(user_id, client_id, device_fingerprint)) AS users,
      AVG(CASE WHEN event_type = 'search' THEN search_duration_ms END) AS avg_search_duration,
      MIN(created_at) AS first_seen_at,
      MAX(created_at) AS last_seen_at
    FROM ${TELEMETRY_TABLE}
    WHERE event_type IN ('visit', 'search')
      AND version IS NOT NULL
      AND version != ''
      AND created_at >= ?1
    GROUP BY version;
  `).bind(startDateStr).all<{
    version?: string
    visits?: number
    searches?: number
    users?: number
    avg_search_duration?: number | null
    first_seen_at?: string | null
    last_seen_at?: string | null
  }>()

  const versions: AdminVersionAnalytics['versions'] = (versionRows.results ?? [])
    .filter(row => typeof row.version === 'string' && row.version.length > 0)
    .map((row) => {
      const avgSearchDuration = Number(row.avg_search_duration ?? 0)
      return {
        version: row.version as string,
        visits: Number(row.visits ?? 0),
        searches: Number(row.searches ?? 0),
        users: Number(row.users ?? 0),
        avgSearchDuration: Number.isFinite(avgSearchDuration) ? Math.round(avgSearchDuration) : 0,
        firstSeenAt: row.first_seen_at ?? null,
        lastSeenAt: row.last_seen_at ?? null,
      }
    })
    .sort((a, b) => b.visits - a.visits || b.searches - a.searches || a.version.localeCompare(b.version))

  return {
    summary: {
      days,
      totalVisits: versions.reduce((sum, item) => sum + item.visits, 0),
      totalSearches: versions.reduce((sum, item) => sum + item.searches, 0),
      versionCount: versions.length,
    },
    versions,
    generatedAt: new Date().toISOString(),
  }
}

export interface UserTelemetryOverview {
  summary: {
    searches: number
    avgLatency: number
    avgResultCount: number
    lastSearchAt: string | null
  }
  daily: Array<{
    date: string
    searches: number
    avgLatency: number
    avgResultCount: number
  }>
}

export async function getUserTelemetryOverview(
  event: H3Event,
  userId: string,
  options: { days?: number } = {},
): Promise<UserTelemetryOverview> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTelemetrySchema(db)

  const days = Math.max(1, Math.min(90, Number(options.days) || 30))
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days + 1)
  startDate.setHours(0, 0, 0, 0)
  const startDateStr = startDate.toISOString()

  const summaryRow = await db.prepare(`
    SELECT
      COUNT(*) AS searches,
      AVG(search_duration_ms) AS avg_latency,
      AVG(search_result_count) AS avg_result_count,
      MAX(created_at) AS last_search_at
    FROM ${TELEMETRY_TABLE}
    WHERE user_id = ?1
      AND event_type = 'search'
      AND created_at >= ?2;
  `).bind(userId, startDateStr).first<{
    searches?: number
    avg_latency?: number | null
    avg_result_count?: number | null
    last_search_at?: string | null
  }>()

  const dailyRows = await db.prepare(`
    SELECT
      substr(created_at, 1, 10) AS date,
      COUNT(*) AS searches,
      AVG(search_duration_ms) AS avg_latency,
      AVG(search_result_count) AS avg_result_count
    FROM ${TELEMETRY_TABLE}
    WHERE user_id = ?1
      AND event_type = 'search'
      AND created_at >= ?2
    GROUP BY substr(created_at, 1, 10)
    ORDER BY date ASC;
  `).bind(userId, startDateStr).all<{
    date?: string
    searches?: number
    avg_latency?: number | null
    avg_result_count?: number | null
  }>()

  const dailyMap = new Map<string, { searches: number, avgLatency: number, avgResultCount: number }>()
  for (const row of dailyRows.results ?? []) {
    const date = row.date || ''
    if (!date)
      continue

    dailyMap.set(date, {
      searches: Number(row.searches ?? 0),
      avgLatency: Math.round(Number(row.avg_latency ?? 0)),
      avgResultCount: Math.round(Number(row.avg_result_count ?? 0)),
    })
  }

  const daily: UserTelemetryOverview['daily'] = []
  for (let i = days - 1; i >= 0; i--) {
    const pointDate = new Date()
    pointDate.setHours(0, 0, 0, 0)
    pointDate.setDate(pointDate.getDate() - i)
    const date = pointDate.toISOString().slice(0, 10)
    const existing = dailyMap.get(date)
    daily.push({
      date,
      searches: existing?.searches ?? 0,
      avgLatency: existing?.avgLatency ?? 0,
      avgResultCount: existing?.avgResultCount ?? 0,
    })
  }

  return {
    summary: {
      searches: Number(summaryRow?.searches ?? 0),
      avgLatency: Math.round(Number(summaryRow?.avg_latency ?? 0)),
      avgResultCount: Math.round(Number(summaryRow?.avg_result_count ?? 0)),
      lastSearchAt: summaryRow?.last_search_at ?? null,
    },
    daily,
  }
}
