/**
 * Module Logger System
 *
 * Unified logging system for Talex Touch modules.
 *
 * @example
 * ```typescript
 * import { getLogger, LogLevel } from '@talex-touch/utils/common/logger'
 *
 * const logger = getLogger('my-module', { color: 'blue' })
 *
 * logger.debug('Debug message', { data: 123 })
 * logger.info('Info message')
 * logger.warn('Warning message')
 * logger.error('Error message', error)
 *
 * // Timing
 * logger.time('operation')
 * await someOperation()
 * logger.timeEnd('operation')
 *
 * // Grouping
 * logger.group('Session')
 * logger.info('Session ID:', sessionId)
 * logger.groupEnd()
 * ```
 */

export { ModuleLogger } from './module-logger'
export { LoggerManager, loggerManager, getLogger } from './logger-manager'
export {
  TuffTransportLogger,
  createTransportLogger,
  transportLoggers
} from './transport-logger'
export {
  LogLevel,
  type LogLevelString,
  type ModuleLoggerOptions,
  type LoggingConfig,
  type ModuleConfig,
  type LoggerInfo,
  type LogEntry,
  logLevelToString,
  stringToLogLevel
} from './types'
