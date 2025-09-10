import { LogLevel, LogItem, LogDataType } from './types'
import { PluginLoggerManager } from './logger-manager'
import chalk from 'chalk'

/**
 * PluginLogger provides structured logging capabilities for individual plugins.
 */
export class PluginLogger {
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
    const log: LogItem = {
      timestamp: new Date().toISOString(),
      level,
      plugin: this.pluginName,
      message: String(message),
      tags: [],
      data,
    }
    this.manager.append(log)

    const levelColor = {
      INFO: chalk.bgBlue,
      WARN: chalk.bgYellow,
      ERROR: chalk.bgRed,
      DEBUG: chalk.bgGray,
    }[level]

    if (level === 'DEBUG') {
      console.debug(
        `${chalk.bgMagenta('[PluginLog]')} ${levelColor(level)} ${this.pluginName} - ${message}`,
        ...data
      )
    } else {
      console.log(
        `${chalk.bgMagenta('[PluginLog]')} ${levelColor(level)} ${this.pluginName} - ${message}`,
        ...data
      )
    }

  }
}
