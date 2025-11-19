/**
 * 下载错误类型定义
 * 定义详细的错误类型和错误信息
 */

import { t } from '../../utils/i18n-helper'

// 错误类型枚举
export enum DownloadErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  DISK_SPACE_ERROR = 'disk_space_error',
  PERMISSION_ERROR = 'permission_error',
  CHECKSUM_ERROR = 'checksum_error',
  FILE_NOT_FOUND = 'file_not_found',
  INVALID_URL = 'invalid_url',
  CANCELLED = 'cancelled',
  UNKNOWN_ERROR = 'unknown_error',
}

// 错误严重程度
export enum ErrorSeverity {
  LOW = 'low', // 可以自动重试
  MEDIUM = 'medium', // 需要用户注意
  HIGH = 'high', // 需要用户干预
  CRITICAL = 'critical', // 严重错误
}

// 下载错误接口
export interface DownloadError {
  type: DownloadErrorType
  message: string
  userMessage: string // 用户友好的错误信息
  details?: any
  severity: ErrorSeverity
  timestamp: number
  taskId: string
  canRetry: boolean
  retryCount?: number
  stackTrace?: string
}

// 错误上下文接口
export interface ErrorContext {
  taskId: string
  url: string
  filename: string
  module: string
  timestamp: number
  additionalInfo?: Record<string, any>
}

/**
 * 下载错误类
 */
export class DownloadErrorClass extends Error {
  public readonly type: DownloadErrorType
  public readonly userMessage: string
  public readonly severity: ErrorSeverity
  public readonly canRetry: boolean
  public readonly context?: ErrorContext
  public readonly originalError?: Error

  constructor(
    type: DownloadErrorType,
    message: string,
    userMessage: string,
    severity: ErrorSeverity,
    canRetry: boolean,
    context?: ErrorContext,
    originalError?: Error,
  ) {
    super(message)
    this.name = 'DownloadError'
    this.type = type
    this.userMessage = userMessage
    this.severity = severity
    this.canRetry = canRetry
    this.context = context
    this.originalError = originalError

    // 保持正确的原型链
    Object.setPrototypeOf(this, DownloadErrorClass.prototype)
  }

  /**
   * 转换为错误对象
   */
  toErrorObject(): DownloadError {
    return {
      type: this.type,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      timestamp: Date.now(),
      taskId: this.context?.taskId || '',
      canRetry: this.canRetry,
      details: this.context,
      stackTrace: this.stack,
    }
  }

  /**
   * 从原生错误创建下载错误
   */
  static fromError(error: Error, context?: ErrorContext): DownloadErrorClass {
    // 如果已经是 DownloadErrorClass，直接返回
    if (error instanceof DownloadErrorClass) {
      return error
    }

    // 根据错误信息判断错误类型
    const errorMessage = error.message.toLowerCase()

    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return new DownloadErrorClass(
        DownloadErrorType.TIMEOUT_ERROR,
        error.message,
        t('downloadErrors.timeout_error'),
        ErrorSeverity.MEDIUM,
        true,
        context,
        error,
      )
    }

    if (
      errorMessage.includes('network')
      || errorMessage.includes('econnrefused')
      || errorMessage.includes('enotfound')
      || errorMessage.includes('econnreset')
    ) {
      return new DownloadErrorClass(
        DownloadErrorType.NETWORK_ERROR,
        error.message,
        t('downloadErrors.network_error'),
        ErrorSeverity.MEDIUM,
        true,
        context,
        error,
      )
    }

    if (errorMessage.includes('enospc') || errorMessage.includes('disk space')) {
      return new DownloadErrorClass(
        DownloadErrorType.DISK_SPACE_ERROR,
        error.message,
        t('downloadErrors.disk_space_error'),
        ErrorSeverity.HIGH,
        false,
        context,
        error,
      )
    }

    if (errorMessage.includes('eacces') || errorMessage.includes('permission')) {
      return new DownloadErrorClass(
        DownloadErrorType.PERMISSION_ERROR,
        error.message,
        t('downloadErrors.permission_error'),
        ErrorSeverity.HIGH,
        false,
        context,
        error,
      )
    }

    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return new DownloadErrorClass(
        DownloadErrorType.FILE_NOT_FOUND,
        error.message,
        t('downloadErrors.file_not_found'),
        ErrorSeverity.HIGH,
        false,
        context,
        error,
      )
    }

    if (errorMessage.includes('checksum') || errorMessage.includes('validation')) {
      return new DownloadErrorClass(
        DownloadErrorType.CHECKSUM_ERROR,
        error.message,
        t('downloadErrors.checksum_error'),
        ErrorSeverity.MEDIUM,
        true,
        context,
        error,
      )
    }

    if (errorMessage.includes('cancelled') || errorMessage.includes('aborted')) {
      return new DownloadErrorClass(
        DownloadErrorType.CANCELLED,
        error.message,
        t('downloadErrors.cancelled'),
        ErrorSeverity.LOW,
        false,
        context,
        error,
      )
    }

    // 默认未知错误
    return new DownloadErrorClass(
      DownloadErrorType.UNKNOWN_ERROR,
      error.message,
      t('downloadErrors.unknown_error'),
      ErrorSeverity.MEDIUM,
      true,
      context,
      error,
    )
  }

  /**
   * 创建网络错误
   */
  static networkError(message: string, context?: ErrorContext): DownloadErrorClass {
    return new DownloadErrorClass(
      DownloadErrorType.NETWORK_ERROR,
      message,
      t('downloadErrors.network_error'),
      ErrorSeverity.MEDIUM,
      true,
      context,
    )
  }

  /**
   * 创建超时错误
   */
  static timeoutError(message: string, context?: ErrorContext): DownloadErrorClass {
    return new DownloadErrorClass(
      DownloadErrorType.TIMEOUT_ERROR,
      message,
      t('downloadErrors.timeout_error'),
      ErrorSeverity.MEDIUM,
      true,
      context,
    )
  }

  /**
   * 创建磁盘空间错误
   */
  static diskSpaceError(message: string, context?: ErrorContext): DownloadErrorClass {
    return new DownloadErrorClass(
      DownloadErrorType.DISK_SPACE_ERROR,
      message,
      t('downloadErrors.disk_space_error'),
      ErrorSeverity.HIGH,
      false,
      context,
    )
  }

  /**
   * 创建权限错误
   */
  static permissionError(message: string, context?: ErrorContext): DownloadErrorClass {
    return new DownloadErrorClass(
      DownloadErrorType.PERMISSION_ERROR,
      message,
      t('downloadErrors.permission_error'),
      ErrorSeverity.HIGH,
      false,
      context,
    )
  }

  /**
   * 创建校验错误
   */
  static checksumError(message: string, context?: ErrorContext): DownloadErrorClass {
    return new DownloadErrorClass(
      DownloadErrorType.CHECKSUM_ERROR,
      message,
      t('downloadErrors.checksum_error'),
      ErrorSeverity.MEDIUM,
      true,
      context,
    )
  }
}
