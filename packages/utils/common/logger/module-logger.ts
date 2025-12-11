/**
 * ModuleLogger
 *
 * Provides structured, configurable logging for individual modules.
 * Supports log levels, timing, grouping, and zero-overhead when disabled.
 */

import { LogLevel, type ModuleLoggerOptions } from './types'

/**
 * ANSI color codes for terminal output
 */
const COLORS: Record<string, string> = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bold: '\x1b[1m'
}

/**
 * Level color mapping
 */
const LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'gray',
  [LogLevel.INFO]: 'blue',
  [LogLevel.WARN]: 'yellow',
  [LogLevel.ERROR]: 'red',
  [LogLevel.NONE]: 'white'
}

/**
 * Level labels
 */
const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO ',
  [LogLevel.WARN]: 'WARN ',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: 'NONE '
}

/**
 * ModuleLogger class
 *
 * Provides logging capabilities with:
 * - Log levels (debug, info, warn, error)
 * - Enable/disable per module
 * - Timing functions
 * - Grouping support
 * - Zero overhead when disabled
 */
export class ModuleLogger {
  private readonly module: string
  private readonly color: string
  private readonly prefix: string
  private enabled: boolean
  private level: LogLevel
  private timers: Map<string, number> = new Map()
  private groupDepth = 0

  constructor(options: ModuleLoggerOptions) {
    this.module = options.module
    this.color = options.color ?? 'cyan'
    this.prefix = options.prefix ?? ''
    this.enabled = options.enabled ?? true
    this.level = options.level ?? LogLevel.DEBUG
  }

  /**
   * Check if logger is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level
  }

  /**
   * Get module name
   */
  getModule(): string {
    return this.module
  }

  /**
   * Get color
   */
  getColor(): string {
    return this.color
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args)
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args)
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args)
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args)
  }

  /**
   * Start a timer
   */
  time(label: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    this.timers.set(label, performance.now())
  }

  /**
   * End a timer and log duration
   */
  timeEnd(label: string): number {
    if (!this.shouldLog(LogLevel.DEBUG)) return 0
    const start = this.timers.get(label)
    if (start === undefined) {
      this.warn(`Timer "${label}" does not exist`)
      return 0
    }
    this.timers.delete(label)
    const duration = performance.now() - start
    this.debug(`${label}: ${duration.toFixed(2)}ms`)
    return duration
  }

  /**
   * Start a log group
   */
  group(label: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    this.info(label)
    this.groupDepth++
  }

  /**
   * End a log group
   */
  groupEnd(): void {
    if (this.groupDepth > 0) {
      this.groupDepth--
    }
  }

  /**
   * Create a child logger with a sub-module prefix
   */
  child(subModule: string): ModuleLogger {
    return new ModuleLogger({
      module: `${this.module}:${subModule}`,
      color: this.color,
      enabled: this.enabled,
      level: this.level,
      prefix: this.prefix
    })
  }

  /**
   * Check if a level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return this.enabled && level >= this.level
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return

    const timestamp = this.formatTimestamp()
    const levelLabel = LEVEL_LABELS[level]
    const levelColor = COLORS[LEVEL_COLORS[level]] ?? ''
    const moduleColor = COLORS[this.color] ?? ''
    const reset = COLORS.reset

    // Build indent for groups
    const indent = '  '.repeat(this.groupDepth)

    // Format: [HH:MM:SS.mmm] [module] LEVEL message
    const formattedModule = `${moduleColor}[${this.module}]${reset}`
    const formattedLevel = `${levelColor}${levelLabel}${reset}`
    const formattedMessage = `${indent}${message}`

    const output = `${COLORS.gray}[${timestamp}]${reset} ${formattedModule} ${formattedLevel} ${formattedMessage}`

    // Use appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(output, ...args)
        break
      case LogLevel.INFO:
        console.info(output, ...args)
        break
      case LogLevel.WARN:
        console.warn(output, ...args)
        break
      case LogLevel.ERROR:
        console.error(output, ...args)
        break
      default:
        console.log(output, ...args)
    }
  }

  /**
   * Format timestamp as HH:MM:SS.mmm
   */
  private formatTimestamp(): string {
    const now = new Date()
    const hours = now.getHours().toString().padStart(2, '0')
    const minutes = now.getMinutes().toString().padStart(2, '0')
    const seconds = now.getSeconds().toString().padStart(2, '0')
    const ms = now.getMilliseconds().toString().padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
  }
}
