import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import type { ScheduleOptions } from '../../../db/db-write-scheduler'
import { sql } from 'drizzle-orm'
import { DbWriteDroppedError, dbWriteScheduler } from '../../../db/db-write-scheduler'
import { scheduleDbWrite } from '../../../db/db-write'
import { itemUsageStats } from '../../../db/schema'
import { createLogger } from '../../../utils/logger'

const usageStatsQueueLog = createLogger('UsageStatsQueue')

interface SearchIncrement {
  sourceId: string
  itemId: string
  sourceType: string
  searchCount: number
  lastSearched: Date
}

export interface UsageStatsQueueOptions {
  searchFlushIntervalMs?: number
  searchFlushEventThreshold?: number
  highPressureQueueDepth?: number
  criticalPressureQueueDepth?: number
  highPressureSearchSampleRate?: number
  criticalPressureSearchSampleRate?: number
}

const DEFAULT_OPTIONS: Required<UsageStatsQueueOptions> = {
  searchFlushIntervalMs: 30 * 60 * 1000,
  searchFlushEventThreshold: 2000,
  highPressureQueueDepth: 8,
  criticalPressureQueueDepth: 16,
  highPressureSearchSampleRate: 0.3,
  criticalPressureSearchSampleRate: 0.1
}

/**
 * Batch write queue for DISPLAY counts only.
 *
 * Effective execution no longer passes through here: `DbUtils.recordExecuteTransaction` commits the
 * log, the counters, the summary, the trend and the time buckets in one interactive transaction
 * deduped on the action's `eventId` (R2/R7). This queue remains for the `search_count` half — the
 * display number no product rule reads back synchronously — where batching is an acceptable
 * trade-off and repeated renders may be sampled under write pressure.
 *
 * Deliberately search-only: an `execute` path here would be a second, non-deduped execution
 * writer, which is exactly the class of duplicate counting R2 forbids.
 *
 * Uses the shared write queue (scheduleDbWrite) to avoid SQLITE_BUSY
 * contention with the search-index worker thread; the scheduler itself owns
 * busy retry via delayed re-enqueue.
 */
export class UsageStatsQueue {
  private searchQueue = new Map<string, SearchIncrement>()
  private searchFlushTimer: NodeJS.Timeout | null = null
  private pendingSearchEvents = 0
  private searchFlushing = false

  /**
   * Bumped by clear(). A flush captures it before awaiting and refuses to merge its snapshot back
   * if it has changed since.
   *
   * The snapshot is taken out of the queue before the write, so a failing flush restores it. If a
   * privacy or retention reset called clear() in that window, the restore put back exactly the
   * rows the user asked to erase — and then scheduled a flush that persisted them (#657).
   */
  private clearGeneration = 0
  private readonly db: LibSQLDatabase<typeof schema>
  private readonly options: Required<UsageStatsQueueOptions>

