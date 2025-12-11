/**
 * LoggerManager
 *
 * Singleton manager for all module loggers.
 * Handles configuration, global controls, and logger lifecycle.
 */

import { ModuleLogger } from './module-logger'
import {
  LogLevel,
  type LoggingConfig,
  type LoggerInfo,
  type ModuleLoggerOptions,
  stringToLogLevel,
  logLevelToString
} from './types'

/**
 * Default logging configuration
 */
const DEFAULT_CONFIG: LoggingConfig = {
  enabled: true,
  globalLevel: 'debug',
  modules: {}
}

/**
 * Predefined module defaults
 */
const MODULE_DEFAULTS: Record<string, { enabled: boolean; level: LogLevel; color: string }> = {
  'search-engine': { enabled: true, level: LogLevel.DEBUG, color: 'cyan' },
  'file-provider': { enabled: false, level: LogLevel.DEBUG, color: 'green' },
  'app-provider': { enabled: false, level: LogLevel.DEBUG, color: 'blue' },
  'plugin-system': { enabled: true, level: LogLevel.INFO, color: 'magenta' },
  database: { enabled: false, level: LogLevel.WARN, color: 'yellow' },
  storage: { enabled: false, level: LogLevel.WARN, color: 'yellow' },
  clipboard: { enabled: false, level: LogLevel.INFO, color: 'cyan' },
  'flow-bus': { enabled: true, level: LogLevel.INFO, color: 'green' },
  'division-box': { enabled: true, level: LogLevel.INFO, color: 'blue' },
  'core-box': { enabled: true, level: LogLevel.INFO, color: 'cyan' },
  tray: { enabled: false, level: LogLevel.INFO, color: 'gray' },
  download: { enabled: true, level: LogLevel.INFO, color: 'green' },
  intelligence: { enabled: true, level: LogLevel.INFO, color: 'magenta' },
  terminal: { enabled: false, level: LogLevel.DEBUG, color: 'gray' },
  update: { enabled: true, level: LogLevel.INFO, color: 'blue' },
  widget: { enabled: true, level: LogLevel.DEBUG, color: 'cyan' }
}

/**
 * LoggerManager singleton
 *
 * Manages all module loggers with:
 * - Centralized configuration
 * - Global enable/disable
 * - Per-module level control
 * - Configuration persistence
 */
