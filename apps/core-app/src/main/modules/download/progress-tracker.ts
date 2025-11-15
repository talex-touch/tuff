import { DownloadProgress } from '@talex-touch/utils'

/**
 * 进度数据点，用于计算移动平均
 */
interface ProgressDataPoint {
  timestamp: number
  downloadedSize: number
}

/**
 * 进度跟踪器配置
 */
interface ProgressTrackerConfig {
  windowSize: number // 移动平均窗口大小（数据点数量）
  updateInterval: number // 更新间隔（毫秒）
  minSpeedSamples: number // 计算速度所需的最小样本数
}

/**
 * 格式化后的进度信息
 */
export interface FormattedProgress {
  percentage: string // "45.2%"
  speed: string // "2.1 MB/s"
  downloaded: string // "45.2 MB"
  total: string // "100 MB"
  remainingTime: string // "15秒" or "1分12秒"
}

/**
 * ProgressTracker 类
 * 负责计算实时下载速度、使用移动平均算法平滑速度显示、估算剩余时间
 */
export class ProgressTracker {
  private taskId: string
  private dataPoints: ProgressDataPoint[] = []
  private config: ProgressTrackerConfig
  private lastUpdateTime: number = 0
  private currentProgress: DownloadProgress
  private throttledCallback: ((progress: DownloadProgress) => void) | null = null

  constructor(
    taskId: string,
    config: Partial<ProgressTrackerConfig> = {}
  ) {
    this.taskId = taskId
    this.config = {
      windowSize: config.windowSize || 10, // 默认使用最近10个数据点
      updateInterval: config.updateInterval || 1000, // 默认每秒更新一次
      minSpeedSamples: config.minSpeedSamples || 2 // 至少需要2个样本才能计算速度
    }

    this.currentProgress = {
      totalSize: undefined,
      downloadedSize: 0,
      speed: 0,
      remainingTime: undefined,
      percentage: 0
    }
  }

  /**
   * 更新进度数据
   * @param downloadedSize 已下载大小（字节）
   * @param totalSize 总大小（字节）
   * @returns 是否触发了更新回调
   */
  updateProgress(downloadedSize: number, totalSize?: number): boolean {
    const now = Date.now()

    // 添加新的数据点
    this.dataPoints.push({
      timestamp: now,
      downloadedSize
    })

    // 保持窗口大小
    if (this.dataPoints.length > this.config.windowSize) {
      this.dataPoints.shift()
    }

    // 计算速度（使用移动平均）
    const speed = this.calculateSpeed()

    // 计算百分比
    const percentage = totalSize && totalSize > 0
      ? Math.min(100, Math.round((downloadedSize / totalSize) * 100))
      : 0

    // 计算剩余时间
    const remainingTime = this.calculateRemainingTime(downloadedSize, totalSize, speed)

    // 更新当前进度
    this.currentProgress = {
      totalSize,
      downloadedSize,
      speed,
      remainingTime,
      percentage
    }

    // 检查是否应该触发更新（节流）
    if (now - this.lastUpdateTime >= this.config.updateInterval) {
      this.lastUpdateTime = now
      if (this.throttledCallback) {
        this.throttledCallback(this.currentProgress)
      }
      return true
    }

    return false
  }

  /**
   * 使用移动平均算法计算下载速度
   * @returns 速度（字节/秒）
   */
  private calculateSpeed(): number {
    if (this.dataPoints.length < this.config.minSpeedSamples) {
      return 0
    }

    // 使用最早和最新的数据点计算平均速度
    const firstPoint = this.dataPoints[0]
    const lastPoint = this.dataPoints[this.dataPoints.length - 1]

    const timeDiff = (lastPoint.timestamp - firstPoint.timestamp) / 1000 // 转换为秒
    const sizeDiff = lastPoint.downloadedSize - firstPoint.downloadedSize

    if (timeDiff <= 0) {
      return 0
    }

    // 计算平均速度
    const speed = sizeDiff / timeDiff

    // 返回非负速度
    return Math.max(0, speed)
  }

  /**
   * 计算剩余时间
   * @param downloadedSize 已下载大小
   * @param totalSize 总大小
   * @param speed 当前速度（字节/秒）
   * @returns 剩余时间（秒），如果无法计算则返回 undefined
   */
  private calculateRemainingTime(
    downloadedSize: number,
    totalSize: number | undefined,
    speed: number
  ): number | undefined {
    if (!totalSize || speed <= 0 || downloadedSize >= totalSize) {
      return undefined
    }

    const remainingSize = totalSize - downloadedSize
    const remainingTime = Math.ceil(remainingSize / speed)

    return remainingTime
  }

  /**
   * 获取当前进度
   */
  getProgress(): DownloadProgress {
    return { ...this.currentProgress }
  }

  /**
   * 获取格式化的进度信息
   */
  getFormattedProgress(): FormattedProgress {
    return {
      percentage: this.formatPercentage(this.currentProgress.percentage),
      speed: this.formatSpeed(this.currentProgress.speed),
      downloaded: this.formatSize(this.currentProgress.downloadedSize),
      total: this.formatSize(this.currentProgress.totalSize || 0),
      remainingTime: this.formatTime(this.currentProgress.remainingTime)
    }
  }

  /**
   * 设置节流回调函数
   * @param callback 回调函数
   */
  setThrottledCallback(callback: (progress: DownloadProgress) => void): void {
    this.throttledCallback = callback
  }

  /**
   * 重置进度跟踪器
   */
  reset(): void {
    this.dataPoints = []
    this.lastUpdateTime = 0
    this.currentProgress = {
      totalSize: undefined,
      downloadedSize: 0,
      speed: 0,
      remainingTime: undefined,
      percentage: 0
    }
  }

  /**
   * 格式化百分比
   */
  private formatPercentage(percentage: number): string {
    return `${percentage.toFixed(1)}%`
  }

  /**
   * 格式化速度（KB/s, MB/s）
   */
  static formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) {
      return '0 B/s'
    }

    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
    let size = bytesPerSecond
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * 实例方法：格式化速度
   */
  private formatSpeed(bytesPerSecond: number): string {
    return ProgressTracker.formatSpeed(bytesPerSecond)
  }

  /**
   * 格式化文件大小（KB, MB, GB）
   */
  static formatSize(bytes: number): string {
    if (bytes === 0) {
      return '0 B'
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * 实例方法：格式化文件大小
   */
  private formatSize(bytes: number): string {
    return ProgressTracker.formatSize(bytes)
  }

  /**
   * 格式化时间（秒、分钟、小时）
   */
  static formatTime(seconds: number | undefined): string {
    if (seconds === undefined || seconds <= 0) {
      return '--'
    }

    if (seconds < 60) {
      return `${Math.ceil(seconds)}秒`
    }

    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = Math.ceil(seconds % 60)
      return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分`
    }

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`
  }

  /**
   * 实例方法：格式化时间
   */
  private formatTime(seconds: number | undefined): string {
    return ProgressTracker.formatTime(seconds)
  }

  /**
   * 获取任务ID
   */
  getTaskId(): string {
    return this.taskId
  }

  /**
   * 强制触发更新回调（忽略节流）
   */
  forceUpdate(): void {
    if (this.throttledCallback) {
      this.throttledCallback(this.currentProgress)
      this.lastUpdateTime = Date.now()
    }
  }
}
