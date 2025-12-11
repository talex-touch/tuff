/**
 * TuffTransport Logger
 *
 * Specialized logger for TuffTransport system with green branding.
 * Used for IPC communication, events, and transport-related operations.
 */

import { LogLevel } from './types'

/**
 * ANSI color codes
 */
const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  bgGreen: '\x1b[42m',
  white: '\x1b[37m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
}

/**
 * TuffTransport Logger
 *
 * Outputs with distinctive green branding:
 * [TuffTransport] [module] message
 */
export class TuffTransportLogger {
  private readonly module: string
  private readonly subModule?: string
  private enabled: boolean
  private level: LogLevel

  constructor(
    module: string,
    options?: { subModule?: string; enabled?: boolean; level?: LogLevel }
  ) {
    this.module = module
    this.subModule = options?.subModule
    this.enabled = options?.enabled ?? true
    this.level = options?.level ?? LogLevel.INFO
  }

  /**
   * Check if logger is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Set enabled state
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Get log level
   */
  getLevel(): LogLevel {
    return this.level
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
    this.log(LogLevel.DEBUG, message, args)
  }

  /**
   * Log info message
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, args)
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, args)
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, args)
  }

  /**
   * Log event dispatch
   */
  event(eventName: string, direction: 'send' | 'receive', data?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return

    const arrow = direction === 'send' ? '→' : '←'
    const dirLabel = direction === 'send' ? 'SEND' : 'RECV'
    const prefix = this.buildPrefix()

    console.debug(
      `${prefix} ${COLORS.cyan}${arrow} ${dirLabel}${COLORS.reset} ${eventName}`,
      data !== undefined ? data : ''
    )
  }

  /**
   * Log IPC invoke
   */
  invoke(channel: string, payload?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return

    const prefix = this.buildPrefix()
    console.debug(`${prefix} ${COLORS.cyan}⚡ INVOKE${COLORS.reset} ${channel}`, payload ?? '')
  }

  /**
   * Log IPC response
   */
  response(channel: string, result?: unknown, error?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return

    const prefix = this.buildPrefix()
    if (error) {
      console.debug(`${prefix} ${COLORS.red}✗ RESPONSE${COLORS.reset} ${channel}`, error)
    } else {
      console.debug(`${prefix} ${COLORS.green}✓ RESPONSE${COLORS.reset} ${channel}`, result ?? '')
    }
  }

  /**
   * Create child logger with sub-module
   */
  child(subModule: string): TuffTransportLogger {
    return new TuffTransportLogger(this.module, {
      subModule: this.subModule ? `${this.subModule}:${subModule}` : subModule,
      enabled: this.enabled,
      level: this.level
    })
  }

  /**
   * Check if should log
   */
  private shouldLog(level: LogLevel): boolean {
    return this.enabled && level >= this.level
  }

  /**
   * Build log prefix
   */
  private buildPrefix(): string {
    const brand = `${COLORS.bgGreen}${COLORS.white}${COLORS.bold} TuffTransport ${COLORS.reset}`
    const moduleLabel = this.subModule
      ? `${COLORS.green}[${this.module}:${this.subModule}]${COLORS.reset}`
      : `${COLORS.green}[${this.module}]${COLORS.reset}`

    return `${brand} ${moduleLabel}`
  }

  /**
   * Core log method
   */
  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.shouldLog(level)) return

    const prefix = this.buildPrefix()
    const levelColors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: COLORS.gray,
      [LogLevel.INFO]: COLORS.green,
      [LogLevel.WARN]: COLORS.yellow,
      [LogLevel.ERROR]: COLORS.red,
      [LogLevel.NONE]: ''
    }
    const color = levelColors[level] ?? ''

    const output = `${prefix} ${color}${message}${COLORS.reset}`

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
}

/**
 * Create TuffTransport logger for a module
 */
export function createTransportLogger(
  module: string,
  options?: { subModule?: string; enabled?: boolean; level?: LogLevel }
): TuffTransportLogger {
  return new TuffTransportLogger(module, options)
}

/**
 * Default transport loggers for common modules
 */
export const transportLoggers = {
  flowBus: new TuffTransportLogger('FlowBus'),
  coreBox: new TuffTransportLogger('CoreBox'),
  plugin: new TuffTransportLogger('Plugin'),
  storage: new TuffTransportLogger('Storage'),
  divisionBox: new TuffTransportLogger('DivisionBox')
}
