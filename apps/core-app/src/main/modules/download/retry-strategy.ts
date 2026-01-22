/**
 * 重试策略
 * 实现智能的自动重试机制
 */

import type { ErrorLogger } from './error-logger'
import { DownloadErrorClass, ErrorSeverity } from './error-types'

// 重试配置接口
export interface RetryConfig {
  maxRetries: number
  initialDelay: number // 初始延迟（毫秒）
  maxDelay: number // 最大延迟（毫秒）
  backoffMultiplier: number // 退避倍数
  jitter: boolean // 是否添加随机抖动
}

// 重试结果接口
export interface RetryResult<T> {
  success: boolean
  result?: T
  error?: DownloadErrorClass
  attempts: number
}

// 默认重试配置
export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelay: 5000, // 5秒
  maxDelay: 60000, // 60秒
  backoffMultiplier: 2,
  jitter: true
}

/**
 * 重试策略类
 */
export class RetryStrategy {
  private config: RetryConfig
  private errorLogger?: ErrorLogger

  constructor(config: Partial<RetryConfig> = {}, errorLogger?: ErrorLogger) {
    this.config = { ...defaultRetryConfig, ...config }
    this.errorLogger = errorLogger
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      taskId: string
      url: string
      filename: string
      module: string
    },
    onRetry?: (attempt: number, error: DownloadErrorClass, delay: number) => void
  ): Promise<RetryResult<T>> {
    let lastError: DownloadErrorClass | undefined
    let attempts = 0

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      attempts++

      try {
        const result = await operation()

        // 成功
        if (attempt > 0 && this.errorLogger) {
          await this.errorLogger.logInfo(`Operation succeeded after ${attempt} retries`, {
            taskId: context.taskId,
            attempts: attempt
          })
        }

        return {
          success: true,
          result,
          attempts
        }
      } catch (error) {
        // 转换为 DownloadErrorClass
        const downloadError =
          error instanceof DownloadErrorClass
            ? error
            : DownloadErrorClass.fromError(error as Error, {
                taskId: context.taskId,
                url: context.url,
                filename: context.filename,
                module: context.module,
                timestamp: Date.now()
              })

        lastError = downloadError

        // 记录错误
        if (this.errorLogger) {
          await this.errorLogger.logError(downloadError.toErrorObject(), {
            attempt,
            maxRetries: this.config.maxRetries
          })
        }

        // 检查是否应该重试
        if (!this.shouldRetry(downloadError, attempt)) {
          break
        }

        // 计算延迟时间
        const delay = this.calculateDelay(attempt)

        // 通知重试
        if (onRetry) {
          onRetry(attempt + 1, downloadError, delay)
        }

        // 等待后重试
        await this.sleep(delay)
      }
    }

    // 所有重试都失败
    return {
      success: false,
      error: lastError,
      attempts
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: DownloadErrorClass, attempt: number): boolean {
    // 已达到最大重试次数
    if (attempt >= this.config.maxRetries) {
      return false
    }

    // 检查错误是否可以重试
    if (!error.canRetry) {
      return false
    }

    // 严重错误不重试
    if (error.severity === ErrorSeverity.CRITICAL) {
      return false
    }

    return true
  }

  /**
   * 计算延迟时间（指数退避 + 可选抖动）
   */
  private calculateDelay(attempt: number): number {
    // 指数退避
    let delay = Math.min(
      this.config.initialDelay * this.config.backoffMultiplier ** attempt,
      this.config.maxDelay
    )

    // 添加随机抖动（避免雷鸣群效应）
    if (this.config.jitter) {
      const jitterAmount = delay * 0.2 // 20% 抖动
      delay = delay + (Math.random() * 2 - 1) * jitterAmount
    }

    return Math.floor(delay)
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取配置
   */
  getConfig(): RetryConfig {
    return { ...this.config }
  }
}

/**
 * 创建带重试的下载函数
 */
export function createRetryableDownload<T>(
  downloadFn: () => Promise<T>,
  retryStrategy: RetryStrategy,
  context: {
    taskId: string
    url: string
    filename: string
    module: string
  },
  onRetry?: (attempt: number, error: DownloadErrorClass, delay: number) => void
): Promise<T> {
  return retryStrategy.executeWithRetry(downloadFn, context, onRetry).then((result) => {
    if (result.success && result.result !== undefined) {
      return result.result
    }
    throw result.error || new Error('Download failed')
  })
}
