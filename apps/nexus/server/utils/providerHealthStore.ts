import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const HEALTH_TABLE = 'provider_health_checks'
const initializedSchemas = new WeakSet<D1Database>()

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface ProviderHealthCheckInput {
  success: boolean
  providerId?: string
  capability: string
  latency: number
  endpoint: string
  requestId?: string
  message: string
  error?: {
    code?: string
    message: string
    status?: number
  }
}

export interface ProviderHealthCheckEntry {
  id: string
  providerId: string
  providerName: string
  vendor: string
  capability: string
  status: ProviderHealthStatus
  latencyMs: number
  endpoint: string
  requestId: string | null
  degradedReason: string | null
  errorCode: string | null
  errorMessage: string | null
  checkedAt: string
}

interface ProviderHealthCheckRow {
  id: string
  provider_id: string
  provider_name: string
  vendor: string
  capability: string
  status: string
  latency_ms: number
  endpoint: string
  request_id: string | null
  degraded_reason: string | null
  error_code: string | null
  error_message: string | null
  checked_at: string
}

export interface ListProviderHealthChecksOptions {
  providerId?: string
  capability?: string
  status?: ProviderHealthStatus
  page?: number
  limit?: number
}

export interface LatestProviderHealthChecksOptions {
  providerIds: string[]
  capability?: string
}

export interface ProviderHealthCheckList {
  entries: ProviderHealthCheckEntry[]
  page: number
  limit: number
  total: number
}

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

