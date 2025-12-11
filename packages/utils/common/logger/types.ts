/**
 * Module Logger Types
 *
 * Unified logging system for Talex Touch modules.
 * Uses unified LogLevel from base.
 */

import {
  LogLevel,
  type LogLevelStringLower,
  logLevelToLowerString,
  stringToLogLevel as baseStringToLogLevel
} from '../../base/log-level'

// Re-export LogLevel for convenience
export { LogLevel }

/**
 * Log level string type (lowercase for config files)
 */
export type LogLevelString = LogLevelStringLower

/**
 * Convert LogLevel to lowercase string (for config)
 */
export function logLevelToString(level: LogLevel): LogLevelString {
  return logLevelToLowerString(level)
}

/**
 * Convert string to LogLevel
 */
export function stringToLogLevel(str: LogLevelString): LogLevel {
  return baseStringToLogLevel(str)
}

/**
 * Module logger options
 */
export interface ModuleLoggerOptions {
  /** Module name (unique identifier) */
  module: string
  /** Log color (chalk color name) */
  color?: string
  /** Initial enabled state */
  enabled?: boolean
  /** Minimum log level */
  level?: LogLevel
  /** Custom prefix */
  prefix?: string
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Global enabled switch */
  enabled: boolean
  /** Global log level */
  globalLevel: LogLevelString
  /** Per-module configuration */
  modules: Record<string, ModuleConfig>
}

/**
 * Per-module configuration
 */
export interface ModuleConfig {
  enabled: boolean
  level: LogLevelString
}

/**
 * Logger info for listing
 */
export interface LoggerInfo {
  module: string
  enabled: boolean
  level: LogLevel
  color: string
}

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: string
  module: string
  level: LogLevel
  message: string
  data?: unknown[]
}
