/**
 * `queryAuditLogs(query)` — the audit page's call record list (audit rebuild parent design §1.5).
 *
 * Filters on time range (`startMs` inclusive, `endMs` exclusive), status, channel, caller (`null`
 * or `''` = no caller), capability and model; pages with `offset` + `limit` (1..200, default 50)
 * and returns the filtered total. Rows carry only the logger's allowlisted metadata, re-sanitized
 * on read. Costs follow the same rule as the usage breakdown: rows priced against a models.dev
 * catalog keep their stored cost, older rows are re-priced with the current catalog.
 *
 * Host-only: registered behind `assertHostOwnedIntelligenceControlPlane`.
 */
import type {
  AuditLogPage,
  IntelligenceAuditLogEntry
} from '@talex-touch/utils/transport/sdk/domains/intelligence'
import type { SQL } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm'
import { intelligenceAuditLogs } from '../../../db/schema'
import { databaseModule } from '../../database'
import { sanitizeIntelligenceAuditMetadata } from '../intelligence-audit-logger'
import { estimateCostUsd } from '../pricing/model-pricing'
import { loadPricingCatalog, readPricingSinceMs } from '../pricing/models-dev-catalog'

export const AUDIT_LOG_PAGE_DEFAULT_LIMIT = 50
export const AUDIT_LOG_PAGE_MAX_LIMIT = 200

export interface NormalizedAuditLogQuery {
  startMs?: number
  endMs?: number
  success?: boolean
  providerId?: string
  /** `null` selects rows without a caller. */
  caller?: string | null
  capabilityId?: string
  model?: string
  offset: number
  limit: number
}

function invalidQuery(field: string): Error {
  return Object.assign(new Error(`INTELLIGENCE_AUDIT_QUERY_INVALID:${field}`), {
    code: 'INTELLIGENCE_AUDIT_QUERY_INVALID'
  })
}

function optionalTime(record: Record<string, unknown>, field: string): number | undefined {
  const value = record[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidQuery(field)
  return value
}

/** Absent or `''` means no filter. */
function optionalText(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw invalidQuery(field)
  return value
}

function pageNumber(
  record: Record<string, unknown>,
  field: string,
  fallback: number,
  min: number,
  max: number
): number {
  const value = record[field]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || Number.isNaN(value)) throw invalidQuery(field)
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function normalizeAuditLogQuery(query: unknown): NormalizedAuditLogQuery {
  if (query === undefined || query === null) {
    return { offset: 0, limit: AUDIT_LOG_PAGE_DEFAULT_LIMIT }
  }
  if (typeof query !== 'object' || Array.isArray(query)) throw invalidQuery('query')
  const record = query as Record<string, unknown>

  const success = record.success
  if (success !== undefined && success !== null && typeof success !== 'boolean') {
    throw invalidQuery('success')
  }
  const caller = record.caller
  if (caller !== undefined && caller !== null && typeof caller !== 'string') {
    throw invalidQuery('caller')
  }

  const normalized: NormalizedAuditLogQuery = {
    startMs: optionalTime(record, 'startMs'),
    endMs: optionalTime(record, 'endMs'),
    providerId: optionalText(record, 'providerId'),
    capabilityId: optionalText(record, 'capabilityId'),
    model: optionalText(record, 'model'),
    offset: pageNumber(record, 'offset', 0, 0, Number.MAX_SAFE_INTEGER),
    limit: pageNumber(record, 'limit', AUDIT_LOG_PAGE_DEFAULT_LIMIT, 1, AUDIT_LOG_PAGE_MAX_LIMIT)
  }
  if (typeof success === 'boolean') normalized.success = success
  // `null` and '' both mean "no caller": the logger never stores an empty caller.
  if (caller === null || caller === '') normalized.caller = null
  else if (typeof caller === 'string') normalized.caller = caller
  return normalized
}

function conditionsFor(query: NormalizedAuditLogQuery): SQL | undefined {
  const logs = intelligenceAuditLogs
  const conditions: SQL[] = []
  if (query.startMs !== undefined) conditions.push(gte(logs.timestamp, query.startMs))
  if (query.endMs !== undefined) conditions.push(lt(logs.timestamp, query.endMs))
  if (query.success !== undefined) conditions.push(eq(logs.success, query.success))
  if (query.providerId !== undefined) conditions.push(eq(logs.provider, query.providerId))
  if (query.caller === null) conditions.push(isNull(logs.caller))
  else if (query.caller !== undefined) conditions.push(eq(logs.caller, query.caller))
  if (query.capabilityId !== undefined) conditions.push(eq(logs.capabilityId, query.capabilityId))
  if (query.model !== undefined) conditions.push(eq(logs.model, query.model))
  return conditions.length > 0 ? and(...conditions) : undefined
}

function safeMetadata(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  try {
    return sanitizeIntelligenceAuditMetadata(JSON.parse(value))
  } catch {
    return undefined
  }
}

function roundUsd(value: number): number {
  return Number.isFinite(value) && value > 0 ? Number(value.toFixed(6)) : 0
}

export interface AuditLogQueryDependencies {
  db?: LibSQLDatabase<typeof schema>
}

export async function queryAuditLogPage(
  query: unknown,
  deps: AuditLogQueryDependencies = {}
): Promise<AuditLogPage> {
  const normalized = normalizeAuditLogQuery(query)
  const db = deps.db ?? databaseModule.getDb()
  const where = conditionsFor(normalized)

  await loadPricingCatalog()
  const [rows, counted, sinceMs] = await Promise.all([
    db
      .select()
      .from(intelligenceAuditLogs)
      .where(where)
      .orderBy(desc(intelligenceAuditLogs.timestamp), desc(intelligenceAuditLogs.id))
      .limit(normalized.limit)
      .offset(normalized.offset),
    db
      .select({ total: sql<number>`count(*)` })
      .from(intelligenceAuditLogs)
      .where(where),
    readPricingSinceMs()
  ])
  const since = sinceMs ?? Number.MAX_SAFE_INTEGER

  return {
    rows: rows.map(
      (row): IntelligenceAuditLogEntry => ({
        traceId: row.traceId,
        timestamp: row.timestamp,
        capabilityId: row.capabilityId,
        provider: row.provider,
        model: row.model,
        promptHash: row.promptHash ?? undefined,
        caller: row.caller ?? undefined,
        userId: row.userId ?? undefined,
        usage: {
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalTokens: row.totalTokens
        },
        latency: row.latency,
        success: row.success,
        error: row.error ?? undefined,
        estimatedCost:
          row.timestamp >= since
            ? roundUsd(row.estimatedCost ?? 0)
            : estimateCostUsd({
                providerId: row.provider,
                model: row.model,
                usage: { promptTokens: row.promptTokens, completionTokens: row.completionTokens }
              }),
        metadata: safeMetadata(row.metadata)
      })
    ),
    total: Number(counted[0]?.total ?? 0)
  }
}
