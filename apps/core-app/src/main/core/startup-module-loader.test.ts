import { describe, expect, it, vi } from 'vitest'
import {
  loadStartupModules,
  resolveStartupModuleName,
  type StartupModuleLike
} from './startup-module-loader'

describe('startup-module-loader', () => {
  it('throws when required module fails to load', async () => {
    const modules: StartupModuleLike[] = [{ name: 'A' }, { name: 'B' }]
    const loadModule = vi
      .fn<(module: StartupModuleLike) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    await expect(
      loadStartupModules({
        modules,
        loadModule
      })
    ).rejects.toThrow('Required module failed to load: B')
  })

  it('allows optional module load failures', async () => {
    const optional = { name: 'Optional' }
    const required = { name: 'Required' }
    const modules = [optional, required]
    const onOptionalModuleLoadFailed = vi.fn()
    const loadModule = vi
      .fn<(module: StartupModuleLike) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const metrics = await loadStartupModules({
      modules,
      loadModule,
      optionalModules: new Set([optional]),
      onOptionalModuleLoadFailed
    })

    expect(metrics).toHaveLength(1)
    expect(metrics[0]?.name).toBe('Required')
    expect(onOptionalModuleLoadFailed).toHaveBeenCalledTimes(1)
  })

  it('supports skip predicate and load callback', async () => {
    const modules: StartupModuleLike[] = [{ name: 'skip-me' }, { name: 'load-me' }]
    const loadModule = vi.fn(async () => true)
    const onLoaded = vi.fn()
    let tick = 0

    const metrics = await loadStartupModules({
      modules,
      loadModule,
      shouldSkip: (module) => module.name === 'skip-me',
      onLoaded,
      now: () => ++tick
    })

    expect(loadModule).toHaveBeenCalledTimes(1)
    expect(metrics).toEqual([{ name: 'load-me', loadTime: 1, order: 1 }])
    expect(onLoaded).toHaveBeenCalledTimes(1)
  })

  it('resolves module names from symbol and fallback index', () => {
    expect(resolveStartupModuleName({ name: Symbol.for('mod') }, 0)).toContain('mod')
    expect(resolveStartupModuleName({}, 3)).toBe('Module3')
  })
})