async function ensureProviderHealthSchema(db: D1Database) {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${HEALTH_TABLE} (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      vendor TEXT NOT NULL,
      capability TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      endpoint TEXT NOT NULL,
      request_id TEXT,
      degraded_reason TEXT,
      error_code TEXT,
      error_message TEXT,
      checked_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_health_provider ON ${HEALTH_TABLE}(provider_id, checked_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_health_capability ON ${HEALTH_TABLE}(capability, checked_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_health_status ON ${HEALTH_TABLE}(status, checked_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_health_checked_at ON ${HEALTH_TABLE}(checked_at);`).run()

  initializedSchemas.add(db)
}

function clampText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  if (!trimmed)
    return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function readOptionalString(value: unknown, field: string, maxLength = 180): string | undefined {
  if (value == null)
    return undefined
  const normalized = clampText(value, maxLength)
  if (!normalized) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return normalized
}

function assertEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value as T
}

function clampPagination(page?: number, limit?: number) {
  const safePage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1
  const safeLimit = Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 50
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

function normalizeLatency(value: unknown): number {
  const latency = Number(value)
  return Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : 0
}

function resolveHealthStatus(provider: ProviderRegistryRecord, result: ProviderHealthCheckInput): ProviderHealthStatus {
  if (result.success)
    return 'healthy'
  if (provider.status === 'degraded')
    return 'degraded'
  return 'unhealthy'
}

function resolveDegradedReason(result: ProviderHealthCheckInput): string | null {
  if (result.success)
    return null
  return clampText(result.error?.code, 160)
    ?? clampText(result.error?.message, 500)
    ?? clampText(result.message, 500)
}

function mapHealthRow(row: ProviderHealthCheckRow): ProviderHealthCheckEntry {
  return {
    id: row.id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    vendor: row.vendor,
    capability: row.capability,
    status: row.status as ProviderHealthStatus,
    latencyMs: Number(row.latency_ms),
    endpoint: row.endpoint,
    requestId: row.request_id,
    degradedReason: row.degraded_reason,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    checkedAt: row.checked_at,
  }
}

function buildHealthWhere(options: ListProviderHealthChecksOptions) {
  const conditions: string[] = []
  const values: string[] = []

  if (options.providerId) {
    conditions.push('provider_id = ?')
    values.push(options.providerId)
  }
  if (options.capability) {
    conditions.push('capability = ?')
    values.push(options.capability)
  }
  if (options.status) {
    conditions.push('status = ?')
    values.push(options.status)
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  }
}

export async function recordProviderHealthCheck(
  event: H3Event,
  provider: ProviderRegistryRecord,
  result: ProviderHealthCheckInput,
): Promise<ProviderHealthCheckEntry> {
  const db = getD1Database(event)
  await ensureProviderHealthSchema(db)

  const id = randomUUID()
  const checkedAt = new Date().toISOString()
  const status = resolveHealthStatus(provider, result)
  const entry: ProviderHealthCheckEntry = {
    id,
    providerId: provider.id,
    providerName: provider.displayName,
    vendor: provider.vendor,
    capability: clampText(result.capability, 160) ?? 'unknown',
    status,
    latencyMs: normalizeLatency(result.latency),
    endpoint: clampText(result.endpoint, 500) ?? '',
    requestId: clampText(result.requestId, 255),
    degradedReason: resolveDegradedReason(result),
    errorCode: clampText(result.error?.code, 160),
    errorMessage: clampText(result.error?.message, 500),
    checkedAt,
  }

  await db.prepare(`
    INSERT INTO ${HEALTH_TABLE} (
      id, provider_id, provider_name, vendor, capability, status, latency_ms, endpoint,
      request_id, degraded_reason, error_code, error_message, checked_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13);
  `).bind(
    entry.id,
    entry.providerId,
    entry.providerName,
    entry.vendor,
    entry.capability,
    entry.status,
    entry.latencyMs,
    entry.endpoint,
    entry.requestId,
    entry.degradedReason,
    entry.errorCode,
    entry.errorMessage,
    entry.checkedAt,
  ).run()

  return entry
}

export async function listProviderHealthChecks(
  event: H3Event,
  options: ListProviderHealthChecksOptions = {},
): Promise<ProviderHealthCheckList> {
  const db = getD1Database(event)
  await ensureProviderHealthSchema(db)

  const normalized: ListProviderHealthChecksOptions = {
    providerId: readOptionalString(options.providerId, 'providerId', 180),
    capability: readOptionalString(options.capability, 'capability', 160),
    status: assertEnum(options.status, 'status', ['healthy', 'degraded', 'unhealthy'] as const),
    page: options.page,
    limit: options.limit,
  }
  const { clause, values } = buildHealthWhere(normalized)
  const { page, limit, offset } = clampPagination(options.page, options.limit)

  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${HEALTH_TABLE}
    ${clause};
  `).bind(...values).first<{ total: number }>()

  const { results } = await db.prepare(`
    SELECT id, provider_id, provider_name, vendor, capability, status, latency_ms, endpoint,
      request_id, degraded_reason, error_code, error_message, checked_at
    FROM ${HEALTH_TABLE}
    ${clause}
    ORDER BY checked_at DESC
    LIMIT ? OFFSET ?;
  `).bind(...values, limit, offset).all<ProviderHealthCheckRow>()

  return {
    entries: (results ?? []).map(mapHealthRow),
    page,
    limit,
    total: Number(countRow?.total ?? 0),
  }
}

export async function getLatestProviderHealthChecks(
  event: H3Event,
  options: LatestProviderHealthChecksOptions,
): Promise<Map<string, ProviderHealthCheckEntry>> {
  const providerIds = [...new Set(options.providerIds
    .map(providerId => clampText(providerId, 180))
    .filter((providerId): providerId is string => Boolean(providerId)))]

  if (providerIds.length === 0)
    return new Map()

  const db = getD1Database(event)
  await ensureProviderHealthSchema(db)

  const capability = readOptionalString(options.capability, 'capability', 160)
  const placeholders = providerIds.map(() => '?').join(', ')
  const capabilityClause = capability ? 'AND capability = ?' : ''
  const { results } = await db.prepare(`
    SELECT id, provider_id, provider_name, vendor, capability, status, latency_ms, endpoint,
      request_id, degraded_reason, error_code, error_message, checked_at
    FROM ${HEALTH_TABLE}
    WHERE provider_id IN (${placeholders})
    ${capabilityClause}
    ORDER BY checked_at DESC;
  `).bind(...providerIds, ...(capability ? [capability] : [])).all<ProviderHealthCheckRow>()

  const latest = new Map<string, ProviderHealthCheckEntry>()
  for (const row of results ?? []) {
    if (!latest.has(row.provider_id))
      latest.set(row.provider_id, mapHealthRow(row))
  }
  return latest
}
