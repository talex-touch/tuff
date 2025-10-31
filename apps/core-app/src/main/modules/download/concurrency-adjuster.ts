import { DownloadConfig, NetworkStatus } from '@talex-touch/utils'
import { NetworkMonitor } from './network-monitor'

export class ConcurrencyAdjuster {
  private config: DownloadConfig
  private networkMonitor: NetworkMonitor
  private currentConcurrency: number
  private adjustmentHistory: number[] = []
  private readonly maxHistorySize = 10

  constructor(config: DownloadConfig, networkMonitor: NetworkMonitor) {
    this.config = config
    this.networkMonitor = networkMonitor
    this.currentConcurrency = config.concurrency.maxConcurrent
  }

  // 计算建议的并发数
  calculateRecommendedConcurrency(): number {
    const networkStatus = this.networkMonitor.getCurrentStatus()
    const baseConcurrency = this.config.concurrency.maxConcurrent

    if (!this.config.concurrency.autoAdjust) {
      return baseConcurrency
    }

    let recommendedConcurrency = baseConcurrency

    // 根据网络速度调整
    if (this.config.concurrency.networkAware) {
      recommendedConcurrency = this.adjustByNetworkSpeed(recommendedConcurrency, networkStatus)
    }

    // 根据网络稳定性调整
    if (this.config.concurrency.networkAware) {
      recommendedConcurrency = this.adjustByNetworkStability(recommendedConcurrency, networkStatus)
    }

    // 根据优先级调整
    if (this.config.concurrency.priorityBased) {
      recommendedConcurrency = this.adjustByPriority(recommendedConcurrency)
    }

    // 确保在合理范围内
    return Math.max(1, Math.min(10, recommendedConcurrency))
  }

  // 根据网络速度调整并发数
  private adjustByNetworkSpeed(baseConcurrency: number, networkStatus: NetworkStatus): number {
    const speed = networkStatus.speed
    let multiplier = 1.0

    if (speed > 10 * 1024 * 1024) {
      // > 10MB/s
      multiplier = 1.5
    } else if (speed > 5 * 1024 * 1024) {
      // > 5MB/s
      multiplier = 1.3
    } else if (speed > 2 * 1024 * 1024) {
      // > 2MB/s
      multiplier = 1.1
    } else if (speed < 1 * 1024 * 1024) {
      // < 1MB/s
      multiplier = 0.7
    } else if (speed < 512 * 1024) {
      // < 512KB/s
      multiplier = 0.5
    }

    return Math.round(baseConcurrency * multiplier)
  }

  // 根据网络稳定性调整并发数
  private adjustByNetworkStability(baseConcurrency: number, networkStatus: NetworkStatus): number {
    const stability = networkStatus.stability
    let multiplier = 1.0

    if (stability > 0.8) {
      multiplier = 1.2 // 网络稳定，可以增加并发
    } else if (stability > 0.6) {
      multiplier = 1.0 // 网络一般，保持默认
    } else if (stability > 0.4) {
      multiplier = 0.8 // 网络不稳定，减少并发
    } else {
      multiplier = 0.6 // 网络很不稳定，大幅减少并发
    }

    return Math.round(baseConcurrency * multiplier)
  }

  // 根据优先级调整并发数
  private adjustByPriority(baseConcurrency: number): number {
    // 这里可以根据当前队列中的高优先级任务数量来调整
    // 暂时返回基础并发数
    return baseConcurrency
  }

  // 动态调整并发数
  adjustConcurrency(): number {
    const recommended = this.calculateRecommendedConcurrency()

    if (recommended !== this.currentConcurrency) {
      this.updateConcurrency(recommended)
    }

    return this.currentConcurrency
  }

  // 更新并发数
  updateConcurrency(newConcurrency: number): void {
    const oldConcurrency = this.currentConcurrency
    this.currentConcurrency = Math.max(1, Math.min(10, newConcurrency))

    // 记录调整历史
    this.addToHistory(this.currentConcurrency)

    console.log(`Concurrency adjusted from ${oldConcurrency} to ${this.currentConcurrency}`)
  }

  // 获取当前并发数
  getCurrentConcurrency(): number {
    return this.currentConcurrency
  }

  // 获取并发调整历史
  getAdjustmentHistory(): number[] {
    return [...this.adjustmentHistory]
  }

