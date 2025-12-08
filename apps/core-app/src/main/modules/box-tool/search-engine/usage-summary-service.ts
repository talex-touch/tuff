import type { DbUtils } from '../../../db/utils'
import type { Primitive } from '../../../utils/logger'
import { lt, sql } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { createLogger } from '../../../utils/logger'
import { TimeStatsAggregator } from './time-stats-aggregator'
import { sleep } from '@talex-touch/utils'

const log = createLogger('UsageSummaryService')

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 100

function isSqliteBusyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code, rawCode, message } = error as {
    code?: string
    rawCode?: number
    message?: string
  }
  if (code === 'SQLITE_BUSY' || rawCode === 5) return true
  return typeof message === 'string' && message.includes('SQLITE_BUSY')
}

async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation()
    }
    catch (error) {
      lastError = error
      if (isSqliteBusyError(error) && attempt < retries) {
        log.warn(`SQLITE_BUSY, retrying attempt ${attempt + 1}/${retries}`)
        await sleep(RETRY_DELAY_MS * (attempt + 1))
        continue
      }
      throw error
    }
  }
  throw lastError
}

export interface SummaryConfig {
  retentionDays: number
  autoCleanup: boolean
  summaryInterval: number
}

export interface SummaryStats {
  summarizedLogs: number
  cleanedLogs: number
  duration: number
}

const DEFAULT_CONFIG: SummaryConfig = {
  retentionDays: 30,
  autoCleanup: true,
  summaryInterval: 24 * 60 * 60 * 1000,
}

/** Service for periodically aggregating usage logs and cleaning up old data */
export class UsageSummaryService {
  private config: SummaryConfig
  private summaryTimer: NodeJS.Timeout | null = null
  private timeStatsAggregator: TimeStatsAggregator
  private isRunning = false
  private stats = {
    totalRuns: 0,
    totalSummarized: 0,
    totalCleaned: 0,
    avgDuration: 0,
  }

  constructor(
    private dbUtils: DbUtils,
    config?: Partial<SummaryConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.timeStatsAggregator = new TimeStatsAggregator(dbUtils)
  }

  start(): void {
    if (this.isRunning) {
      log.warn('Service is already running')
      return
    }

    this.isRunning = true
    log.info('Starting usage summary service', {
      meta: { interval: `${this.config.summaryInterval / 1000 / 60 / 60}h` },
    })

    this.runSummary().catch((error) => {
      log.error('Initial summary failed', { error })
    })

    this.summaryTimer = setInterval(() => {
      this.runSummary().catch((error) => {
        log.error('Scheduled summary failed', { error })
      })
    }, this.config.summaryInterval)
  }

