import type { NetworkStatus } from '@talex-touch/utils'

/**
 * Network monitoring service for tracking network speed, latency, and stability.
 * Provides recommendations for optimal download concurrency based on network conditions.
 */
export class NetworkMonitor {
  private speedHistory: number[] = []
  private latencyHistory: number[] = []
  private readonly maxHistorySize = 10
  private lastCheckTime = 0
  private cachedStatus: NetworkStatus | null = null
  private readonly cacheTimeout = 5000
  private networkAvailable = true

  /**
   * Monitors network conditions and returns current status with caching.
   * @returns Promise resolving to current network status
   */
  async monitorNetwork(): Promise<NetworkStatus> {
    const now = Date.now()

    if (this.cachedStatus && now - this.lastCheckTime < this.cacheTimeout) {
      return this.cachedStatus
    }

    try {
      const speed = await this.measureSpeed()
      const latency = await this.measureLatency()
      const stability = this.calculateStability()
      const recommendedConcurrency = this.getRecommendedConcurrency(speed, latency, stability)

      this.cachedStatus = {
        speed,
        latency,
        stability,
        recommendedConcurrency,
      }

      this.lastCheckTime = now
      this.networkAvailable = true
      return this.cachedStatus
    }
    catch (error) {
      console.error('Network monitoring failed:', error)
      this.networkAvailable = false

      const defaultStatus = {
        speed: 1024 * 1024,
        latency: 100,
        stability: 0.5,
        recommendedConcurrency: 2,
      }

      this.cachedStatus = defaultStatus
      this.lastCheckTime = now
      return defaultStatus
    }
  }

  /**
   * Gets the current network status from cache.
   * @returns Current network status or default values if not available
   */
  getCurrentStatus(): NetworkStatus {
    return (
      this.cachedStatus || {
        speed: 1024 * 1024,
        latency: 100,
        stability: 0.5,
        recommendedConcurrency: 2,
      }
    )
  }

  /**
   * Calculates recommended download concurrency based on network metrics.
   * @param speed - Network speed in bytes per second
   * @param latency - Network latency in milliseconds
   * @param stability - Network stability score (0-1)
   * @returns Recommended concurrent download count (1-10)
   */
  getRecommendedConcurrency(speed?: number, latency?: number, stability?: number): number {
    const status
      = speed !== undefined
        ? { speed, latency: latency || 100, stability: stability || 0.5 }
        : this.getCurrentStatus()

    let concurrency = 1

    if (status.speed > 10 * 1024 * 1024) {
      concurrency = 5
    }
    else if (status.speed > 5 * 1024 * 1024) {
      concurrency = 4
    }
    else if (status.speed > 2 * 1024 * 1024) {
      concurrency = 3
    }
    else if (status.speed > 1024 * 1024) {
      concurrency = 2
    }
    else {
      concurrency = 1
    }

    if (status.latency > 500) {
      concurrency = Math.max(1, concurrency - 1)
    }
    else if (status.latency < 50) {
      concurrency = Math.min(10, concurrency + 1)
    }

    if (status.stability < 0.3) {
      concurrency = Math.max(1, concurrency - 1)
    }
    else if (status.stability > 0.8) {
      concurrency = Math.min(10, concurrency + 1)
    }

    return Math.max(1, Math.min(10, concurrency))
  }

  /**
   * Measures network download speed using multiple test URLs with fallback.
   * Returns default value if network is unavailable.
   * @returns Network speed in bytes per second
   */
  private async measureSpeed(): Promise<number> {
    if (!this.networkAvailable) {
      return 1024 * 1024
    }

    const testUrls = [
      'https://cdn.jsdelivr.net/gh/sindresorhus/github-markdown-css@4/github-markdown.css',
      'https://unpkg.com/vue@latest/dist/vue.global.js',
      'https://httpbin.org/bytes/1048576',
    ]

    for (const testUrl of testUrls) {
      try {
        const startTime = Date.now()

        const response = await fetch(testUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        })

        if (!response.ok) {
          continue
        }

        const buffer = await response.arrayBuffer()
        const endTime = Date.now()

        const duration = (endTime - startTime) / 1000
        const speed = buffer.byteLength / duration

        this.addToHistory(this.speedHistory, speed)
        this.networkAvailable = true
        return speed
      }
      catch (error) {
        continue
      }
    }

    this.networkAvailable = false

    if (this.speedHistory.length > 0) {
      return this.speedHistory.reduce((sum, speed) => sum + speed, 0) / this.speedHistory.length
    }

