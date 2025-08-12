/**
 * Defines supported logging levels.
 */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

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
  /** Logging severity level */
  level: LogLevel
  /** Plugin name */
  plugin: string
  /** Main log message */
  message: string
  /** Optional log tags for filtering and UI grouping */
  tags: string[]
  /** Additional log data (parameters, configs, responses) */
  data: LogDataType[]
}
