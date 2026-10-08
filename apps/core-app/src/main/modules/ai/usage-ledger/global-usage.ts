/**
 * Reads of the global usage bucket, merged with usage not yet flushed (parent design §1.2, R-A9).
 *
 * Totals and limit checks call `readGlobalUsage()`; it never waits for a flush. The database read
 * and the pending snapshot are taken against the same `GlobalUsageDeltas.version`: when a flush
 * commits in between, the read is repeated, so one call is counted exactly once.
 *
 * Leaf module: imported statically by the audit logger.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type { GlobalUsageDeltas, UsageDelta } from './global-deltas'
import { and, eq, inArray } from 'drizzle-orm'
import { intelligenceUsageStats } from '../../../db/schema'
import { GLOBAL_USAGE_CALLER_ID, GLOBAL_USAGE_CALLER_TYPE } from './constants'
import { addUsageDelta, emptyUsageDelta } from './global-deltas'

type GlobalUsageReader = Pick<LibSQLDatabase<typeof schema>, 'select'>

/** A read that raced more commits than this returns its last attempt (still at most one batch off). */
const MAX_CONSISTENT_READ_ATTEMPTS = 4

/** Stored global bucket rows for the requested periods (`day:…` / `month:…`). */
export async function readGlobalBucketRows(
  db: GlobalUsageReader,
  periods: readonly string[]
): Promise<Map<string, UsageDelta>> {
  const result = new Map<string, UsageDelta>()
  if (periods.length === 0) return result
  const rows = await db
    .select({
      period: intelligenceUsageStats.period,
      requestCount: intelligenceUsageStats.requestCount,
      successCount: intelligenceUsageStats.successCount,
      failureCount: intelligenceUsageStats.failureCount,
      promptTokens: intelligenceUsageStats.promptTokens,
      completionTokens: intelligenceUsageStats.completionTokens,
      totalTokens: intelligenceUsageStats.totalTokens,
      totalCost: intelligenceUsageStats.totalCost,
      avgLatency: intelligenceUsageStats.avgLatency
    })
    .from(intelligenceUsageStats)
    .where(
      and(
        eq(intelligenceUsageStats.callerId, GLOBAL_USAGE_CALLER_ID),
        eq(intelligenceUsageStats.callerType, GLOBAL_USAGE_CALLER_TYPE),
        inArray(intelligenceUsageStats.period, [...new Set(periods)])
      )
    )
  for (const row of rows) {
    result.set(row.period, {
      requestCount: row.requestCount,
      successCount: row.successCount,
      failureCount: row.failureCount,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      totalTokens: row.totalTokens,
      totalCost: row.totalCost,
      latencySum: row.avgLatency * row.requestCount
    })
  }
  return result
}

/**
 * Global usage per requested period: stored rows plus pending entries. Every requested period is
 * present in the result, zero when unused.
 */
export async function readGlobalUsage(
  db: GlobalUsageReader,
  deltas: GlobalUsageDeltas,
  periods: readonly string[]
): Promise<Map<string, UsageDelta>> {
  let stored = new Map<string, UsageDelta>()
  let pending = deltas.snapshot(periods)
  for (let attempt = 0; attempt < MAX_CONSISTENT_READ_ATTEMPTS; attempt += 1) {
    const version = deltas.version
    stored = await readGlobalBucketRows(db, periods)
    pending = deltas.snapshot(periods)
    if (deltas.version === version) break
  }
  const merged = new Map<string, UsageDelta>()
  for (const period of periods) {
    const total = emptyUsageDelta()
    const storedRow = stored.get(period)
    const pendingRow = pending.get(period)
    if (storedRow) addUsageDelta(total, storedRow)
    if (pendingRow) addUsageDelta(total, pendingRow)
    merged.set(period, total)
  }
  return merged
}