export class LoggerManager {
  private static instance: LoggerManager | null = null
  private loggers: Map<string, ModuleLogger> = new Map()
  private config: LoggingConfig = { ...DEFAULT_CONFIG }
  private configLoader: (() => Promise<LoggingConfig | null>) | null = null
  private configSaver: ((config: LoggingConfig) => Promise<void>) | null = null

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): LoggerManager {
    if (!LoggerManager.instance) {
      LoggerManager.instance = new LoggerManager()
    }
    return LoggerManager.instance
  }

  /**
   * Get or create a logger for a module
   */
  getLogger(module: string, options?: Partial<ModuleLoggerOptions>): ModuleLogger {
    let logger = this.loggers.get(module)

    if (!logger) {
      // Get module defaults
      const defaults = MODULE_DEFAULTS[module]
      const moduleConfig = this.config.modules[module]

      // Determine enabled state
      let enabled = this.config.enabled
      if (moduleConfig?.enabled !== undefined) {
        enabled = enabled && moduleConfig.enabled
      } else if (defaults?.enabled !== undefined) {
        enabled = enabled && defaults.enabled
      }
      if (options?.enabled !== undefined) {
        enabled = enabled && options.enabled
      }

      // Determine log level
      let level = stringToLogLevel(this.config.globalLevel)
      if (moduleConfig?.level) {
        level = Math.max(level, stringToLogLevel(moduleConfig.level))
      } else if (defaults?.level !== undefined) {
        level = Math.max(level, defaults.level)
      }
      if (options?.level !== undefined) {
        level = options.level
      }

      // Determine color
      const color = options?.color ?? defaults?.color ?? 'cyan'

      logger = new ModuleLogger({
        module,
        color,
        enabled,
        level,
        prefix: options?.prefix
      })

      this.loggers.set(module, logger)
    }

    return logger
  }

  /**
   * Enable all loggers
   */
  enableAll(): void {
    this.config.enabled = true
    for (const logger of this.loggers.values()) {
      logger.setEnabled(true)
    }
  }

  /**
   * Disable all loggers
   */
  disableAll(): void {
    this.config.enabled = false
    for (const logger of this.loggers.values()) {
      logger.setEnabled(false)
    }
  }

  /**
   * Set global log level
   */
  setGlobalLevel(level: LogLevel): void {
    this.config.globalLevel = logLevelToString(level)
    for (const logger of this.loggers.values()) {
      if (logger.getLevel() < level) {
        logger.setLevel(level)
      }
    }
  }

  /**
   * Set module-specific configuration
   */
  setModuleConfig(module: string, enabled: boolean, level: LogLevel): void {
    this.config.modules[module] = {
      enabled,
      level: logLevelToString(level)
    }

    const logger = this.loggers.get(module)
    if (logger) {
      logger.setEnabled(this.config.enabled && enabled)
      logger.setLevel(level)
    }
  }

  /**
   * List all registered loggers
   */
  listLoggers(): LoggerInfo[] {
    return Array.from(this.loggers.entries()).map(([module, logger]) => ({
      module,
      enabled: logger.isEnabled(),
      level: logger.getLevel(),
      color: logger.getColor()
    }))
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggingConfig {
    return { ...this.config }
  }

  /**
   * Set configuration
   */
  setConfig(config: Partial<LoggingConfig>): void {
    this.config = { ...this.config, ...config }
    this.applyConfig()
  }

  /**
   * Set config loader function
   */
  setConfigLoader(loader: () => Promise<LoggingConfig | null>): void {
    this.configLoader = loader
  }

  /**
   * Set config saver function
   */
  setConfigSaver(saver: (config: LoggingConfig) => Promise<void>): void {
    this.configSaver = saver
  }

  /**
   * Load configuration from storage
   */
  async loadConfig(): Promise<void> {
    if (!this.configLoader) return

    try {
      const loaded = await this.configLoader()
      if (loaded) {
        this.config = { ...DEFAULT_CONFIG, ...loaded }
        this.applyConfig()
      }
    } catch (error) {
      console.error('[LoggerManager] Failed to load config:', error)
    }
  }

  /**
   * Save configuration to storage
   */
  async saveConfig(): Promise<void> {
    if (!this.configSaver) return

    try {
      await this.configSaver(this.config)
    } catch (error) {
      console.error('[LoggerManager] Failed to save config:', error)
    }
  }

  /**
   * Apply current configuration to all loggers
   */
  private applyConfig(): void {
    for (const [module, logger] of this.loggers) {
      const moduleConfig = this.config.modules[module]
      const defaults = MODULE_DEFAULTS[module]

      // Determine enabled state
      let enabled = this.config.enabled
      if (moduleConfig?.enabled !== undefined) {
        enabled = enabled && moduleConfig.enabled
      } else if (defaults?.enabled !== undefined) {
        enabled = enabled && defaults.enabled
      }

      // Determine log level
      let level = stringToLogLevel(this.config.globalLevel)
      if (moduleConfig?.level) {
        level = Math.max(level, stringToLogLevel(moduleConfig.level))
      } else if (defaults?.level !== undefined) {
        level = Math.max(level, defaults.level)
      }

      logger.setEnabled(enabled)
      logger.setLevel(level)
    }
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG }
    this.applyConfig()
  }
}

/**
 * Singleton instance
 */
export const loggerManager = LoggerManager.getInstance()

/**
 * Shorthand for getting a logger
 */
export function getLogger(module: string, options?: Partial<ModuleLoggerOptions>): ModuleLogger {
  return loggerManager.getLogger(module, options)
}