  stop(): void {
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer)
      this.summaryTimer = null
    }
    this.isRunning = false
    log.info('Usage summary service stopped', { meta: this.stats })
  }

  async runSummary(): Promise<SummaryStats> {
    const start = performance.now()

    try {
      const summarizedCount = await this.summarizeUsageLogs()

      // 聚合时间统计
      await this.timeStatsAggregator.aggregateTimeStats()

      let cleanedCount = 0
      if (this.config.autoCleanup) {
        cleanedCount = await this.cleanupExpiredLogs()
      }

      const duration = performance.now() - start

      this.stats.totalRuns++
      this.stats.totalSummarized += summarizedCount
      this.stats.totalCleaned += cleanedCount
      this.stats.avgDuration
        = (this.stats.avgDuration * (this.stats.totalRuns - 1) + duration) / this.stats.totalRuns

      log.info('Summary completed', {
        meta: { summarized: summarizedCount, cleaned: cleanedCount },
      })

      return { summarizedLogs: summarizedCount, cleanedLogs: cleanedCount, duration }
    }
    catch (error) {
      log.error('Summary process failed', { error })
      throw error
    }
  }

  /** Aggregate usage logs into item_usage_stats table */
  private async summarizeUsageLogs(): Promise<number> {
    const timer = log.time('summarizeUsageLogs')
    const db = this.dbUtils.getDb()

    try {
      const logs = await db
        .select({
          itemId: schema.usageLogs.itemId,
          source: schema.usageLogs.source,
          action: schema.usageLogs.action,
          timestamp: schema.usageLogs.timestamp,
        })
        .from(schema.usageLogs)
        .where(sql`${schema.usageLogs.itemId} != 'search_session'`)

      if (logs.length === 0) {
        timer.end('debug')
        return 0
      }

      const aggregated = new Map<
        string,
        {
          sourceType: string
          sourceId: string
          itemId: string
          searchCount: number
          executeCount: number
          lastSearched: Date | null
          lastExecuted: Date | null
        }
      >()

      for (const log of logs) {
        const sourceType = log.source
        const sourceId = log.source
        const key = `${sourceId}:${log.itemId}`

        if (!aggregated.has(key)) {
          aggregated.set(key, {
            sourceType,
            sourceId,
            itemId: log.itemId,
            searchCount: 0,
            executeCount: 0,
            lastSearched: null,
            lastExecuted: null,
          })
        }

        const stat = aggregated.get(key)!
        if (log.action === 'search') {
          stat.searchCount++
          if (!stat.lastSearched || log.timestamp > stat.lastSearched) {
            stat.lastSearched = log.timestamp
          }
        }
        else if (log.action === 'execute') {
          stat.executeCount++
          if (!stat.lastExecuted || log.timestamp > stat.lastExecuted) {
            stat.lastExecuted = log.timestamp
          }
        }
      }

      const updates = Array.from(aggregated.values())

      // Use transaction with retry for batch upsert
      await withRetry(async () => {
        await db.transaction(async (tx) => {
          for (const stat of updates) {
            const now = new Date()
            const updateFields: Record<string, unknown> = { updatedAt: now }

            if (stat.searchCount > 0) {
              updateFields.searchCount = sql`${schema.itemUsageStats.searchCount} + ${stat.searchCount}`
              updateFields.lastSearched = stat.lastSearched ?? now
            }
            if (stat.executeCount > 0) {
              updateFields.executeCount = sql`${schema.itemUsageStats.executeCount} + ${stat.executeCount}`
              updateFields.lastExecuted = stat.lastExecuted ?? now
            }

            await tx
              .insert(schema.itemUsageStats)
              .values({
                sourceId: stat.sourceId,
                itemId: stat.itemId,
                sourceType: stat.sourceType,
                searchCount: stat.searchCount,
                executeCount: stat.executeCount,
                cancelCount: 0,
                lastSearched: stat.lastSearched,
                lastExecuted: stat.lastExecuted,
                lastCancelled: null,
                createdAt: now,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [schema.itemUsageStats.sourceId, schema.itemUsageStats.itemId],
                set: updateFields,
              })
          }
        })
      })

      timer.end('debug')
      return logs.length
    }
    catch (error) {
      log.error('Failed to summarize usage logs', { error })
      throw error
    }
  }

  /** Remove usage logs older than retention period */
  private async cleanupExpiredLogs(): Promise<number> {
    const timer = log.time('cleanupExpiredLogs')
    const db = this.dbUtils.getDb()

    try {
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() - this.config.retentionDays)

      await db
        .delete(schema.usageLogs)
        .where(lt(schema.usageLogs.timestamp, expirationDate))

      timer.end('debug')
      return 0
    }
    catch (error) {
      log.error('Failed to cleanup expired logs', { error })
      throw error
    }
  }

  async triggerSummary(): Promise<SummaryStats> {
    return this.runSummary()
  }

  updateConfig(config: Partial<SummaryConfig>): void {
    this.config = { ...this.config, ...config }
    const metaConfig: Record<string, Primitive> = {
      retentionDays: this.config.retentionDays,
      autoCleanup: this.config.autoCleanup,
      summaryInterval: this.config.summaryInterval,
    }
    log.info('Configuration updated', { meta: metaConfig })

    if (this.isRunning) {
      this.stop()
      this.start()
    }
  }

  getConfig(): SummaryConfig {
    return { ...this.config }
  }

  getStats() {
    return { ...this.stats }
  }
}
