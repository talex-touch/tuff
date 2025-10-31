/**
 * Frequency manager for controlling update check frequency
 */
export class FrequencyManager {
  private lastCheckTimes: Map<string, number> = new Map()
  private readonly frequencyConfigs: Map<string, number> = new Map()

  /**
   * Frequency types and their intervals in milliseconds
   */
  readonly frequencyTypes = {
    startup: 0, // Only on startup
    daily: 24 * 60 * 60 * 1000, // 24 hours
    weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
    monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
    never: Number.MAX_SAFE_INTEGER // Never
  } as const

  /**
   * Check if update check should be performed based on frequency settings
   * @param key - Unique key for the check (e.g., 'github-releases')
   * @param frequency - Frequency type
   * @param force - Force check regardless of frequency
   * @returns True if check should be performed
   */
  shouldCheck(
    key: string,
    frequency: keyof typeof FrequencyManager.prototype.frequencyTypes,
    force = false
  ): boolean {
    if (force) {
      return true
    }

    if (frequency === 'never') {
      return false
    }

    const lastCheckTime = this.lastCheckTimes.get(key) || 0
    const now = Date.now()
    const interval = this.frequencyTypes[frequency]

    // For startup frequency, only check if never checked before
    if (frequency === 'startup') {
      return lastCheckTime === 0
    }

    return now - lastCheckTime >= interval
  }

  /**
   * Record that a check was performed
   * @param key - Unique key for the check
   * @param timestamp - Timestamp of the check (defaults to now)
   */
  recordCheck(key: string, timestamp?: number): void {
    this.lastCheckTimes.set(key, timestamp || Date.now())
  }

  /**
   * Get time until next check is allowed
   * @param key - Unique key for the check
   * @param frequency - Frequency type
   * @returns Time in milliseconds until next check, or 0 if check is allowed now
   */
  getTimeUntilNextCheck(
    key: string,
    frequency: keyof typeof FrequencyManager.prototype.frequencyTypes
  ): number {
    if (frequency === 'never') {
      return Number.MAX_SAFE_INTEGER
    }

    const lastCheckTime = this.lastCheckTimes.get(key) || 0
    const now = Date.now()
    const interval = this.frequencyTypes[frequency]

    if (frequency === 'startup') {
      return lastCheckTime === 0 ? 0 : Number.MAX_SAFE_INTEGER
    }

    const nextCheckTime = lastCheckTime + interval
    return Math.max(0, nextCheckTime - now)
  }

  /**
   * Get human-readable time until next check
   * @param key - Unique key for the check
   * @param frequency - Frequency type
   * @returns Human-readable time string
   */
  getTimeUntilNextCheckString(
    key: string,
    frequency: keyof typeof FrequencyManager.prototype.frequencyTypes
  ): string {
    const timeUntilNext = this.getTimeUntilNextCheck(key, frequency)

    if (timeUntilNext === Number.MAX_SAFE_INTEGER) {
      return frequency === 'never' ? 'Never' : 'Next startup'
    }

    if (timeUntilNext === 0) {
      return 'Now'
    }

    const hours = Math.floor(timeUntilNext / (60 * 60 * 1000))
    const minutes = Math.floor((timeUntilNext % (60 * 60 * 1000)) / (60 * 1000))

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m`
    } else {
      return 'Less than 1 minute'
    }
  }

  /**
   * Clear check history for a specific key
   * @param key - Unique key for the check
   */
  clearHistory(key: string): void {
    this.lastCheckTimes.delete(key)
  }

  /**
   * Clear all check history
   */
  clearAllHistory(): void {
    this.lastCheckTimes.clear()
  }

  /**
   * Get check history for a specific key
   * @param key - Unique key for the check
   * @returns Last check timestamp or null
   */
  getLastCheckTime(key: string): number | null {
    return this.lastCheckTimes.get(key) || null
  }

  /**
   * Get all check history
   * @returns Map of all check times
   */
  getAllCheckTimes(): Map<string, number> {
    return new Map(this.lastCheckTimes)
  }

  /**
   * Set custom frequency interval
   * @param key - Unique key for the frequency
   * @param interval - Interval in milliseconds
   */
  setCustomFrequency(key: string, interval: number): void {
    this.frequencyConfigs.set(key, interval)
  }

  /**
   * Get custom frequency interval
   * @param key - Unique key for the frequency
   * @returns Custom interval or null if not set
   */
  getCustomFrequency(key: string): number | null {
    return this.frequencyConfigs.get(key) || null
  }

  /**
   * Remove custom frequency
   * @param key - Unique key for the frequency
   */
  removeCustomFrequency(key: string): void {
    this.frequencyConfigs.delete(key)
  }
}

/**
 * Singleton frequency manager instance
 */
export const frequencyManager = new FrequencyManager()
