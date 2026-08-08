import { beforeEach, describe, expect, it } from 'vitest'
import { LoggerManager, loggerManager } from '../common/logger/logger-manager'
import { LogLevel } from '../common/logger/types'

/**
 * `DEFAULT_CONFIG.modules` is one shared object and `setModuleConfig` writes into
 * `this.config.modules`. A shallow `{ ...DEFAULT_CONFIG }` aliased it, so a module override
 * leaked into the defaults and `reset()` restored the polluted copy — there was no way back to
 * a clean state (#881).
 *
 * These assert observable behaviour (reset actually resets) rather than the shape of the copy,
 * so they stay valid if the cloning strategy changes.
 */

describe('LoggerManager default config isolation', () => {
  beforeEach(() => {
    loggerManager.reset()
  })

  it('reset() clears a module override instead of restoring a polluted default', () => {
    loggerManager.setModuleConfig('database', false, LogLevel.ERROR)
    expect(loggerManager.getConfig().modules.database).toBeDefined()

    loggerManager.reset()

    expect(loggerManager.getConfig().modules).toEqual({})
  })

  // A `vi.resetModules()` + re-import case was written here and dropped: it re-evaluates
  // DEFAULT_CONFIG along with the singleton, so it passed against the unfixed source too. The
  // pollution is only observable within one module instance, which is what the cases here do.

  it('reset() still restores the non-module defaults', () => {
    loggerManager.disableAll()
    loggerManager.setGlobalLevel(LogLevel.ERROR)

    loggerManager.reset()

    const config = loggerManager.getConfig()
    expect(config.enabled).toBe(true)
    expect(config.globalLevel).toBe('debug')
  })

  it('a loaded config without a modules key does not adopt the shared default object', async () => {
    const manager = LoggerManager.getInstance()
    // The persisted shape is partial in practice; before the fix this branch spread
    // DEFAULT_CONFIG and left modules aliasing the shared object.
    manager.setConfigLoader(async () => ({ enabled: true, globalLevel: 'info' }) as any)

    await manager.loadConfig()
    manager.setModuleConfig('clipboard', false, LogLevel.ERROR)
    manager.reset()

    expect(manager.getConfig().modules).toEqual({})
  })

  it('a loaded config keeps its own modules without being mutated later', async () => {
    const manager = LoggerManager.getInstance()
    const persisted = { enabled: true, globalLevel: 'info', modules: { tray: { enabled: false, level: 'warn' } } }
    manager.setConfigLoader(async () => persisted as any)

    await manager.loadConfig()
    manager.setModuleConfig('terminal', false, LogLevel.ERROR)

    // The caller's object must not grow entries the manager added afterwards.
    expect(Object.keys(persisted.modules)).toEqual(['tray'])
  })
})
