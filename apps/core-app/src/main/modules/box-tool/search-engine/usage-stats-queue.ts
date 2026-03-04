import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../db/schema'
import { sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { itemUsageStats } from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'

interface IncrementOperation {
  sourceId: string
  itemId: string
  sourceType: string
  type: 'search' | 'execute' | 'cancel'
  timestamp: Date
}

interface AggregatedUsageRecord {
  sourceId: string
  itemId: string
  sourceType: string
  searchCount: number
  executeCount: number
  cancelCount: number
  lastSearched: Date | null
  lastExecuted: Date | null
  lastCancelled: Date | null
}

export interface UsageStatsQueueOptions {
  searchFlushIntervalMs?: number
  actionFlushIntervalMs?: number
  searchFlushEventThreshold?: number
  actionFlushEventThreshold?: number
  highPressureQueueDepth?: number
  criticalPressureQueueDepth?: number
  highPressureSearchSampleRate?: number
  criticalPressureSearchSampleRate?: number
}

const DEFAULT_OPTIONS: Required<UsageStatsQueueOptions> = {
  searchFlushIntervalMs: 30 * 60 * 1000,
  actionFlushIntervalMs: 10 * 60 * 1000,
  searchFlushEventThreshold: 2000,
  actionFlushEventThreshold: 300,
  highPressureQueueDepth: 8,
  criticalPressureQueueDepth: 16,
  highPressureSearchSampleRate: 0.3,
  criticalPressureSearchSampleRate: 0.1
}

/**
 * Batch write queue for usage stats to reduce database write operations
 * Aggregates increments in memory and writes them in lower-frequency batches.
 *
 * Uses DbWriteScheduler + withSqliteRetry to avoid SQLITE_BUSY contention
 * with the search-index worker thread.
 */
export class UsageStatsQueue {
  private searchQueue = new Map<string, AggregatedUsageRecord>()
  private actionQueue = new Map<string, AggregatedUsageRecord>()
  private searchFlushTimer: NodeJS.Timeout | null = null
  private actionFlushTimer: NodeJS.Timeout | null = null
  private pendingSearchEvents = 0
  private pendingActionEvents = 0
  private searchFlushing = false
  private actionFlushing = false
  private readonly db: LibSQLDatabase<typeof schema>
  private readonly options: Required<UsageStatsQueueOptions>

  constructor(
    db: LibSQLDatabase<typeof schema>,
    options: UsageStatsQueueOptions | number = DEFAULT_OPTIONS
  ) {
    this.db = db
    if (typeof options === 'number') {
      this.options = {
        ...DEFAULT_OPTIONS,
        searchFlushIntervalMs: options,
        actionFlushIntervalMs: options
      }
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

  private upsertAggregate(operation: IncrementOperation): void {
    const isSearch = operation.type === 'search'
    const targetQueue = isSearch ? this.searchQueue : this.actionQueue
    const key = this.getAggregateKey(operation.sourceId, operation.itemId)
    const existing = targetQueue.get(key)
    const aggregate: AggregatedUsageRecord = existing ?? {
      sourceId: operation.sourceId,
      itemId: operation.itemId,
      sourceType: operation.sourceType,
      searchCount: 0,
      executeCount: 0,
      cancelCount: 0,
      lastSearched: null,
      lastExecuted: null,
      lastCancelled: null
    }

    switch (operation.type) {
      case 'search':
        aggregate.searchCount += 1
        aggregate.lastSearched =
          !aggregate.lastSearched || operation.timestamp > aggregate.lastSearched
            ? operation.timestamp
            : aggregate.lastSearched
        this.pendingSearchEvents += 1
        break
      case 'execute':
        aggregate.executeCount += 1
        aggregate.lastExecuted =
          !aggregate.lastExecuted || operation.timestamp > aggregate.lastExecuted
            ? operation.timestamp
            : aggregate.lastExecuted
        this.pendingActionEvents += 1
        break
      case 'cancel':
        aggregate.cancelCount += 1
        aggregate.lastCancelled =
          !aggregate.lastCancelled || operation.timestamp > aggregate.lastCancelled
            ? operation.timestamp
            : aggregate.lastCancelled
        this.pendingActionEvents += 1
        break
    }

    targetQueue.set(key, aggregate)
  }

  enqueue(
    sourceId: string,
    itemId: string,
    sourceType: string,
    type: 'search' | 'execute' | 'cancel'
  ): void {
    if (type === 'search' && !this.shouldAcceptSearchEvent()) {
      return
    }

    const operation: IncrementOperation = {
      sourceId,
      itemId,
      sourceType,
      type,
      timestamp: new Date()
    }

    this.upsertAggregate(operation)

    if (type === 'search') {
      if (this.pendingSearchEvents >= this.options.searchFlushEventThreshold) {
        this.triggerSearchFlushNow()
      } else {
        this.scheduleSearchFlush()
      }
      return
    }

    if (this.pendingActionEvents >= this.options.actionFlushEventThreshold) {
      this.triggerActionFlushNow()
    } else {
      this.scheduleActionFlush()
    }
  }

  private scheduleSearchFlush(): void {
    if (this.searchFlushTimer || this.searchFlushing || this.searchQueue.size === 0) {
      return
    }

    this.searchFlushTimer = setTimeout(() => {
      this.searchFlushTimer = null
      this.flushSearchQueue().catch((error) => {
        console.error('[UsageStatsQueue] Search flush failed:', error)
      })
    }, this.options.searchFlushIntervalMs)
  }

  private scheduleActionFlush(): void {
    if (this.actionFlushTimer || this.actionFlushing || this.actionQueue.size === 0) {
      return
    }

    this.actionFlushTimer = setTimeout(() => {
      this.actionFlushTimer = null
      this.flushActionQueue().catch((error) => {
        console.error('[UsageStatsQueue] Action flush failed:', error)
      })
    }, this.options.actionFlushIntervalMs)
  }

  private triggerSearchFlushNow(): void {
    if (this.searchFlushTimer) {
      clearTimeout(this.searchFlushTimer)
      this.searchFlushTimer = null
    }
    void this.flushSearchQueue()
  }

  private triggerActionFlushNow(): void {
    if (this.actionFlushTimer) {
      clearTimeout(this.actionFlushTimer)
      this.actionFlushTimer = null
    }
    void this.flushActionQueue()
  }

  private cloneAggregate(record: AggregatedUsageRecord): AggregatedUsageRecord {
    return {
      ...record,
      lastSearched: record.lastSearched ? new Date(record.lastSearched) : null,
      lastExecuted: record.lastExecuted ? new Date(record.lastExecuted) : null,
      lastCancelled: record.lastCancelled ? new Date(record.lastCancelled) : null
    }
  }

  private mergeBack(records: AggregatedUsageRecord[], toSearchQueue: boolean): void {
    const target = toSearchQueue ? this.searchQueue : this.actionQueue
    for (const record of records) {
      const key = this.getAggregateKey(record.sourceId, record.itemId)
      const existing = target.get(key)
      if (!existing) {
        target.set(key, this.cloneAggregate(record))
        continue
      }

      existing.searchCount += record.searchCount
      existing.executeCount += record.executeCount
      existing.cancelCount += record.cancelCount
      if (
        record.lastSearched &&
        (!existing.lastSearched || record.lastSearched > existing.lastSearched)
      ) {
        existing.lastSearched = record.lastSearched
      }
      if (
        record.lastExecuted &&
        (!existing.lastExecuted || record.lastExecuted > existing.lastExecuted)
      ) {
        existing.lastExecuted = record.lastExecuted
      }
      if (
        record.lastCancelled &&
        (!existing.lastCancelled || record.lastCancelled > existing.lastCancelled)
      ) {
        existing.lastCancelled = record.lastCancelled
      }
    }
  }

  private static toUnixTs(date: Date | null): number | null {
    return date ? Math.floor(date.getTime() / 1000) : null
  }

  private sumEventCount(records: AggregatedUsageRecord[]): number {
    return records.reduce(
      (total, record) => total + record.searchCount + record.executeCount + record.cancelCount,
      0
    )
  }

  private async persistAggregates(
    label: string,
    records: AggregatedUsageRecord[],
    options: { droppable: boolean }
  ): Promise<void> {
    if (records.length === 0) return

    await dbWriteScheduler.schedule(
      label,
      () =>
        withSqliteRetry(
          () =>
            this.db.transaction(async (tx) => {
              const now = new Date()
              for (const record of records) {
                const lastSearchedTs = UsageStatsQueue.toUnixTs(record.lastSearched)
                const lastExecutedTs = UsageStatsQueue.toUnixTs(record.lastExecuted)
                const lastCancelledTs = UsageStatsQueue.toUnixTs(record.lastCancelled)

                await tx
                  .insert(itemUsageStats)
                  .values({
                    sourceId: record.sourceId,
                    itemId: record.itemId,
                    sourceType: record.sourceType,
                    searchCount: record.searchCount,
                    executeCount: record.executeCount,
                    cancelCount: record.cancelCount,
                    lastSearched: record.lastSearched,
                    lastExecuted: record.lastExecuted,
                    lastCancelled: record.lastCancelled,
                    createdAt: now,
                    updatedAt: now
                  })
                  .onConflictDoUpdate({
                    target: [itemUsageStats.sourceId, itemUsageStats.itemId],
                    set: {
                      searchCount: sql`${itemUsageStats.searchCount} + ${record.searchCount}`,
                      executeCount: sql`${itemUsageStats.executeCount} + ${record.executeCount}`,
                      cancelCount: sql`${itemUsageStats.cancelCount} + ${record.cancelCount}`,
                      lastSearched:
                        lastSearchedTs == null
                          ? sql`${itemUsageStats.lastSearched}`
                          : sql<number>`MAX(COALESCE(${itemUsageStats.lastSearched}, 0), ${lastSearchedTs})`,
                      lastExecuted:
                        lastExecutedTs == null
                          ? sql`${itemUsageStats.lastExecuted}`
                          : sql<number>`MAX(COALESCE(${itemUsageStats.lastExecuted}, 0), ${lastExecutedTs})`,
                      lastCancelled:
                        lastCancelledTs == null
                          ? sql`${itemUsageStats.lastCancelled}`
                          : sql<number>`MAX(COALESCE(${itemUsageStats.lastCancelled}, 0), ${lastCancelledTs})`,
                      updatedAt: now
                    }
                  })
              }
            }),
          { label }
        ),
      { droppable: options.droppable }
    )
  }

  async flushSearchQueue(): Promise<void> {
    if (this.searchFlushing || this.searchQueue.size === 0) {
      return
    }

    this.searchFlushing = true
    const records = Array.from(this.searchQueue.values()).map((record) =>
      this.cloneAggregate(record)
    )
    const eventCount = this.pendingSearchEvents
    this.searchQueue.clear()
    this.pendingSearchEvents = 0

    try {
      await this.persistAggregates('usage-stats.search.flush', records, { droppable: true })
      console.debug(
        `[UsageStatsQueue] Search flush persisted ${eventCount} events (${records.length} unique items)`
      )
    } catch (error) {
      const isDropped = error instanceof Error && error.message.includes('dropped')
      if (isDropped) {
        console.debug('[UsageStatsQueue] Search flush dropped (queue pressure)')
      } else {
        this.mergeBack(records, true)
        this.pendingSearchEvents += this.sumEventCount(records)
        console.error('[UsageStatsQueue] Failed to flush search queue:', error)
      }
    } finally {
      this.searchFlushing = false
      if (this.searchQueue.size > 0) {
        this.scheduleSearchFlush()
      }
    }
  }

  async flushActionQueue(): Promise<void> {
    if (this.actionFlushing || this.actionQueue.size === 0) {
      return
    }

    this.actionFlushing = true
    const records = Array.from(this.actionQueue.values()).map((record) =>
      this.cloneAggregate(record)
    )
    const eventCount = this.pendingActionEvents
    this.actionQueue.clear()
    this.pendingActionEvents = 0

    try {
      await this.persistAggregates('usage-stats.action.flush', records, { droppable: false })
      console.debug(
        `[UsageStatsQueue] Action flush persisted ${eventCount} events (${records.length} unique items)`
      )
    } catch (error) {
      this.mergeBack(records, false)
      this.pendingActionEvents += this.sumEventCount(records)
      console.error('[UsageStatsQueue] Failed to flush action queue:', error)
    } finally {
      this.actionFlushing = false
      if (this.actionQueue.size > 0) {
        this.scheduleActionFlush()
      }
    }
  }

  async forceFlush(): Promise<void> {
    if (this.searchFlushTimer) {
      clearTimeout(this.searchFlushTimer)
      this.searchFlushTimer = null
    }
    if (this.actionFlushTimer) {
      clearTimeout(this.actionFlushTimer)
      this.actionFlushTimer = null
    }
    await this.flushActionQueue()
    await this.flushSearchQueue()
  }

  getQueueSize(): number {
    return this.searchQueue.size + this.actionQueue.size
  }

  clear(): void {
    if (this.searchFlushTimer) {
      clearTimeout(this.searchFlushTimer)
      this.searchFlushTimer = null
    }
    if (this.actionFlushTimer) {
      clearTimeout(this.actionFlushTimer)
      this.actionFlushTimer = null
    }
    this.searchQueue.clear()
    this.actionQueue.clear()
    this.pendingSearchEvents = 0
    this.pendingActionEvents = 0
  }
}
