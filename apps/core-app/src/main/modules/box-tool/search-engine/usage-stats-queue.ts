import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import { sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { itemUsageStats } from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'

/**
 * Increment operation to be queued
 */
interface IncrementOperation {
  sourceId: string
  itemId: string
  sourceType: string
  type: 'search' | 'execute' | 'cancel'
  timestamp: Date
}

/**
 * Batch write queue for usage stats to reduce database write operations
 * Aggregates increments within a time window (default 100ms) and writes them in batches.
 *
 * Uses DbWriteScheduler + withSqliteRetry to avoid SQLITE_BUSY contention
 * with the search-index worker thread.
 */
export class UsageStatsQueue {
  private queue = new Map<string, IncrementOperation>()
  private flushTimer: NodeJS.Timeout | null = null
  private readonly flushInterval: number // milliseconds
  private readonly db: LibSQLDatabase<typeof schema>
  private isFlushing = false

  constructor(db: LibSQLDatabase<typeof schema>, flushInterval = 100) {
    this.db = db
    this.flushInterval = flushInterval
  }

  /**
   * Generate queue key from operation
   */
  private getQueueKey(op: IncrementOperation): string {
    return `${op.sourceId}:${op.itemId}:${op.type}`
  }

  /**
   * Enqueue an increment operation
   */
  enqueue(
    sourceId: string,
    itemId: string,
    sourceType: string,
    type: 'search' | 'execute' | 'cancel'
  ): void {
    const operation: IncrementOperation = {
      sourceId,
      itemId,
      sourceType,
      type,
      timestamp: new Date()
    }

    const key = this.getQueueKey(operation)
    this.queue.set(key, operation)

    // Schedule flush if not already scheduled
    if (!this.flushTimer && !this.isFlushing) {
      this.scheduleFlush()
    }
  }

  /**
   * Schedule a flush operation
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flush().catch((error) => {
        const isDropped = error instanceof Error && error.message.includes('dropped')
        if (!isDropped) {
          console.error('[UsageStatsQueue] Flush failed:', error)
        }
      })
    }, this.flushInterval)
  }

  /**
   * Convert a Date to a Unix timestamp (seconds) for SQLite integer columns,
   * or return null if the date is null.
   */
  private static toUnixTs(date: Date | null): number | null {
    return date ? Math.floor(date.getTime() / 1000) : null
  }

  /**
   * Flush all queued operations to database.
   * Routes through DbWriteScheduler with droppable flag to avoid
   * SQLITE_BUSY contention with the search-index worker thread.
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.queue.size === 0) {
      return
    }

    this.isFlushing = true

    try {
      // Get all operations from queue
      const operations = Array.from(this.queue.values())
      this.queue.clear()

      if (operations.length === 0) {
        return
      }

      // Group operations by (sourceId, itemId) to aggregate increments
      const grouped = new Map<string, IncrementOperation[]>()

      for (const op of operations) {
        const groupKey = `${op.sourceId}:${op.itemId}`
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, [])
        }
        grouped.get(groupKey)!.push(op)
      }

      // Build batch upsert operations
      const upserts: Array<{
        sourceId: string
        itemId: string
        sourceType: string
        searchCount: number
        executeCount: number
        cancelCount: number
        lastSearched: Date | null
        lastExecuted: Date | null
        lastCancelled: Date | null
      }> = []

      for (const ops of grouped.values()) {
        const firstOp = ops[0]
        let searchCount = 0
        let executeCount = 0
        let cancelCount = 0
        let lastSearched: Date | null = null
        let lastExecuted: Date | null = null
        let lastCancelled: Date | null = null

        for (const op of ops) {
          switch (op.type) {
            case 'search':
              searchCount++
              if (!lastSearched || op.timestamp > lastSearched) {
                lastSearched = op.timestamp
              }
              break
            case 'execute':
              executeCount++
              if (!lastExecuted || op.timestamp > lastExecuted) {
                lastExecuted = op.timestamp
              }
              break
            case 'cancel':
              cancelCount++
              if (!lastCancelled || op.timestamp > lastCancelled) {
                lastCancelled = op.timestamp
              }
              break
          }
        }

        upserts.push({
          sourceId: firstOp.sourceId,
          itemId: firstOp.itemId,
          sourceType: firstOp.sourceType,
          searchCount,
          executeCount,
          cancelCount,
          lastSearched,
          lastExecuted,
          lastCancelled
        })
      }

      // Upsert using INSERT ON CONFLICT DO UPDATE — avoids the SELECT+INSERT/UPDATE
      // pattern which holds the transaction open longer and is more prone to contention.
      // Routed through DbWriteScheduler (serialized with other main-thread writes) and
      // withSqliteRetry (retries on SQLITE_BUSY from the worker thread).
      // Marked as droppable: usage stats are non-critical and can be dropped under pressure.
      await dbWriteScheduler.schedule(
        'usage-stats.flush',
        () =>
          withSqliteRetry(
            () =>
              this.db.transaction(async (tx) => {
                const now = new Date()
                for (const upsert of upserts) {
                  const lastSearchedTs = UsageStatsQueue.toUnixTs(upsert.lastSearched)
                  const lastExecutedTs = UsageStatsQueue.toUnixTs(upsert.lastExecuted)
                  const lastCancelledTs = UsageStatsQueue.toUnixTs(upsert.lastCancelled)

                  await tx
                    .insert(itemUsageStats)
                    .values({
                      sourceId: upsert.sourceId,
                      itemId: upsert.itemId,
                      sourceType: upsert.sourceType,
                      searchCount: upsert.searchCount,
                      executeCount: upsert.executeCount,
                      cancelCount: upsert.cancelCount,
                      lastSearched: upsert.lastSearched,
                      lastExecuted: upsert.lastExecuted,
                      lastCancelled: upsert.lastCancelled,
                      createdAt: now,
                      updatedAt: now
                    })
                    .onConflictDoUpdate({
                      target: [itemUsageStats.sourceId, itemUsageStats.itemId],
                      set: {
                        searchCount: sql`${itemUsageStats.searchCount} + ${upsert.searchCount}`,
                        executeCount: sql`${itemUsageStats.executeCount} + ${upsert.executeCount}`,
                        cancelCount: sql`${itemUsageStats.cancelCount} + ${upsert.cancelCount}`,
                        lastSearched: sql`MAX(${itemUsageStats.lastSearched}, ${lastSearchedTs})`,
                        lastExecuted: sql`MAX(${itemUsageStats.lastExecuted}, ${lastExecutedTs})`,
                        lastCancelled: sql`MAX(${itemUsageStats.lastCancelled}, ${lastCancelledTs})`,
                        updatedAt: now
                      }
                    })
                }
              }),
            { label: 'usage-stats.flush' }
          ),
        { droppable: true }
      )

      console.debug(
        `[UsageStatsQueue] Flushed ${operations.length} operations (${upserts.length} unique items)`
      )
    } catch (error) {
      const isDropped = error instanceof Error && error.message.includes('dropped')
      if (isDropped) {
        console.debug('[UsageStatsQueue] Flush dropped (queue pressure)')
      } else {
        console.error('[UsageStatsQueue] Failed to flush queue:', error)
      }
    } finally {
      this.isFlushing = false

      // If there are new operations queued during flush, schedule another flush
      if (this.queue.size > 0) {
        this.scheduleFlush()
      }
    }
  }

  /**
   * Force immediate flush (useful for shutdown)
   */
  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await this.flush()
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.size
  }

  /**
   * Clear queue (useful for testing or reset)
   */
  clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.queue.clear()
  }
}