    return 1024 * 1024
  }

  /**
   * Measures network latency using HEAD requests with multiple fallback URLs.
   * Returns default value if network is unavailable.
   * @returns Network latency in milliseconds
   */
  private async measureLatency(): Promise<number> {
    if (!this.networkAvailable) {
      return 100
    }

    const testUrls = [
      'https://www.google.com/favicon.ico',
      'https://cdn.jsdelivr.net/favicon.ico',
      'https://httpbin.org/get',
    ]

    for (const testUrl of testUrls) {
      try {
        const startTime = Date.now()

        const response = await fetch(testUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(3000),
        })

        if (!response.ok) {
          continue
        }

        await response.blob()
        const endTime = Date.now()

        const latency = endTime - startTime

        this.addToHistory(this.latencyHistory, latency)
        this.networkAvailable = true
        return latency
      }
      catch (error) {
        continue
      }
    }

    this.networkAvailable = false

    if (this.latencyHistory.length > 0) {
      return (
        this.latencyHistory.reduce((sum, latency) => sum + latency, 0) / this.latencyHistory.length
      )
    }

    return 100
  }

  /**
   * Calculates network stability based on speed and latency variance.
   * @returns Stability score between 0 and 1, where 1 is most stable
   */
  private calculateStability(): number {
    if (this.speedHistory.length < 3 || this.latencyHistory.length < 3) {
      return 0.5
    }

    const speedVariance = this.calculateVariance(this.speedHistory)
    const speedStability = Math.max(
      0,
      1
      - speedVariance
      / (this.speedHistory.reduce((sum, s) => sum + s, 0) / this.speedHistory.length),
    )

    const latencyVariance = this.calculateVariance(this.latencyHistory)
    const avgLatency
      = this.latencyHistory.reduce((sum, l) => sum + l, 0) / this.latencyHistory.length
    const latencyStability = Math.max(0, 1 - latencyVariance / avgLatency)

    return (speedStability + latencyStability) / 2
  }

  /**
   * Calculates the standard deviation of a set of values.
   * @param values - Array of numeric values
   * @returns Standard deviation
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance
      = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
    return Math.sqrt(variance)
  }

  /**
   * Adds a value to history and maintains max size limit.
   * @param history - History array to update
   * @param value - Value to add
   */
  private addToHistory(history: number[], value: number): void {
    history.push(value)

    if (history.length > this.maxHistorySize) {
      history.shift()
    }
  }

  /**
   * Registers a callback to be notified when network conditions change significantly.
   * @param callback - Function to call when significant changes are detected
   */
  onNetworkChange(callback: (status: NetworkStatus) => void): void {
    setInterval(async () => {
      const oldStatus = this.cachedStatus
      const newStatus = await this.monitorNetwork()

      if (oldStatus && this.hasSignificantChange(oldStatus, newStatus)) {
        callback(newStatus)
      }
    }, 10000)
  }

  /**
   * Determines if network conditions have changed significantly.
   * @param oldStatus - Previous network status
   * @param newStatus - Current network status
   * @returns True if change is significant enough to notify
   */
  private hasSignificantChange(oldStatus: NetworkStatus, newStatus: NetworkStatus): boolean {
    const speedChange = Math.abs(newStatus.speed - oldStatus.speed) / oldStatus.speed
    const latencyChange = Math.abs(newStatus.latency - oldStatus.latency) / oldStatus.latency
    const stabilityChange = Math.abs(newStatus.stability - oldStatus.stability)

    return speedChange > 0.3 || latencyChange > 0.5 || stabilityChange > 0.2
  }

  /**
   * Gets a human-readable quality rating for current network conditions.
   * @returns Quality rating: excellent, good, fair, or poor
   */
  getNetworkQuality(): 'excellent' | 'good' | 'fair' | 'poor' {
    const status = this.getCurrentStatus()

    if (status.speed > 5 * 1024 * 1024 && status.latency < 100 && status.stability > 0.8) {
      return 'excellent'
    }
    else if (status.speed > 2 * 1024 * 1024 && status.latency < 200 && status.stability > 0.6) {
      return 'good'
    }
    else if (status.speed > 1024 * 1024 && status.latency < 500 && status.stability > 0.4) {
      return 'fair'
    }
    else {
      return 'poor'
    }
  }

  /**
   * Formats bytes per second to human-readable string.
   * @param bytesPerSecond - Speed in bytes per second
   * @returns Formatted string (e.g., "5.2 MB/s")
   */
  formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond >= 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    }
    else if (bytesPerSecond >= 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    }
    else {
      return `${bytesPerSecond.toFixed(0)} B/s`
    }
  }

  /**
   * Formats byte count to human-readable size string.
   * @param bytes - Size in bytes
   * @returns Formatted string (e.g., "1.5 GB")
   */
  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    }
    else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }
    else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    else {
      return `${bytes.toFixed(0)} B`
    }
  }
}
