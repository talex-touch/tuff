import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const PROVIDER_REGISTRY_TABLE = 'provider_registry'
const AUDITS_TABLE = 'intelligence_audits'

function getD1Database(event: H3Event): D1Database | null {
  return readCloudflareBindings(event)?.DB ?? null
}

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db)
    throw new Error('Cloudflare D1 database is not available.')
  return db
}

const INTELLIGENCE_SCHEMA = defineD1Schema('intelligence', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${AUDITS_TABLE} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        provider_type TEXT NOT NULL,
        model TEXT NOT NULL,
        endpoint TEXT,
        status INTEGER,
        latency INTEGER,
        success INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        trace_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_audits_user_id ON ${AUDITS_TABLE}(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_audits_provider_id ON ${AUDITS_TABLE}(provider_id)`,
    `CREATE INDEX IF NOT EXISTS idx_intelligence_audits_created_at ON ${AUDITS_TABLE}(created_at)`,
  ],
  columns: [
    {
      table: AUDITS_TABLE,
      columns: [
        { name: 'metadata', ddl: 'metadata TEXT' },
      ],
    },
  ],
})

async function ensureSchema(db: D1Database) {
  await ensureD1Schema(db, INTELLIGENCE_SCHEMA)
}

export interface IntelligenceAuditRow {
  id: string
  user_id: string
  provider_id: string
  provider_type: string
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: number
  error_message: string | null
  trace_id: string | null
  metadata: string | null
  created_at: string
  provider_name?: string | null
}

export interface IntelligenceAuditRecord {
  id: string
  userId: string
  providerId: string
  providerType: string
  providerName: string | null
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: boolean
  errorMessage: string | null
  traceId: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

function mapAuditRow(row: IntelligenceAuditRow): IntelligenceAuditRecord {
  let metadata: Record<string, any> | null = null
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata)
    }
    catch {
      metadata = null
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    providerType: row.provider_type,
    providerName: row.provider_name ?? null,
    model: row.model,
    endpoint: row.endpoint,
    status: typeof row.status === 'number' ? row.status : null,
    latency: typeof row.latency === 'number' ? row.latency : null,
    success: row.success === 1,
    errorMessage: row.error_message,
    traceId: row.trace_id,
    metadata,
    createdAt: row.created_at,
  }
}

function normalizeAuditMetadata(value?: Record<string, any> | null): string | null {
  if (!value)
    return null
  try {
    const json = JSON.stringify(value)
    return json.length > 2000 ? json.slice(0, 2000) : json
  }
  catch {
    return null
  }
}

export async function createAudit(
  event: H3Event,
  data: {
    userId: string
    providerId: string
    providerType: string
    model: string
    endpoint?: string | null
    status?: number | null
    latency?: number | null
    success: boolean
    errorMessage?: string | null
    traceId?: string | null
    metadata?: Record<string, any> | null
  },
): Promise<void> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const id = `ia_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
  const now = new Date().toISOString()
  const metadata = normalizeAuditMetadata(data.metadata)

  await db.prepare(`
    INSERT INTO ${AUDITS_TABLE}
      (id, user_id, provider_id, provider_type, model, endpoint, status, latency, success, error_message, trace_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    data.userId,
    data.providerId,
    data.providerType,
    data.model,
    data.endpoint || null,
    data.status ?? null,
    data.latency ?? null,
    data.success ? 1 : 0,
    data.errorMessage ? data.errorMessage.slice(0, 600) : null,
    data.traceId ?? null,
    metadata,
    now,
  ).run()
}

export async function listAudits(
  event: H3Event,
  options?: {
    limit?: number
    offset?: number
    providerId?: string | null
    userId?: string | null
  },
): Promise<{ audits: IntelligenceAuditRecord[], total: number }> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200)
  const offset = Math.max(options?.offset ?? 0, 0)
  const conditions: string[] = []
  const values: unknown[] = []

  if (options?.userId) {
    conditions.push('a.user_id = ?')
    values.push(options.userId)
  }
  if (options?.providerId) {
    conditions.push('a.provider_id = ?')
    values.push(options.providerId)
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const [countRes, rowsRes] = await db.batch([
    db.prepare(`SELECT COUNT(1) AS total FROM ${AUDITS_TABLE} a ${whereClause}`).bind(...values),
    db.prepare(`
      SELECT a.*, p.display_name AS provider_name
      FROM ${AUDITS_TABLE} a
      LEFT JOIN ${PROVIDER_REGISTRY_TABLE} p ON a.provider_id = p.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...values, limit, offset),
  ])

  const total = Number((countRes?.results?.[0] as { total?: number } | undefined)?.total ?? 0)
  const audits = ((rowsRes?.results ?? []) as IntelligenceAuditRow[]).map(mapAuditRow)
  return { audits, total }
}

export interface AiGatewayUsageSummary {
  window: { days: number, since: string, until: string }
  summary: {
    totalRequests: number
    successCount: number
    failureCount: number
    successRate: number
    avgLatencyMs: number
    totalTokens: number
  }
  byModel: Array<{
    model: string
    requests: number
    successRate: number
    avgLatencyMs: number
    totalTokens: number
  }>
  byProvider: Array<{
    providerId: string
    providerName: string
    requests: number
    successRate: number
    avgLatencyMs: number
    totalTokens: number
  }>
  dailySeries: Array<{
    date: string
    requests: number
    successCount: number
    avgLatencyMs: number
    totalTokens: number
  }>
}

/**
 * Pure D1 SQL `GROUP BY` aggregation for AI Gateway usage — never scans raw rows into memory.
 */
