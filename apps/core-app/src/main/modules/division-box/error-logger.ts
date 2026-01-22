/**
 * ErrorLogger - DivisionBox Error Logging System
 *
 * Provides structured error logging with categorization, timestamps, and metadata.
 * Integrates with the main application logger system.
 */

import type { DivisionBoxError, DivisionBoxErrorCode } from '@talex-touch/utils'
import { createLogger } from '../../utils/logger'
import type { Primitive } from '../../utils/logger'

/**
 * Error log entry structure
 */
export interface ErrorLogEntry {
  /** Error code */
  code: DivisionBoxErrorCode

  /** Error message */
  message: string

  /** Associated session ID (if applicable) */
  sessionId?: string

  /** Timestamp when error occurred */
  timestamp: number

  /** Stack trace (if available) */
  stack?: string

  /** Additional metadata */
  meta?: Record<string, unknown>
}

/**
 * ErrorLogger class for DivisionBox system
 *
 * Provides centralized error logging with categorization and structured output.
 * Uses the application's logger system for consistent formatting.
 */
export class ErrorLogger {
  /** Logger instance for DivisionBox errors */
  private logger = createLogger('DivisionBox:Error')

  /** In-memory error history (limited to last 100 errors) */
  private errorHistory: ErrorLogEntry[] = []

  /** Maximum number of errors to keep in history */
  private readonly MAX_HISTORY_SIZE = 100

  /**
   * Logs a DivisionBoxError
   *
   * @param error - The error to log
   * @param meta - Additional metadata to include in the log
   */
  logError(error: DivisionBoxError, meta?: Record<string, unknown>): void {
    const entry: ErrorLogEntry = {
      code: error.code,
      message: error.message,
      sessionId: error.sessionId,
      timestamp: error.timestamp,
      stack: error.stack,
      meta
    }

    // Add to history
    this.addToHistory(entry)

    // Log to console with appropriate level
    const logMessage = this.formatErrorMessage(entry)

    this.logger.error(logMessage, {
      meta: {
        code: error.code,
        sessionId: error.sessionId || 'N/A',
        ...(normalizeMeta(meta) || {})
      },
      error: error.stack ? error : undefined
    })
  }

  /**
   * Logs a generic error (not a DivisionBoxError)
   *
   * @param code - Error code to categorize the error
   * @param message - Error message
   * @param sessionId - Optional session ID
   * @param originalError - Original error object (for stack trace)
   * @param meta - Additional metadata
   */
  logGenericError(
    code: DivisionBoxErrorCode,
    message: string,
    sessionId?: string,
    originalError?: Error,
    meta?: Record<string, unknown>
  ): void {
    const entry: ErrorLogEntry = {
      code,
      message,
      sessionId,
      timestamp: Date.now(),
      stack: originalError?.stack,
      meta
    }

    // Add to history
    this.addToHistory(entry)

    // Log to console
    const logMessage = this.formatErrorMessage(entry)

    this.logger.error(logMessage, {
      meta: {
        code,
        sessionId: sessionId || 'N/A',
        ...(meta || {})
      },
      error: originalError
    })
  }

  /**
   * Logs a warning (non-critical error)
   *
   * @param message - Warning message
   * @param meta - Additional metadata
   */
  logWarning(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, { meta: normalizeMeta(meta) })
  }

  /**
   * Logs an info message
   *
   * @param message - Info message
   * @param meta - Additional metadata
   */
  logInfo(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, { meta: normalizeMeta(meta) })
  }

  /**
   * Logs a debug message
   *
   * @param message - Debug message
   * @param meta - Additional metadata
   */
  logDebug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, { meta: normalizeMeta(meta) })
  }

  /**
   * Formats an error message for logging
   *
   * @param entry - Error log entry
   * @returns Formatted error message
   */
  private formatErrorMessage(entry: ErrorLogEntry): string {
    const parts = [entry.message]

    if (entry.sessionId) {
      parts.push(`[Session: ${entry.sessionId}]`)
    }

    return parts.join(' ')
  }

  /**
   * Adds an error entry to the history
   *
   * Maintains a circular buffer of the last MAX_HISTORY_SIZE errors.
   *
   * @param entry - Error log entry to add
   */
  private addToHistory(entry: ErrorLogEntry): void {
    this.errorHistory.push(entry)

    // Trim history if it exceeds max size
    if (this.errorHistory.length > this.MAX_HISTORY_SIZE) {
      this.errorHistory.shift()
    }
  }

  /**
   * Gets the error history
   *
   * @param limit - Maximum number of entries to return (default: all)
   * @returns Array of error log entries
   */
  getErrorHistory(limit?: number): ErrorLogEntry[] {
    if (limit && limit > 0) {
      return this.errorHistory.slice(-limit)
    }
    return [...this.errorHistory]
  }

  /**
   * Gets errors for a specific session
   *
   * @param sessionId - Session ID to filter by
   * @returns Array of error log entries for the session
   */
  getSessionErrors(sessionId: string): ErrorLogEntry[] {
    return this.errorHistory.filter((entry) => entry.sessionId === sessionId)
  }

  /**
   * Gets errors by error code
   *
   * @param code - Error code to filter by
   * @returns Array of error log entries with the specified code
   */
  getErrorsByCode(code: DivisionBoxErrorCode): ErrorLogEntry[] {
    return this.errorHistory.filter((entry) => entry.code === code)
  }

  /**
   * Clears the error history
   */
  clearHistory(): void {
    this.errorHistory = []
    this.logger.info('Error history cleared')
  }

  /**
   * Gets error statistics
   *
   * @returns Object containing error statistics
   */
  getErrorStats(): {
    total: number
    byCode: Record<string, number>
    bySessions: Record<string, number>
  } {
    const stats = {
      total: this.errorHistory.length,
      byCode: {} as Record<string, number>,
      bySessions: {} as Record<string, number>
    }

    for (const entry of this.errorHistory) {
      // Count by code
      stats.byCode[entry.code] = (stats.byCode[entry.code] || 0) + 1

      // Count by session
      if (entry.sessionId) {
        stats.bySessions[entry.sessionId] = (stats.bySessions[entry.sessionId] || 0) + 1
      }
    }

    return stats
  }
}

function normalizeMeta(meta?: Record<string, unknown>): Record<string, Primitive> | undefined {
  if (!meta) return undefined
  const normalized: Record<string, Primitive> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      normalized[key] = value
    } else {
      normalized[key] = JSON.stringify(value)
    }
  }
  return normalized
}

/**
 * Singleton instance of ErrorLogger
 */
export const errorLogger = new ErrorLogger()