  // 获取平均并发数
  getAverageConcurrency(): number {
    if (this.adjustmentHistory.length === 0) {
      return this.currentConcurrency
    }

    const sum = this.adjustmentHistory.reduce((acc, val) => acc + val, 0)
    return Math.round(sum / this.adjustmentHistory.length)
  }

  // 预测最优并发数
  predictOptimalConcurrency(): number {
    const networkStatus = this.networkMonitor.getCurrentStatus()

    // 基于网络状况预测
    let optimal = 1

    if (networkStatus.speed > 10 * 1024 * 1024 && networkStatus.stability > 0.8) {
      optimal = 6 // 高速稳定网络
    } else if (networkStatus.speed > 5 * 1024 * 1024 && networkStatus.stability > 0.6) {
      optimal = 4 // 中高速网络
    } else if (networkStatus.speed > 2 * 1024 * 1024 && networkStatus.stability > 0.4) {
      optimal = 3 // 中等网络
    } else if (networkStatus.speed > 1024 * 1024 && networkStatus.stability > 0.3) {
      optimal = 2 // 较慢网络
    } else {
      optimal = 1 // 慢网络或不稳定网络
    }

    return Math.min(optimal, this.config.concurrency.maxConcurrent)
  }

  // 检查是否需要调整并发数
  shouldAdjustConcurrency(): boolean {
    const recommended = this.calculateRecommendedConcurrency()
    const difference = Math.abs(recommended - this.currentConcurrency)

    // 如果差异大于1，则需要调整
    return difference > 1
  }

  // 获取调整建议
  getAdjustmentSuggestion(): {
    shouldAdjust: boolean
    recommendedConcurrency: number
    reason: string
  } {
    const recommended = this.calculateRecommendedConcurrency()
    const difference = recommended - this.currentConcurrency

    let reason = ''
    if (difference > 1) {
      reason = 'Network conditions improved, can increase concurrency'
    } else if (difference < -1) {
      reason = 'Network conditions degraded, should decrease concurrency'
    } else {
      reason = 'Current concurrency is optimal'
    }

    return {
      shouldAdjust: Math.abs(difference) > 1,
      recommendedConcurrency: recommended,
      reason
    }
  }

  // 重置并发数到默认值
  resetToDefault(): void {
    this.currentConcurrency = this.config.concurrency.maxConcurrent
    this.addToHistory(this.currentConcurrency)
  }

  // 设置最大并发数限制
  setMaxConcurrency(maxConcurrency: number): void {
    this.config.concurrency.maxConcurrent = Math.max(1, Math.min(10, maxConcurrency))

    // 如果当前并发数超过新的最大值，则调整
    if (this.currentConcurrency > this.config.concurrency.maxConcurrent) {
      this.updateConcurrency(this.config.concurrency.maxConcurrent)
    }
  }

  // 启用/禁用自动调整
  setAutoAdjust(enabled: boolean): void {
    this.config.concurrency.autoAdjust = enabled
  }

  // 启用/禁用网络感知
  setNetworkAware(enabled: boolean): void {
    this.config.concurrency.networkAware = enabled
  }

  // 启用/禁用基于优先级的调整
  setPriorityBased(enabled: boolean): void {
    this.config.concurrency.priorityBased = enabled
  }

  // 获取并发调整统计
  getAdjustmentStats(): {
    currentConcurrency: number
    maxConcurrency: number
    averageConcurrency: number
    adjustmentCount: number
    autoAdjustEnabled: boolean
    networkAwareEnabled: boolean
    priorityBasedEnabled: boolean
  } {
    return {
      currentConcurrency: this.currentConcurrency,
      maxConcurrency: this.config.concurrency.maxConcurrent,
      averageConcurrency: this.getAverageConcurrency(),
      adjustmentCount: this.adjustmentHistory.length,
      autoAdjustEnabled: this.config.concurrency.autoAdjust,
      networkAwareEnabled: this.config.concurrency.networkAware,
      priorityBasedEnabled: this.config.concurrency.priorityBased
    }
  }

  // 添加到调整历史
  private addToHistory(concurrency: number): void {
    this.adjustmentHistory.push(concurrency)

    if (this.adjustmentHistory.length > this.maxHistorySize) {
      this.adjustmentHistory.shift()
    }
  }
}
