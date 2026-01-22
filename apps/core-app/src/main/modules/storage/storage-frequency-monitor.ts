import chalk from 'chalk'

/**
 * StorageFrequencyMonitor - Frequency monitoring service
 *
 * Tracks storage operation frequency and warns on excessive usage
 */
export class StorageFrequencyMonitor {
  private operationLog = new Map<string, { get: number[]; save: number[] }>()
  private warningCooldown = new Map<string, { get?: number; save?: number }>()

  private readonly THRESHOLD: number
  private readonly TIME_WINDOW: number
  private readonly COOLDOWN_PERIOD: number

  constructor(
    threshold: number = 20, // Increased from 10 to 20
    timeWindow: number = 10000,
    cooldownPeriod: number = 30000
  ) {
    this.THRESHOLD = threshold
    this.TIME_WINDOW = timeWindow
    this.COOLDOWN_PERIOD = cooldownPeriod
  }

  /**
   * Track get operation
   */
  trackGet(name: string): void {
    this.track(name, 'get')
    this.checkFrequency(name, 'get')
  }

  /**
   * Track save operation
   */
  trackSave(name: string): void {
    this.track(name, 'save')
    this.checkFrequency(name, 'save')
  }

  private track(name: string, operation: 'get' | 'save'): void {
    const now = Date.now()

    if (!this.operationLog.has(name)) {
      this.operationLog.set(name, { get: [], save: [] })
    }

    const log = this.operationLog.get(name)!
    log[operation].push(now)

    this.cleanupOldRecords(name, operation)
  }

  private cleanupOldRecords(name: string, operation: 'get' | 'save'): void {
    const log = this.operationLog.get(name)
    if (!log) return

    const now = Date.now()
    const cutoff = now - this.TIME_WINDOW

    log[operation] = log[operation].filter((timestamp) => timestamp > cutoff)

    if (log.get.length === 0 && log.save.length === 0) {
      this.operationLog.delete(name)
    }
  }

  private checkFrequency(name: string, operation: 'get' | 'save'): void {
    const log = this.operationLog.get(name)
    if (!log) return

    const count = log[operation].length

    if (count >= this.THRESHOLD) {
      if (this.isInCooldown(name, operation)) {
        return
      }

      console.warn(
        chalk.yellow(
          `[StorageFrequencyMonitor] Frequent ${operation.toUpperCase()} detected: ` +
            `config "${chalk.bold(name)}" accessed ${chalk.bold(count)} times in ${this.TIME_WINDOW / 1000}s. ` +
            `Consider optimizing to reduce overhead.`
        )
      )

      this.setCooldown(name, operation)
      log[operation] = []
    }
  }

  private isInCooldown(name: string, operation: 'get' | 'save'): boolean {
    const cooldown = this.warningCooldown.get(name)
    if (!cooldown) return false

    const lastWarning = cooldown[operation]
    if (!lastWarning) return false

    return Date.now() - lastWarning < this.COOLDOWN_PERIOD
  }

  private setCooldown(name: string, operation: 'get' | 'save'): void {
    if (!this.warningCooldown.has(name)) {
      this.warningCooldown.set(name, {})
    }

    const cooldown = this.warningCooldown.get(name)!
    cooldown[operation] = Date.now()
  }

  /**
   * Get operation statistics (for debugging)
   */
  getStats(name: string): { get: number; save: number } | null {
    const log = this.operationLog.get(name)
    if (!log) return null

    return {
      get: log.get.length,
      save: log.save.length
    }
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.operationLog.clear()
    this.warningCooldown.clear()
  }

  /**
   * Reset specific config tracking data
   */
  resetConfig(name: string): void {
    this.operationLog.delete(name)
    this.warningCooldown.delete(name)
  }
}