  constructor(
    db: LibSQLDatabase<typeof schema>,
    options: UsageStatsQueueOptions | number = DEFAULT_OPTIONS
  ) {
    this.db = db
    if (typeof options === 'number') {
      this.options = { ...DEFAULT_OPTIONS, searchFlushIntervalMs: options }
      return
    }
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  private getAggregateKey(sourceId: string, itemId: string): string {
    return `${sourceId}:${itemId}`
  }

  private resolveSearchSampleRate(): number {
    const queued = dbWriteScheduler.getStats().queued
    if (queued >= this.options.criticalPressureQueueDepth) {
      return this.options.criticalPressureSearchSampleRate
    }
    if (queued >= this.options.highPressureQueueDepth) {
      return this.options.highPressureSearchSampleRate
    }
    return 1
  }

  private shouldAcceptSearchEvent(): boolean {
    const sampleRate = this.resolveSearchSampleRate()
    if (sampleRate >= 1) return true
    return Math.random() <= sampleRate
  }

  private upsertAggregate(sourceId: string, itemId: string, sourceType: string): void {
    const key = this.getAggregateKey(sourceId, itemId)
    const existing = this.searchQueue.get(key)
    const timestamp = new Date()
    if (existing) {
      existing.searchCount += 1
      if (timestamp > existing.lastSearched) existing.lastSearched = timestamp
    } else {
      this.searchQueue.set(key, {
        sourceId,
        itemId,
        sourceType,
        searchCount: 1,
        lastSearched: timestamp
      })
    }
    this.pendingSearchEvents += 1
  }

  /** Record one display event. Executions do NOT go through this queue (see the class comment). */
  enqueueSearch(sourceId: string, itemId: string, sourceType: string): void {
    if (!this.shouldAcceptSearchEvent()) {
      return
    }

    this.upsertAggregate(sourceId, itemId, sourceType)

    if (this.pendingSearchEvents >= this.options.searchFlushEventThreshold) {
      this.triggerSearchFlushNow()
    } else {
      this.scheduleSearchFlush()
    }
  }

  private scheduleSearchFlush(): void {
    if (this.searchFlushTimer || this.searchFlushing || this.searchQueue.size === 0) {
      return
    }

    this.searchFlushTimer = setTimeout(() => {
      this.searchFlushTimer = null
      this.flushSearchQueue().catch((error) => {
        usageStatsQueueLog.error('Search flush failed', { error })
      })
    }, this.options.searchFlushIntervalMs)
  }

  private triggerSearchFlushNow(): void {
    if (this.searchFlushTimer) {
      clearTimeout(this.searchFlushTimer)
      this.searchFlushTimer = null
    }
    void this.flushSearchQueue()
  }

  private cloneAggregate(record: SearchIncrement): SearchIncrement {
    return { ...record, lastSearched: new Date(record.lastSearched) }
  }

  private mergeBack(records: SearchIncrement[]): void {
    for (const record of records) {
      const key = this.getAggregateKey(record.sourceId, record.itemId)
      const existing = this.searchQueue.get(key)
      if (!existing) {
        this.searchQueue.set(key, this.cloneAggregate(record))
        continue
      }
      existing.searchCount += record.searchCount
      if (record.lastSearched > existing.lastSearched) {
        existing.lastSearched = record.lastSearched
      }
    }
  }

  private static toUnixTs(date: Date | null): number | null {
    return date ? Math.floor(date.getTime() / 1000) : null
  }

  private async persistAggregates(
    label: string,
    records: SearchIncrement[],
    options: ScheduleOptions
  ): Promise<void> {
    if (records.length === 0) return

    await scheduleDbWrite(
      label,
      () =>
        this.db.transaction(async (tx) => {
          const now = new Date()
          for (const record of records) {
            const lastSearchedTs = UsageStatsQueue.toUnixTs(record.lastSearched)
            await tx
              .insert(itemUsageStats)
              .values({
                sourceId: record.sourceId,
                itemId: record.itemId,
                sourceType: record.sourceType,
                // Display only: execution counters are never touched from this path.
                searchCount: record.searchCount,
                executeCount: 0,
                cancelCount: 0,
                lastSearched: record.lastSearched,
                lastExecuted: null,
                lastCancelled: null,
                createdAt: now,
                updatedAt: now
              })
              .onConflictDoUpdate({
                target: [itemUsageStats.sourceId, itemUsageStats.itemId],
                set: {
                  searchCount: sql`${itemUsageStats.searchCount} + ${record.searchCount}`,
                  lastSearched:
                    lastSearchedTs == null
                      ? sql`${itemUsageStats.lastSearched}`
                      : sql<number>`MAX(COALESCE(${itemUsageStats.lastSearched}, 0), ${lastSearchedTs})`,
                  updatedAt: now
                }
              })
          }
        }),
      options
    )
  }

  async flushSearchQueue(): Promise<void> {
    if (this.searchFlushing || this.searchQueue.size === 0) {
      return
    }

    this.searchFlushing = true
    const generation = this.clearGeneration
    const records = Array.from(this.searchQueue.values()).map((record) =>
      this.cloneAggregate(record)
    )
    const eventCount = this.pendingSearchEvents
    this.searchQueue.clear()
    this.pendingSearchEvents = 0

    try {
      await this.persistAggregates('usage-stats.search.flush', records, {
        dropPolicy: 'drop',
        maxQueueWaitMs: 10_000
      })
      usageStatsQueueLog.debug('Search flush persisted', {
        meta: { eventCount, uniqueItems: records.length }
      })
    } catch (error) {
      const isDropped = error instanceof DbWriteDroppedError
      if (isDropped) {
        usageStatsQueueLog.debug('Search flush dropped under queue pressure', {
          meta: {
            eventCount,
            uniqueItems: records.length,
            queuedWrites: dbWriteScheduler.getStats().queued
          }
        })
      } else if (generation !== this.clearGeneration) {
        usageStatsQueueLog.debug('Search flush failed after a clear; snapshot discarded', {
          meta: { eventCount, uniqueItems: records.length }
        })
      } else {
        this.mergeBack(records)
        this.pendingSearchEvents += records.reduce((total, record) => total + record.searchCount, 0)
        usageStatsQueueLog.error('Failed to flush search queue', {
          error,
          meta: { eventCount, uniqueItems: records.length }
        })
      }
    } finally {
      this.searchFlushing = false
      if (this.searchQueue.size > 0) {
        this.scheduleSearchFlush()
      }
    }
  }

  async forceFlush(): Promise<void> {
    if (this.searchFlushTimer) {
      clearTimeout(this.searchFlushTimer)
      this.searchFlushTimer = null
    }
    await this.flushSearchQueue()
  }

  getQueueSize(): number {
    return this.searchQueue.size
  }

  clear(): void {
    if (this.searchFlushTimer) {
      clearTimeout(this.searchFlushTimer)
      this.searchFlushTimer = null
    }
    this.searchQueue.clear()
    this.pendingSearchEvents = 0
    this.clearGeneration += 1
  }
}
