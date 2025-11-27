import type { StorageCache } from './storage-cache'
import chalk from 'chalk'

/**
 * StoragePollingService - Periodic persistence service
 *
 * Periodically saves dirty configs to disk
 */
export class StoragePollingService {
  private cache: StorageCache
  private saveFn: (name: string) => Promise<void>
  private pollingTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private pollingInterval: number

  constructor(
    cache: StorageCache,
    saveFn: (name: string) => Promise<void>,
    pollingInterval: number = 5000,
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
      chalk.blue(`[StoragePolling] Started with ${this.pollingInterval / 1000}s interval`),
    )

    this.pollingTimer = setInterval(async () => {
      await this.performSave()
    }, this.pollingInterval)
  }

  /**
   * Stop polling and perform final save
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }

    await this.forceSave()
  }

  private async performSave(): Promise<void> {
    const dirtyConfigs = this.cache.getDirtyConfigs()

    if (dirtyConfigs.length === 0) {
      return
    }

    // Use Promise.all for concurrent saves instead of sequential
    const results = await Promise.allSettled(
      dirtyConfigs.map(async (name) => {
        await this.saveFn(name)
        this.cache.clearDirty(name)
        return name
      }),
    )

    const failCount = results.filter(r => r.status === 'rejected').length

    if (failCount > 0) {
      console.error(
        chalk.red(`[StoragePolling] ${failCount}/${dirtyConfigs.length} config(s) failed to save`),
      )

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(
            chalk.red(`  - ${dirtyConfigs[index]}:`),
            result.reason,
          )
        }
      })
    }
  }

  private async saveConfig(name: string): Promise<void> {
    try {
      await this.saveFn(name)
      this.cache.clearDirty(name)
    }
    catch (error) {
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

    const results = await Promise.allSettled(
      dirtyConfigs.map(name => this.saveConfig(name)),
    )

    const successCount = results.filter(r => r.status === 'fulfilled').length
    const failCount = results.filter(r => r.status === 'rejected').length

    if (successCount > 0 || failCount > 0) {
      console.info(
        chalk.green(`[StoragePolling] Saved ${successCount}/${dirtyConfigs.length} config(s)`),
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
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer)
      }

      this.pollingTimer = setInterval(async () => {
        await this.performSave()
      }, this.pollingInterval)
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
      dirtyCount: this.cache.getDirtyConfigs().length,
    }
  }
}
