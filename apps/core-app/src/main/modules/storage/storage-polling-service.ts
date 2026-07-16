import type { StorageCache } from './storage-cache'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../utils/logger'

const storagePollingLog = createLogger('Storage').child('Polling')
const PERSIST_RETRY_MAX_ATTEMPTS = 8
const PERSIST_RETRY_MAX_DELAY_MS = 5 * 60_000
const PERSIST_FAILURE_LOG_INTERVAL_MS = 60_000

interface PersistFailureState {
  attempts: number
  nextRetryAt: number
  lastLoggedAt: number
  quarantined: boolean
}

/**
 * StoragePollingService - Periodic persistence service
 *
 * Periodically saves dirty configs to disk
 */
export class StoragePollingService {
  private static readonly pollingService = PollingService.getInstance()
  private cache: StorageCache
  private saveFn: (name: string) => Promise<void>
  private isRunning = false
  private pollingInterval: number
  private readonly pollingTaskId = 'storage.polling'
  private pendingWidgetCalls = new Map<string, string>()
  private persistFailures = new Map<string, PersistFailureState>()

  constructor(
    cache: StorageCache,
    saveFn: (name: string) => Promise<void>,
    pollingInterval: number = 5000
  ) {
    this.cache = cache
    this.saveFn = saveFn
    this.pollingInterval = pollingInterval
  }

  notifyConfigChanged(name: string): void {
    this.persistFailures.delete(name)
  }

  /**
   * Start polling service
   */
  start(): void {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    storagePollingLog.info('Started polling service', {
      meta: { intervalSeconds: this.pollingInterval / 1000 }
    })

    StoragePollingService.pollingService.register(this.pollingTaskId, () => this.performSave(), {
      interval: this.pollingInterval,
      unit: 'milliseconds',
      lane: 'io',
      backpressure: 'coalesce',
      dedupeKey: this.pollingTaskId,
      maxInFlight: 1,
      timeoutMs: 15_000,
      jitterMs: 150
    })
    StoragePollingService.pollingService.start()
  }