export async function getAiGatewayUsageAggregated(
  event: H3Event,
  options: { days?: number, userId?: string | null, providerId?: string | null } = {},
): Promise<AiGatewayUsageSummary> {
  const db = requireDatabase(event)
  await ensureSchema(db)

  const days = Math.min(Math.max(Math.floor(options.days ?? 30), 1), 365)
  const untilDate = new Date()
  const sinceDate = new Date(untilDate.getTime() - days * 86_400_000)
  const since = sinceDate.toISOString()
  const until = untilDate.toISOString()

  const conditions: string[] = ['a.created_at >= ?1']
  const params: Array<string | number> = [since]

  if (options.userId) {
    params.push(options.userId)
    conditions.push(`a.user_id = ?${params.length}`)
  }
  if (options.providerId) {
    params.push(options.providerId)
    conditions.push(`a.provider_id = ?${params.length}`)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`
  const tokenExpr = `COALESCE(
    CAST(json_extract(a.metadata, '$.tokens') AS INTEGER),
    CAST(json_extract(a.metadata, '$.totalTokens') AS INTEGER),
    CAST(json_extract(a.metadata, '$.usage.totalTokens') AS INTEGER),
    0
  )`

  const [totalsRes, modelRes, providerRes, dailyRes] = await db.batch([
    db.prepare(`
      SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN a.success = 1 THEN 1 ELSE 0 END) AS success_count,
        AVG(CASE WHEN a.latency IS NOT NULL THEN a.latency END) AS avg_latency,
        SUM(${tokenExpr}) AS total_tokens
      FROM ${AUDITS_TABLE} a
      ${whereClause};
    `).bind(...params),
    db.prepare(`
      SELECT
        a.model AS model,
        COUNT(*) AS requests,
        SUM(CASE WHEN a.success = 1 THEN 1 ELSE 0 END) AS success_count,
        AVG(CASE WHEN a.latency IS NOT NULL THEN a.latency END) AS avg_latency,
        SUM(${tokenExpr}) AS total_tokens
      FROM ${AUDITS_TABLE} a
      ${whereClause}
      GROUP BY a.model
      ORDER BY requests DESC
      LIMIT 20;
    `).bind(...params),
    db.prepare(`
      SELECT
        a.provider_id AS provider_id,
        COALESCE(MAX(p.display_name), MAX(a.provider_type), a.provider_id) AS provider_name,
        COUNT(*) AS requests,
        SUM(CASE WHEN a.success = 1 THEN 1 ELSE 0 END) AS success_count,
        AVG(CASE WHEN a.latency IS NOT NULL THEN a.latency END) AS avg_latency,
        SUM(${tokenExpr}) AS total_tokens
      FROM ${AUDITS_TABLE} a
      LEFT JOIN ${PROVIDER_REGISTRY_TABLE} p ON a.provider_id = p.id
      ${whereClause}
      GROUP BY a.provider_id
      ORDER BY requests DESC
      LIMIT 20;
    `).bind(...params),
    db.prepare(`
      SELECT
        substr(a.created_at, 1, 10) AS day,
        COUNT(*) AS requests,
        SUM(CASE WHEN a.success = 1 THEN 1 ELSE 0 END) AS success_count,
        AVG(CASE WHEN a.latency IS NOT NULL THEN a.latency END) AS avg_latency,
        SUM(${tokenExpr}) AS total_tokens
      FROM ${AUDITS_TABLE} a
      ${whereClause}
      GROUP BY day
      ORDER BY day ASC;
    `).bind(...params),
  ])

  const totals = (totalsRes?.results?.[0] ?? {}) as {
    total_requests?: number
    success_count?: number
    avg_latency?: number | null
    total_tokens?: number | null
  }
  const totalRequests = Number(totals.total_requests ?? 0)
  const successCount = Number(totals.success_count ?? 0)
  const failureCount = Math.max(0, totalRequests - successCount)

  return {
    window: { days, since, until },
    summary: {
      totalRequests,
      successCount,
      failureCount,
      successRate: totalRequests > 0 ? Number(((successCount / totalRequests) * 100).toFixed(1)) : 0,
      avgLatencyMs: totals.avg_latency ? Math.round(Number(totals.avg_latency)) : 0,
      totalTokens: Number(totals.total_tokens ?? 0),
    },
    byModel: ((modelRes?.results ?? []) as Array<Record<string, unknown>>).map((row) => {
      const requests = Number(row.requests ?? 0)
      const ok = Number(row.success_count ?? 0)
      return {
        model: String(row.model ?? 'unknown'),
        requests,
        successRate: requests > 0 ? Number(((ok / requests) * 100).toFixed(1)) : 0,
        avgLatencyMs: row.avg_latency ? Math.round(Number(row.avg_latency)) : 0,
        totalTokens: Number(row.total_tokens ?? 0),
      }
    }),
    byProvider: ((providerRes?.results ?? []) as Array<Record<string, unknown>>).map((row) => {
      const requests = Number(row.requests ?? 0)
      const ok = Number(row.success_count ?? 0)
      return {
        providerId: String(row.provider_id ?? ''),
        providerName: String(row.provider_name ?? row.provider_id ?? 'unknown'),
        requests,
        successRate: requests > 0 ? Number(((ok / requests) * 100).toFixed(1)) : 0,
        avgLatencyMs: row.avg_latency ? Math.round(Number(row.avg_latency)) : 0,
        totalTokens: Number(row.total_tokens ?? 0),
      }
    }),
    dailySeries: ((dailyRes?.results ?? []) as Array<Record<string, unknown>>).map(row => ({
      date: String(row.day ?? ''),
      requests: Number(row.requests ?? 0),
      successCount: Number(row.success_count ?? 0),
      avgLatencyMs: row.avg_latency ? Math.round(Number(row.avg_latency)) : 0,
      totalTokens: Number(row.total_tokens ?? 0),
    })),
  }
}
