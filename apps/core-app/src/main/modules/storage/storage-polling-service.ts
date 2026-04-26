import type { StorageCache } from './storage-cache'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../utils/logger'

const storagePollingLog = createLogger('Storage').child('Polling')

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

  constructor(
    cache: StorageCache,
    saveFn: (name: string) => Promise<void>,
    pollingInterval: number = 5000
  ) {
    this.cache = cache
    this.saveFn = saveFn
    this.pollingInterval = pollingInterval
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
    const dirtyConfigs = this.cache.getDirtyConfigs()

    if (dirtyConfigs.length === 0) {
      return
    }

    const t0 = performance.now()

    // Use Promise.all for concurrent saves instead of sequential
    const results = await Promise.allSettled(
      dirtyConfigs.map(async (name) => {
        const saveStart = performance.now()
        await this.saveFn(name)
        this.cache.clearDirty(name)
        return { name, durationMs: Math.round(performance.now() - saveStart) }
      })
    )

    const totalMs = Math.round(performance.now() - t0)
    const failCount = results.filter((r) => r.status === 'rejected').length

    if (failCount > 0) {
      storagePollingLog.error('Failed to save dirty configs', {
        meta: { failCount, totalCount: dirtyConfigs.length }
      })

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          storagePollingLog.error('Dirty config save failed', {
            error: result.reason,
            meta: { configName: dirtyConfigs[index] }
          })
        }
      })
    }

    // 诊断日志：当总耗时 > 500ms 时输出各 config 的保存耗时
    if (totalMs > 500) {
      const details = results
        .filter(
          (r): r is PromiseFulfilledResult<{ name: string; durationMs: number }> =>
            r.status === 'fulfilled'
        )
        .map((r) => `${r.value.name}=${r.value.durationMs}ms`)
        .join(' ')
      storagePollingLog.warn('Slow dirty config save', {
        meta: { durationMs: totalMs, configCount: dirtyConfigs.length, details }
      })
    }
  }

  private async saveConfig(name: string): Promise<void> {
    try {
      await this.saveFn(name)
      this.cache.clearDirty(name)
    } catch (error) {
      throw error
    }
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
