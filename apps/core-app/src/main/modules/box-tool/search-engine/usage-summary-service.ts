import type { DbUtils } from '../../../db/utils'
import type { Primitive } from '../../../utils/logger'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { lt } from 'drizzle-orm'
import * as schema from '../../../db/schema'
import { createLogger } from '../../../utils/logger'
import { enterPerfContext } from '../../../utils/perf-context'
import { TimeStatsAggregator } from './time-stats-aggregator'

const log = createLogger('UsageSummaryService')

export interface SummaryConfig {
  retentionDays: number
  autoCleanup: boolean
  summaryInterval: number
}

export interface SummaryStats {
  cleanedLogs: number
  duration: number
}

const DEFAULT_CONFIG: SummaryConfig = {
  retentionDays: 30,
  autoCleanup: true,
  summaryInterval: 24 * 60 * 60 * 1000
}

/** Periodically rebuild time-based usage stats and remove expired raw logs. */
export class UsageSummaryService {
  private config: SummaryConfig
  private readonly pollingService = PollingService.getInstance()
  private readonly summaryTaskId = 'usage-summary.run'
  private timeStatsAggregator: TimeStatsAggregator
  private isRunning = false
  private stats = {
    totalRuns: 0,
    totalCleaned: 0,
    avgDuration: 0
  }

  constructor(
    private dbUtils: DbUtils,
    config?: Partial<SummaryConfig>
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
      meta: { interval: `${this.config.summaryInterval / 1000 / 60 / 60}h` }
    })

    // Don't run summary immediately during startup — delay to avoid competing
    // with AppScanner, recommendation engine, and other startup tasks.
    if (this.pollingService.isRegistered(this.summaryTaskId)) {
      this.pollingService.unregister(this.summaryTaskId)
    }
    this.pollingService.register(
      this.summaryTaskId,
      async () => {
        try {
          await this.runSummary()
        } catch (error) {
          log.error('Scheduled summary failed', { error })
        }
      },
      { interval: this.config.summaryInterval, unit: 'milliseconds', initialDelayMs: 30_000 }
    )
    this.pollingService.start()
  }

  stop(): void {
    this.pollingService.unregister(this.summaryTaskId)
    this.isRunning = false
    log.info('Usage summary service stopped', { meta: this.stats })
  }

  async runSummary(): Promise<SummaryStats> {
    const start = performance.now()
    const dispose = enterPerfContext('UsageSummary.run')

    try {
      // `item_usage_stats` is owned by UsageStatsQueue. Periodic maintenance
      // only rebuilds time distributions and removes expired raw logs.
      await this.timeStatsAggregator.aggregateTimeStats()

      let cleanedCount = 0
      if (this.config.autoCleanup) {
        cleanedCount = await this.cleanupExpiredLogs()
      }

      const duration = performance.now() - start

      this.stats.totalRuns++
      this.stats.totalCleaned += cleanedCount
      this.stats.avgDuration =
        (this.stats.avgDuration * (this.stats.totalRuns - 1) + duration) / this.stats.totalRuns

      log.info('Usage maintenance completed', {
        meta: { cleaned: cleanedCount }
      })

      return { cleanedLogs: cleanedCount, duration }
    } catch (error) {
      log.error('Usage maintenance failed', { error })
      throw error
    } finally {
      dispose()
    }
  }

  /** Remove usage logs older than retention period */
  private async cleanupExpiredLogs(): Promise<number> {
    const timer = log.time('cleanupExpiredLogs')
    const db = this.dbUtils.getDb()

    try {
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() - this.config.retentionDays)

      await db.delete(schema.usageLogs).where(lt(schema.usageLogs.timestamp, expirationDate))

      timer.end('debug')
      return 0
    } catch (error) {
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
      summaryInterval: this.config.summaryInterval
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
