import { beforeEach, describe, expect, it } from 'vitest'
import { loggerManager } from '../common/logger/logger-manager'
import { LogLevel } from '../common/logger/types'

/**
 * LogLevel is ordered DEBUG=0 .. ERROR=3, so `Math.max(globalLevel, moduleLevel)` always picked
 * the more restrictive of the two. `setModuleConfig` applied the level directly, but the next
 * `applyConfig()` recomputed with Math.max and discarded it — turning one module up while the
 * global level stayed quiet was impossible, and the override vanished without a warning (#882).
 */

describe('LoggerManager per-module log level', () => {
  beforeEach(() => {
    loggerManager.reset()
  })

  it('lets a module be more verbose than the global level', () => {
    loggerManager.setGlobalLevel(LogLevel.WARN)
    const logger = loggerManager.getLogger('search-engine')

    loggerManager.setModuleConfig('search-engine', true, LogLevel.DEBUG)

    expect(logger.getLevel()).toBe(LogLevel.DEBUG)
  })

  it('keeps the verbose override across a later setConfig', () => {
    loggerManager.setGlobalLevel(LogLevel.WARN)
    const logger = loggerManager.getLogger('search-engine')
    loggerManager.setModuleConfig('search-engine', true, LogLevel.DEBUG)

    // The defect: this recomputed with Math.max(WARN, DEBUG) = WARN and silently reverted.
    loggerManager.setConfig({ enabled: true })

    expect(logger.getLevel()).toBe(LogLevel.DEBUG)
  })

  it('applies a verbose override to a logger created after the config', () => {
    loggerManager.setGlobalLevel(LogLevel.ERROR)
    loggerManager.setModuleConfig('file-provider', true, LogLevel.DEBUG)

    const logger = loggerManager.getLogger('file-provider')

    expect(logger.getLevel()).toBe(LogLevel.DEBUG)
  })

  it('still honours a module override that is more restrictive than global', () => {
    loggerManager.setGlobalLevel(LogLevel.DEBUG)
    const logger = loggerManager.getLogger('app-provider')

    loggerManager.setModuleConfig('app-provider', true, LogLevel.ERROR)
    loggerManager.setConfig({ enabled: true })

    expect(logger.getLevel()).toBe(LogLevel.ERROR)
  })

  it('leaves MODULE_DEFAULTS bounded by the global level', () => {
    // 'database' defaults to WARN. A quieter global must not be talked down by a default,
    // because defaults are not stated intent the way setModuleConfig is.
    loggerManager.setGlobalLevel(LogLevel.ERROR)

    const logger = loggerManager.getLogger('database')

    expect(logger.getLevel()).toBe(LogLevel.ERROR)
  })
})
