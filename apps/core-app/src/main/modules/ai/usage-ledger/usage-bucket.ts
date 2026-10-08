/**
 * Additive upsert into `intelligence_usage_stats` (one `(caller_id, caller_type, period)` row).
 *
 * Shared by the audit flush (per-caller UTC buckets and the global local bucket) and by the
 * one-shot global backfill, so every writer merges counts and the request-weighted average latency
 * the same way. Must run inside the caller's write transaction.
 *
 * Leaf module: imported statically by the audit logger.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import { sql } from 'drizzle-orm'
import { intelligenceUsageStats } from '../../../db/schema'

export interface UsageBucketKey {
  callerId: string
  callerType: 'plugin' | 'user' | 'system'
  /** `day:…` or `month:…`. */
  period: string
  periodType: 'day' | 'month'
}

export interface UsageBucketIncrement {
  requestCount: number
  successCount: number
  failureCount: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: number
  /** Mean latency of the requests in this increment. */
  avgLatency: number
}

export type UsageBucketWriter = Pick<LibSQLDatabase<typeof schema>, 'insert'>

export async function addToUsageBucket(
  db: UsageBucketWriter,
  key: UsageBucketKey,
  stat: UsageBucketIncrement,
  updatedAt: Date
): Promise<void> {
  const totalRequestCount = sql`${intelligenceUsageStats.requestCount} + ${stat.requestCount}`
  const totalLatency = sql`${intelligenceUsageStats.avgLatency} * ${intelligenceUsageStats.requestCount} + ${stat.avgLatency} * ${stat.requestCount}`
  const avgLatency = sql`CASE WHEN ${totalRequestCount} > 0 THEN (${totalLatency}) / ${totalRequestCount} ELSE ${stat.avgLatency} END`

  await db
    .insert(intelligenceUsageStats)
    .values({
      callerId: key.callerId,
      callerType: key.callerType,
      period: key.period,
      periodType: key.periodType,
      requestCount: stat.requestCount,
      successCount: stat.successCount,
      failureCount: stat.failureCount,
      totalTokens: stat.totalTokens,
      promptTokens: stat.promptTokens,
      completionTokens: stat.completionTokens,
      totalCost: stat.totalCost,
      avgLatency: stat.avgLatency,
      updatedAt
    })
    .onConflictDoUpdate({
      target: [
        intelligenceUsageStats.callerId,
        intelligenceUsageStats.callerType,
        intelligenceUsageStats.period
      ],
      set: {
        requestCount: totalRequestCount,
        successCount: sql`${intelligenceUsageStats.successCount} + ${stat.successCount}`,
        failureCount: sql`${intelligenceUsageStats.failureCount} + ${stat.failureCount}`,
        totalTokens: sql`${intelligenceUsageStats.totalTokens} + ${stat.totalTokens}`,
        promptTokens: sql`${intelligenceUsageStats.promptTokens} + ${stat.promptTokens}`,
        completionTokens: sql`${intelligenceUsageStats.completionTokens} + ${stat.completionTokens}`,
        totalCost: sql`${intelligenceUsageStats.totalCost} + ${stat.totalCost}`,
        avgLatency,
        updatedAt
      }
    })
}