  /**
   * Stop polling and perform final save
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    StoragePollingService.pollingService.unregister(this.pollingTaskId)

    await this.forceSave()
  }

  private async performSave(): Promise<void> {
    const now = Date.now()
    const dirtyConfigs = this.cache.getDirtyConfigs().filter((name) => {
      const failure = this.persistFailures.get(name)
      return !failure?.quarantined && (!failure || failure.nextRetryAt <= now)
    })

    if (dirtyConfigs.length === 0) {
      return
    }

    const t0 = performance.now()
    const results = await Promise.allSettled(
      dirtyConfigs.map(async (name) => {
        const saveStart = performance.now()
        await this.saveFn(name)
        return { name, durationMs: Math.round(performance.now() - saveStart) }
      })
    )

    results.forEach((result, index) => {
      const name = dirtyConfigs[index]!
      if (result.status === 'fulfilled') {
        this.cache.clearDirty(name)
        this.persistFailures.delete(name)
        return
      }

      const previous = this.persistFailures.get(name)
      const attempts = (previous?.attempts ?? 0) + 1
      const quarantined = attempts >= PERSIST_RETRY_MAX_ATTEMPTS
      const retryDelayMs = Math.min(
        PERSIST_RETRY_MAX_DELAY_MS,
        Math.max(1_000, this.pollingInterval) * 2 ** Math.min(attempts - 1, 10)
      )
      const shouldLog =
        attempts === 1 ||
        quarantined ||
        !previous ||
        now - previous.lastLoggedAt >= PERSIST_FAILURE_LOG_INTERVAL_MS
      const lastLoggedAt = shouldLog ? now : (previous?.lastLoggedAt ?? 0)

      this.persistFailures.set(name, {
        attempts,
        nextRetryAt: quarantined ? Number.POSITIVE_INFINITY : now + retryDelayMs,
        lastLoggedAt,
        quarantined
      })

      if (shouldLog) {
        storagePollingLog.error(
          quarantined ? 'Config persistence quarantined' : 'Config persistence deferred',
          {
            error: result.reason,
            meta: {
              configName: name,
              attempts,
              retryDelayMs: quarantined ? 0 : retryDelayMs,
              quarantined
            }
          }
        )
      }
    })

    const totalMs = Math.round(performance.now() - t0)
    if (totalMs > 500) {
      const details = results
        .filter(
          (result): result is PromiseFulfilledResult<{ name: string; durationMs: number }> =>
            result.status === 'fulfilled'
        )
        .map((result) => `${result.value.name}=${result.value.durationMs}ms`)
        .join(' ')
      storagePollingLog.warn('Slow dirty config save', {
        meta: { durationMs: totalMs, configCount: dirtyConfigs.length, details }
      })
    }
  }

  private async saveConfig(name: string): Promise<void> {
    await this.saveFn(name)
    this.cache.clearDirty(name)
    this.persistFailures.delete(name)
  }

  /**
   * Force save all dirty configs immediately
   */
  async forceSave(): Promise<void> {
    const dirtyConfigs = this.cache.getDirtyConfigs()

    if (dirtyConfigs.length === 0) {
      return
    }

    const results = await Promise.allSettled(dirtyConfigs.map((name) => this.saveConfig(name)))

    const successCount = results.filter((r) => r.status === 'fulfilled').length
    const failCount = results.filter((r) => r.status === 'rejected').length

    if (successCount > 0 || failCount > 0) {
      storagePollingLog.info('Force saved dirty configs', {
        meta: { successCount, failCount, totalCount: dirtyConfigs.length }
      })
    }

    if (failCount > 0) {
      storagePollingLog.error('Force save failed for dirty configs', {
        meta: { failCount, totalCount: dirtyConfigs.length }
      })
    }
  }

  /**
   * Update polling interval
   */
  setInterval(ms: number): void {
    this.pollingInterval = ms

    if (this.isRunning) {
      StoragePollingService.pollingService.unregister(this.pollingTaskId)
      StoragePollingService.pollingService.register(this.pollingTaskId, () => this.performSave(), {
        interval: this.pollingInterval,
        unit: 'milliseconds',
        lane: 'io',
        backpressure: 'coalesce',
        dedupeKey: this.pollingTaskId,
        maxInFlight: 1,
        timeoutMs: 15_000,
        jitterMs: 150
      })
      StoragePollingService.pollingService.start()
    }
  }

  /**
   * Get current status (for debugging)
   */
  getStatus(): {
    isRunning: boolean
    pollingInterval: number
    dirtyCount: number
  } {
    return {
      isRunning: this.isRunning,
      pollingInterval: this.pollingInterval,
      dirtyCount: this.cache.getDirtyConfigs().length
    }
  }

  /**
   * Schedule a widget update with deduplication
   * Short-interval calls to the same widget only execute the last one
   */
  scheduleWidgetUpdate(widgetId: string, callback: () => void): void {
    // Cancel previous pending call for this widget
    const existing = this.pendingWidgetCalls.get(widgetId)
    if (existing) {
      StoragePollingService.pollingService.unregister(existing)
    }

    const taskId = `storage.widget.${widgetId}`

    StoragePollingService.pollingService.register(
      taskId,
      () => {
        try {
          callback()
        } finally {
          StoragePollingService.pollingService.unregister(taskId)
          this.pendingWidgetCalls.delete(widgetId)
        }
      },
      {
        interval: 60_000,
        unit: 'milliseconds',
        initialDelayMs: 100,
        lane: 'maintenance',
        backpressure: 'latest_wins',
        dedupeKey: taskId,
        maxInFlight: 1,
        timeoutMs: 5_000
      }
    )
    StoragePollingService.pollingService.start()

    this.pendingWidgetCalls.set(widgetId, taskId)
  }
}
