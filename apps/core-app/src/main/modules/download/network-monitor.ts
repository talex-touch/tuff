import { NetworkStatus } from '@talex-touch/utils'

export class NetworkMonitor {
  private speedHistory: number[] = []
  private latencyHistory: number[] = []
  private readonly maxHistorySize = 10
  private lastCheckTime = 0
  private cachedStatus: NetworkStatus | null = null
  private readonly cacheTimeout = 5000 // 5 seconds

  // 监控网络状况
  async monitorNetwork(): Promise<NetworkStatus> {
    const now = Date.now()

    // 返回缓存结果如果还在有效期内
    if (this.cachedStatus && (now - this.lastCheckTime) < this.cacheTimeout) {
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
        recommendedConcurrency
      }

      this.lastCheckTime = now
      return this.cachedStatus
    } catch (error) {
      console.error('Network monitoring failed:', error)

      // 返回默认状态
      return {
        speed: 1024 * 1024, // 1MB/s
        latency: 100,
        stability: 0.5,
        recommendedConcurrency: 2
      }
    }
  }

  // 获取当前网络状态（缓存）
  getCurrentStatus(): NetworkStatus {
    return this.cachedStatus || {
      speed: 1024 * 1024, // 1MB/s
      latency: 100,
      stability: 0.5,
      recommendedConcurrency: 2
    }
  }

  // 获取建议的并发数
  getRecommendedConcurrency(speed?: number, latency?: number, stability?: number): number {
    const status = speed !== undefined ? { speed, latency: latency || 100, stability: stability || 0.5 } : this.getCurrentStatus()

    let concurrency = 1

    // 根据网络速度调整
    if (status.speed > 10 * 1024 * 1024) { // > 10MB/s
      concurrency = 5
    } else if (status.speed > 5 * 1024 * 1024) { // > 5MB/s
      concurrency = 4
    } else if (status.speed > 2 * 1024 * 1024) { // > 2MB/s
      concurrency = 3
    } else if (status.speed > 1024 * 1024) { // > 1MB/s
      concurrency = 2
    } else {
      concurrency = 1
    }

    // 根据延迟调整
    if (status.latency > 500) {
      concurrency = Math.max(1, concurrency - 1)
    } else if (status.latency < 50) {
      concurrency = Math.min(10, concurrency + 1)
    }

    // 根据稳定性调整
    if (status.stability < 0.3) {
      concurrency = Math.max(1, concurrency - 1)
    } else if (status.stability > 0.8) {
      concurrency = Math.min(10, concurrency + 1)
    }

    return Math.max(1, Math.min(10, concurrency))
  }

  // 测量网络速度
  private async measureSpeed(): Promise<number> {
    try {
      // 使用一个小文件来测试下载速度
      const testUrl = 'https://httpbin.org/bytes/1048576' // 1MB test file
      const startTime = Date.now()

      const response = await fetch(testUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const buffer = await response.arrayBuffer()
      const endTime = Date.now()

      const duration = (endTime - startTime) / 1000 // seconds
      const speed = buffer.byteLength / duration // bytes per second

      // 添加到历史记录
      this.addToHistory(this.speedHistory, speed)

      return speed
    } catch (error) {
      console.warn('Speed measurement failed:', error)

      // 返回历史平均值或默认值
      if (this.speedHistory.length > 0) {
        return this.speedHistory.reduce((sum, speed) => sum + speed, 0) / this.speedHistory.length
      }

      return 1024 * 1024 // 1MB/s default
    }
  }

  // 测量网络延迟
  private async measureLatency(): Promise<number> {
    try {
      const testUrl = 'https://httpbin.org/get'
      const startTime = Date.now()

      const response = await fetch(testUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      await response.json()
      const endTime = Date.now()

      const latency = endTime - startTime

      // 添加到历史记录
      this.addToHistory(this.latencyHistory, latency)

      return latency
    } catch (error) {
      console.warn('Latency measurement failed:', error)

      // 返回历史平均值或默认值
      if (this.latencyHistory.length > 0) {
        return this.latencyHistory.reduce((sum, latency) => sum + latency, 0) / this.latencyHistory.length
      }

      return 100 // 100ms default
    }
  }

  // 计算网络稳定性
  private calculateStability(): number {
    if (this.speedHistory.length < 3 || this.latencyHistory.length < 3) {
      return 0.5 // 默认中等稳定性
    }

    // 计算速度稳定性
    const speedVariance = this.calculateVariance(this.speedHistory)
    const speedStability = Math.max(0, 1 - (speedVariance / (this.speedHistory.reduce((sum, s) => sum + s, 0) / this.speedHistory.length)))

    // 计算延迟稳定性
    const latencyVariance = this.calculateVariance(this.latencyHistory)
    const avgLatency = this.latencyHistory.reduce((sum, l) => sum + l, 0) / this.latencyHistory.length
    const latencyStability = Math.max(0, 1 - (latencyVariance / avgLatency))

    // 综合稳定性
    return (speedStability + latencyStability) / 2
  }

  // 计算方差
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length
    return Math.sqrt(variance)
  }

  // 添加到历史记录
  private addToHistory(history: number[], value: number): void {
    history.push(value)

    if (history.length > this.maxHistorySize) {
      history.shift()
    }
  }

  // 检测网络变化
  onNetworkChange(callback: (status: NetworkStatus) => void): void {
    // 定期检查网络状态变化
    setInterval(async () => {
      const oldStatus = this.cachedStatus
      const newStatus = await this.monitorNetwork()

      // 检查是否有显著变化
      if (oldStatus && this.hasSignificantChange(oldStatus, newStatus)) {
        callback(newStatus)
      }
    }, 10000) // 每10秒检查一次
  }

  // 检查是否有显著变化
  private hasSignificantChange(oldStatus: NetworkStatus, newStatus: NetworkStatus): boolean {
    const speedChange = Math.abs(newStatus.speed - oldStatus.speed) / oldStatus.speed
    const latencyChange = Math.abs(newStatus.latency - oldStatus.latency) / oldStatus.latency
    const stabilityChange = Math.abs(newStatus.stability - oldStatus.stability)

    return speedChange > 0.3 || latencyChange > 0.5 || stabilityChange > 0.2
  }

  // 获取网络质量评级
  getNetworkQuality(): 'excellent' | 'good' | 'fair' | 'poor' {
    const status = this.getCurrentStatus()

    if (status.speed > 5 * 1024 * 1024 && status.latency < 100 && status.stability > 0.8) {
      return 'excellent'
    } else if (status.speed > 2 * 1024 * 1024 && status.latency < 200 && status.stability > 0.6) {
      return 'good'
    } else if (status.speed > 1024 * 1024 && status.latency < 500 && status.stability > 0.4) {
      return 'fair'
    } else {
      return 'poor'
    }
  }

  // 格式化速度显示
  formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond >= 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    } else if (bytesPerSecond >= 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    } else {
      return `${bytesPerSecond.toFixed(0)} B/s`
    }
  }

  // 格式化大小显示
  formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    } else {
      return `${bytes.toFixed(0)} B`
    }
  }
}
