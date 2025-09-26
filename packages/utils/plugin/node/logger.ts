import { IPluginLogger, LogLevel, LogItem, LogDataType } from '../log/types'
import { PluginLoggerManager } from './logger-manager'
import chalk from 'chalk'

/**
 * PluginLogger provides structured logging capabilities for individual plugins.
 */
export class PluginLogger implements IPluginLogger<PluginLoggerManager> {
  private readonly pluginName: string
  private readonly manager: PluginLoggerManager

  /**
   * Get logger manager
   */
  getManager(): PluginLoggerManager { return this.manager }

  /**
   * Creates an instance of PluginLogger.
   * @param pluginName - The name of the plugin.
   * @param manager - The logger manager instance controlling log file storage.
   */
  constructor(pluginName: string, manager: PluginLoggerManager) {
    this.pluginName = pluginName
    this.manager = manager
  }

  /**
   * Logs an info-level message.
   * @param args - The log message and optional data payload.
   */
  info(...args: LogDataType[]): void {
    this.log('INFO', ...args)
  }

  /**
   * Logs a warning-level message.
   * @param args - The log message and optional data payload.
   */
  warn(...args: LogDataType[]): void {
    this.log('WARN', ...args)
  }

  /**
   * Logs an error-level message.
   * @param args - The log message and optional data payload.
   */
  error(...args: LogDataType[]): void {
    this.log('ERROR', ...args)
  }

  /**
   * Logs a debug-level message.
   * @param args - The log message and optional data payload.
   */
  debug(...args: LogDataType[]): void {
    this.log('DEBUG', ...args)
  }

  /**
   * Constructs a log entry and forwards it to the manager.
   * @param level - The severity level of the log.
   * @param args - The log message and optional data payload.
   */
  private log(level: LogLevel, ...args: LogDataType[]): void {
    const [message, ...data] = args

    const normalizedLevel = (typeof level === 'string' ? level.toUpperCase() : level) as string
    const allowedLevels: LogLevel[] = ['INFO', 'WARN', 'ERROR', 'DEBUG']
    const resolvedLevel = (allowedLevels.includes(normalizedLevel as LogLevel)
      ? (normalizedLevel as LogLevel)
      : 'INFO')
    if (resolvedLevel === 'INFO' && normalizedLevel !== 'INFO') {
      console.warn(
        `${chalk.bgMagenta('[PluginLog]')} ${chalk.bgYellow('WARN')} ${this.pluginName} - Unknown log level "${String(level)}", fallback to INFO`
      )
    }

    const levelColorMap: Record<LogLevel, (input: string) => string> = {
      INFO: chalk.bgBlue,
      WARN: chalk.bgYellow,
      ERROR: chalk.bgRed,
      DEBUG: chalk.bgGray
    }
    const colorize = levelColorMap[resolvedLevel] ?? ((input: string) => input)

    const log: LogItem = {
      timestamp: new Date().toISOString(),
      level: resolvedLevel,
      plugin: this.pluginName,
      message: String(message),
      tags: [],
      data,
    }
    this.manager.append(log)

    if (resolvedLevel === 'DEBUG') {
      console.debug(
        `${chalk.bgMagenta('[PluginLog]')} ${colorize(resolvedLevel)} ${this.pluginName} - ${message}`,
        ...data
      )
    } else {
      console.log(
        `${chalk.bgMagenta('[PluginLog]')} ${colorize(resolvedLevel)} ${this.pluginName} - ${message}`,
        ...data
      )
    }

  }
}
