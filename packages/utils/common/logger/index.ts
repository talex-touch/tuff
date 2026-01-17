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

export { getLogger, LoggerManager, loggerManager } from './logger-manager'
export { ModuleLogger } from './module-logger'
export {
  createTransportLogger,
  transportLoggers,
  TuffTransportLogger,
} from './transport-logger'
export {
  type LogEntry,
  type LoggerInfo,
  type LoggingConfig,
  LogLevel,
  type LogLevelString,
  logLevelToString,
  type ModuleConfig,
  type ModuleLoggerOptions,
  stringToLogLevel,
} from './types'
