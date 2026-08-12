/**
 * Module Logger Types
 *
 * Unified logging system for Talex Touch modules.
 * Uses unified LogLevel from base.
 */

import type { LogLevelStringLower } from '../../base/log-level'
import {
  stringToLogLevel as baseStringToLogLevel,
  LogLevel,

  logLevelToLowerString,
} from '../../base/log-level'

// Re-export LogLevel for convenience
export { LogLevel }

/**
 * Lowercase log level strings, the form written to config files.
 *
 * Exported under the base name rather than as a local `LogLevelString` alias. `base/log-level.ts`
 * already exports `LogLevelString` for the UPPERCASE variant, and this module is reachable as its
 * own import path, so an alias here would make one name mean two casings depending on which
 * subpath a caller picked — which is how 'debug' and 'DEBUG' reach the same config field.
 */
export type { LogLevelStringLower }

/**
 * Convert LogLevel to a lowercase config string.
 *
 * Re-exported from base under its own name, for the same reason as the type above: the uppercase
 * converter is called `logLevelToString`, so the lowercase one must not be.
 */
export { logLevelToLowerString }

/**
 * Convert a lowercase config string to LogLevel.
 */
export function stringToLogLevel(str: LogLevelStringLower): LogLevel {
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
  globalLevel: LogLevelStringLower
  /** Per-module configuration */
  modules: Record<string, ModuleConfig>
}

/**
 * Per-module configuration
 */
export interface ModuleConfig {
  enabled: boolean
  level: LogLevelStringLower
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
