/**
 * 错误日志记录器
 * 负责记录和管理下载错误日志
 */

import type { DownloadError } from './error-types'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { DownloadErrorType, ErrorSeverity } from './error-types'

// 日志级别
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

// 日志条目接口
export interface LogEntry {
  level: LogLevel
  timestamp: number
  message: string
  error?: DownloadError
  metadata?: Record<string, any>
}

/**
 * 错误日志记录器类
 */
export class ErrorLogger {
  private logFilePath: string
  private maxLogSize: number = 10 * 1024 * 1024 // 10MB
  private maxLogFiles: number = 5
  private logBuffer: LogEntry[] = []
  private readonly pollingService = PollingService.getInstance()
  private readonly flushTaskId = 'download.error-logger.flush'
  private isInitialized: boolean = false

  constructor(logDir: string) {
    this.logFilePath = path.join(logDir, 'download-errors.log')
  }

  /**
   * 初始化日志记录器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    try {
      // 确保日志目录存在
      const logDir = path.dirname(this.logFilePath)
      await fs.mkdir(logDir, { recursive: true })

      // 启动定时刷新
      if (this.pollingService.isRegistered(this.flushTaskId)) {
        this.pollingService.unregister(this.flushTaskId)
      }
      this.pollingService.register(
        this.flushTaskId,
        () =>
          this.flush().catch((error) => {
            console.error('Failed to flush log buffer:', error)
          }),
        { interval: 5, unit: 'seconds' }
      )
      this.pollingService.start()

      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize error logger:', error)
    }
  }

  /**
   * 记录错误
   */
  async logError(error: DownloadError, metadata?: Record<string, any>): Promise<void> {
    const entry: LogEntry = {
      level: this.mapSeverityToLogLevel(error.severity),
      timestamp: Date.now(),
      message: error.message,
      error,
      metadata
    }

    this.logBuffer.push(entry)

    // 如果是严重错误，立即刷新
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      await this.flush()
    }
  }

  /**
   * 记录信息
   */
  async logInfo(message: string, metadata?: Record<string, any>): Promise<void> {
    const entry: LogEntry = {
      level: LogLevel.INFO,
      timestamp: Date.now(),
      message,
      metadata
    }

    this.logBuffer.push(entry)
  }

  /**
   * 记录警告
   */
  async logWarn(message: string, metadata?: Record<string, any>): Promise<void> {
    const entry: LogEntry = {
      level: LogLevel.WARN,
      timestamp: Date.now(),
      message,
      metadata
    }

    this.logBuffer.push(entry)
  }

  /**
   * 记录调试信息
   */
  async logDebug(message: string, metadata?: Record<string, any>): Promise<void> {
    const entry: LogEntry = {
      level: LogLevel.DEBUG,
      timestamp: Date.now(),
      message,
      metadata
    }

    this.logBuffer.push(entry)
  }

  /**
   * 刷新日志缓冲区
   */
  private async flush(): Promise<void> {
    if (this.logBuffer.length === 0) {
      return
    }

    const entries = [...this.logBuffer]
    this.logBuffer = []

    try {
      // 检查日志文件大小
      await this.rotateLogIfNeeded()

      // 格式化日志条目
      const logLines = `${entries.map((entry) => this.formatLogEntry(entry)).join('\n')}\n`

      // 追加到日志文件
      await fs.appendFile(this.logFilePath, logLines, 'utf-8')
    } catch (error) {
      console.error('Failed to write log entries:', error)
      // 将条目放回缓冲区
      this.logBuffer.unshift(...entries)
    }
  }

  /**
   * 格式化日志条目
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString()
    const level = entry.level.toUpperCase().padEnd(5)

    let logLine = `[${timestamp}] [${level}] ${entry.message}`

    if (entry.error) {
      logLine += `\n  Type: ${entry.error.type}`
      logLine += `\n  User Message: ${entry.error.userMessage}`
      logLine += `\n  Severity: ${entry.error.severity}`
      logLine += `\n  Can Retry: ${entry.error.canRetry}`
      logLine += `\n  Task ID: ${entry.error.taskId}`

      if (entry.error.details) {
        logLine += `\n  Details: ${JSON.stringify(entry.error.details)}`
      }

      if (entry.error.stackTrace) {
        logLine += `\n  Stack Trace:\n${entry.error.stackTrace}`
      }
    }

    if (entry.metadata) {
      logLine += `\n  Metadata: ${JSON.stringify(entry.metadata)}`
    }

    return logLine
  }

  /**
   * 日志轮转
   */
  private async rotateLogIfNeeded(): Promise<void> {
    try {
      const stats = await fs.stat(this.logFilePath)

      if (stats.size >= this.maxLogSize) {
        // 轮转日志文件
        const timestamp = Date.now()
        const rotatedPath = `${this.logFilePath}.${timestamp}`
        await fs.rename(this.logFilePath, rotatedPath)

        // 清理旧日志文件
        await this.cleanupOldLogs()
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to rotate log file:', error)
      }
    }
  }

  /**
   * 清理旧日志文件
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFilePath)
      const logFileName = path.basename(this.logFilePath)
      const entries = await fs.readdir(logDir)

      // 找到所有轮转的日志文件
      const logFiles = entries
        .filter((entry) => entry.startsWith(logFileName) && entry !== logFileName)
        .map((entry) => ({
          name: entry,
          path: path.join(logDir, entry)
        }))
        .sort((a, b) => b.name.localeCompare(a.name)) // 按时间戳降序排序

      // 删除超过限制的日志文件
      if (logFiles.length > this.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.maxLogFiles)
        for (const file of filesToDelete) {
          await fs.unlink(file.path)
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old logs:', error)
    }
  }

  /**
   * 读取日志
   */
  async readLogs(limit?: number): Promise<string> {
    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8')
      const lines = content.split('\n').filter((line) => line.trim())

      if (limit && limit > 0) {
        return lines.slice(-limit).join('\n')
      }

      return content
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }

  /**
   * 获取错误统计
   */
  async getErrorStats(): Promise<{
    total: number
    byType: Record<DownloadErrorType, number>
    bySeverity: Record<ErrorSeverity, number>
  }> {
    try {
      const content = await fs.readFile(this.logFilePath, 'utf-8')
      const lines = content.split('\n').filter((line) => line.includes('[ERROR]'))

      const stats = {
        total: lines.length,
        byType: {} as Record<DownloadErrorType, number>,
        bySeverity: {} as Record<ErrorSeverity, number>
      }

      // 初始化计数器
      Object.values(DownloadErrorType).forEach((type) => {
        stats.byType[type] = 0
      })
      Object.values(ErrorSeverity).forEach((severity) => {
        stats.bySeverity[severity] = 0
      })

      // 统计错误类型和严重程度
      for (const line of lines) {
        // 简单的模式匹配
        for (const type of Object.values(DownloadErrorType)) {
          if (line.includes(`Type: ${type}`)) {
            stats.byType[type]++
            break
          }
        }

        for (const severity of Object.values(ErrorSeverity)) {
          if (line.includes(`Severity: ${severity}`)) {
            stats.bySeverity[severity]++
            break
          }
        }
      }

      return stats
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          total: 0,
          byType: {} as Record<DownloadErrorType, number>,
          bySeverity: {} as Record<ErrorSeverity, number>
        }
      }
      throw error
    }
  }

  /**
   * 清除日志
   */
  async clearLogs(): Promise<void> {
    try {
      await fs.unlink(this.logFilePath)
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * 销毁日志记录器
   */
  async destroy(): Promise<void> {
    this.pollingService.unregister(this.flushTaskId)

    // 刷新剩余的日志
    await this.flush()

    this.isInitialized = false
  }

  /**
   * 映射严重程度到日志级别
   */
  private mapSeverityToLogLevel(severity: ErrorSeverity): LogLevel {
    switch (severity) {
      case ErrorSeverity.LOW:
        return LogLevel.INFO
      case ErrorSeverity.MEDIUM:
        return LogLevel.WARN
      case ErrorSeverity.HIGH:
      case ErrorSeverity.CRITICAL:
        return LogLevel.ERROR
      default:
        return LogLevel.ERROR
    }
  }
}
