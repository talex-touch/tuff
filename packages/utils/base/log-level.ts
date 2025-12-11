/**
 * Unified Log Level Definition
 *
 * Single source of truth for log levels across the entire application.
 * Used by both module logger and plugin logger systems.
 */

/**
 * Log level enumeration with numeric values for comparison
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

/**
 * Log level string type (uppercase)
 */
export type LogLevelString = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'NONE'

/**
 * Log level string type (lowercase)
 */
export type LogLevelStringLower = 'debug' | 'info' | 'warn' | 'error' | 'none'

/**
 * Convert LogLevel enum to uppercase string
 */
export function logLevelToString(level: LogLevel): LogLevelString {
  switch (level) {
    case LogLevel.DEBUG:
      return 'DEBUG'
    case LogLevel.INFO:
      return 'INFO'
    case LogLevel.WARN:
      return 'WARN'
    case LogLevel.ERROR:
      return 'ERROR'
    case LogLevel.NONE:
      return 'NONE'
    default:
      return 'INFO'
  }
}

/**
 * Convert LogLevel enum to lowercase string
 */
export function logLevelToLowerString(level: LogLevel): LogLevelStringLower {
  return logLevelToString(level).toLowerCase() as LogLevelStringLower
}

/**
 * Convert string to LogLevel enum
 */
export function stringToLogLevel(str: string): LogLevel {
  const upper = str.toUpperCase()
  switch (upper) {
    case 'DEBUG':
      return LogLevel.DEBUG
    case 'INFO':
      return LogLevel.INFO
    case 'WARN':
    case 'WARNING':
      return LogLevel.WARN
    case 'ERROR':
      return LogLevel.ERROR
    case 'NONE':
    case 'OFF':
      return LogLevel.NONE
    default:
      return LogLevel.INFO
  }
}

/**
 * Check if a level should be logged given a minimum level
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return level >= minLevel
}

/**
 * Get all log levels as array (excluding NONE)
 */
export function getLogLevels(): LogLevel[] {
  return [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
}

/**
 * Get log level display name
 */
export function getLogLevelName(level: LogLevel): string {
  const names: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'Debug',
    [LogLevel.INFO]: 'Info',
    [LogLevel.WARN]: 'Warning',
    [LogLevel.ERROR]: 'Error',
    [LogLevel.NONE]: 'None'
  }
  return names[level] ?? 'Unknown'
}
