import type { StorageCache } from './storage-cache'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import chalk from 'chalk'

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
    console.info(
      chalk.blue(`[StoragePolling] Started with ${this.pollingInterval / 1000}s interval`)
    )

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
      console.error(
        chalk.red(`[StoragePolling] ${failCount}/${dirtyConfigs.length} config(s) failed to save`)
      )

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(chalk.red(`  - ${dirtyConfigs[index]}:`), result.reason)
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
      console.warn(
        chalk.yellow(
          `[StoragePolling] Slow save ${totalMs}ms (${dirtyConfigs.length} configs): ${details}`
        )
      )
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
      console.info(
        chalk.green(`[StoragePolling] Saved ${successCount}/${dirtyConfigs.length} config(s)`)
      )
    }

    if (failCount > 0) {
      console.error(chalk.red(`[StoragePolling] ${failCount} config(s) failed`))
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
