import type { LogLevelString as BaseLogLevelString } from '../../base/log-level'
/**
 * Re-export unified LogLevel from base
 */
import {
  LogLevel as BaseLogLevel,

  logLevelToString as baseLogLevelToString,
  stringToLogLevel as baseStringToLogLevel,
} from '../../base/log-level'

export const LogLevel = BaseLogLevel
export type LogLevelString = BaseLogLevelString
export const logLevelToString = baseLogLevelToString
export const stringToLogLevel = baseStringToLogLevel

/**
 * Legacy string-based log level type (for backward compatibility)
 * @deprecated Use LogLevel enum instead
 */
export type LogLevelLegacy = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

/**
 * Supported data types for logging arguments.
 */
export type LogDataType = string | number | boolean | object

/**
 * Represents a single log entry for a plugin.
 */
export interface LogItem {
  /** ISO timestamp when the log was created */
  timestamp: string
  /** Logging severity level (uppercase string for storage compatibility) */
  level: LogLevelString
  /** Plugin name */
  plugin: string
  /** Main log message */
  message: string
  /** Optional log tags for filtering and UI grouping */
  tags: string[]
  /** Additional log data (parameters, configs, responses) */
  data: LogDataType[]
}

/**
 * Minimal contract for plugin loggers
 */
export interface IPluginLogger<TManager = unknown> {
  info: (...args: LogDataType[]) => void
  warn: (...args: LogDataType[]) => void
  error: (...args: LogDataType[]) => void
  debug: (...args: LogDataType[]) => void
  getManager: () => TManager
}
