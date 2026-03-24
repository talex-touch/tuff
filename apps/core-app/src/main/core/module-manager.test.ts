import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { TalexTouch } from '@talex-touch/utils'
import type {
  ModuleCreateContext,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey,
  ModuleStopContext
} from '@talex-touch/utils/types/modules'
import type { TalexEvents } from './eventbus/touch-event'
import { ModuleManager } from './module-manager'
import { BaseModule } from '../modules/abstract-base-module'

vi.mock('../modules/sentry/sentry-service', () => ({
  getSentryService: () => ({
    isTelemetryEnabled: () => false,
    queueNexusTelemetry: vi.fn()
  })
}))

const createManager = () => {
  const modulesRoot = path.join(os.tmpdir(), `module-manager-test-${Date.now()}`)
  const app = { rootPath: modulesRoot } as TalexTouch.TouchApp
  const channel = {}
  return new ModuleManager(app, channel, { modulesRoot })
}

describe('ModuleManager lifecycle isolation', () => {
  it('rolls back on created failure', async () => {
    const manager = createManager()
    const calls: string[] = []
    const key = Symbol.for('test-module-created') as ModuleKey

    class CreatedThrowsModule extends BaseModule<TalexEvents> {
      static readonly key = key
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      created(): void {
        calls.push('created')
        throw new Error('boom-created')
      }
      onInit(): void {
        calls.push('init')
      }
      stop(): void {
        calls.push('stop')
      }
      onDestroy(): void {
        calls.push('destroy')
      }
    }

    const result = await manager.loadModule(CreatedThrowsModule)
    expect(result).toBe(false)
    expect(manager.hasModule(key)).toBe(false)
    expect(calls).toEqual(['created', 'destroy'])
  })

  it('rolls back on init failure', async () => {
    const manager = createManager()
    const calls: string[] = []
    const key = Symbol.for('test-module-init') as ModuleKey

    class InitThrowsModule extends BaseModule<TalexEvents> {
      static readonly key = key
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      created(): void {
        calls.push('created')
      }
      onInit(): void {
        calls.push('init')
        throw new Error('boom-init')
      }
      stop(): void {
        calls.push('stop')
      }
      onDestroy(): void {
        calls.push('destroy')
      }
    }

    const result = await manager.loadModule(InitThrowsModule)
    expect(result).toBe(false)
    expect(manager.hasModule(key)).toBe(false)
    expect(calls).toEqual(['created', 'init', 'destroy'])
  })

  it('rolls back on start failure', async () => {
    const manager = createManager()
    const calls: string[] = []
    const key = Symbol.for('test-module-start') as ModuleKey

    class StartThrowsModule extends BaseModule<TalexEvents> {
      static readonly key = key
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      created(): void {
        calls.push('created')
      }
      onInit(): void {
        calls.push('init')
      }
      start(): void {
        calls.push('start')
        throw new Error('boom-start')
      }
      stop(): void {
        calls.push('stop')
      }
      onDestroy(): void {
        calls.push('destroy')
      }
    }

    const result = await manager.loadModule(StartThrowsModule)
    expect(result).toBe(false)
    expect(manager.hasModule(key)).toBe(false)
    expect(calls).toEqual(['created', 'init', 'start', 'stop', 'destroy'])
  })

  it('awaits async onInit and onDestroy from BaseModule wrappers', async () => {
    const manager = createManager()
    const key = Symbol.for('test-module-async-wrapper') as ModuleKey
    const calls: string[] = []

    let resolveInit: (() => void) | null = null
    let resolveDestroy: (() => void) | null = null
    const initReady = new Promise<void>((resolve) => {
      resolveInit = resolve
    })
    const destroyReady = new Promise<void>((resolve) => {
      resolveDestroy = resolve
    })

    class AsyncLifecycleModule extends BaseModule<TalexEvents> {
      static readonly key = key
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }

      async onInit(): Promise<void> {
        calls.push('init:start')
        await initReady
        calls.push('init:end')
      }

      async onDestroy(): Promise<void> {
        calls.push('destroy:start')
        await destroyReady
        calls.push('destroy:end')
      }
    }

    let loadResolved = false
    const loadPromise = manager.loadModule(AsyncLifecycleModule).then((result) => {
      loadResolved = true
      return result
    })

    await Promise.resolve()
    expect(loadResolved).toBe(false)
    expect(calls).toEqual(['init:start'])

    expect(resolveInit).not.toBeNull()
    resolveInit!()
    await expect(loadPromise).resolves.toBe(true)
    expect(calls).toEqual(['init:start', 'init:end'])

    let unloadResolved = false
    const unloadPromise = Promise.resolve(manager.unloadModule(key)).then((result) => {
      unloadResolved = true
      return result
    })

    await Promise.resolve()
    expect(unloadResolved).toBe(false)
    expect(calls).toEqual(['init:start', 'init:end', 'destroy:start'])

    expect(resolveDestroy).not.toBeNull()
    resolveDestroy!()
    await expect(unloadPromise).resolves.toBe(true)
    expect(calls).toEqual(['init:start', 'init:end', 'destroy:start', 'destroy:end'])
  })

  it('unloads even when stop fails', async () => {
    const manager = createManager()
    const calls: string[] = []
    const key = Symbol.for('test-module-stop') as ModuleKey

    class StopThrowsModule extends BaseModule<TalexEvents> {
      static readonly key = key
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      onInit(): void {
        calls.push('init')
      }
      stop(): void {
        calls.push('stop')
        throw new Error('boom-stop')
      }
      onDestroy(): void {
        calls.push('destroy')
      }
    }

    const loaded = await manager.loadModule(StopThrowsModule)
    expect(loaded).toBe(true)
    const result = await manager.unloadModule(key)
    expect(result).toBe(false)
    expect(manager.hasModule(key)).toBe(false)
    expect(calls).toEqual(['init', 'stop', 'destroy'])
  })

  it('unloadAll is idempotent under concurrent calls', async () => {
    const manager = createManager()
    const calls: string[] = []

    class ModuleA extends BaseModule<TalexEvents> {
      static readonly key = Symbol.for('test-module-unload-all-a') as ModuleKey
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      onInit(): void {
        calls.push('a:init')
      }
      async onDestroy(): Promise<void> {
        calls.push('a:destroy')
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }

    class ModuleB extends BaseModule<TalexEvents> {
      static readonly key = Symbol.for('test-module-unload-all-b') as ModuleKey
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      onInit(): void {
        calls.push('b:init')
      }
      async onDestroy(): Promise<void> {
        calls.push('b:destroy')
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }

    expect(await manager.loadModule(ModuleA)).toBe(true)
    expect(await manager.loadModule(ModuleB)).toBe(true)

    const [first, second] = await Promise.all([
      manager.unloadAll('normal'),
      manager.unloadAll('normal')
    ])
    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(calls.filter((item) => item === 'a:destroy')).toHaveLength(1)
    expect(calls.filter((item) => item === 'b:destroy')).toHaveLength(1)
    expect(manager.listModules()).toHaveLength(0)
  })

  it('marks appClosing for app-quit unload reason', async () => {
    const manager = createManager()
    const key = Symbol.for('test-module-app-quit') as ModuleKey
    let stopReason: string | undefined
    let appClosing: boolean | undefined

    class AppQuitModule extends BaseModule<TalexEvents> {
      static readonly key = key
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      onInit(): void {}
      stop(ctx: ModuleStopContext<TalexEvents>): void {
        stopReason = String(ctx.reason)
      }
      onDestroy(ctx: ModuleDestroyContext<TalexEvents>): void {
        appClosing = ctx.appClosing
      }
    }

    expect(await manager.loadModule(AppQuitModule)).toBe(true)
    expect(await manager.unloadModule(key, 'app-quit')).toBe(true)
    expect(stopReason).toBe('app-quit')
    expect(appClosing).toBe(true)
  })

  it('injects runtime context and records unload observation', async () => {
    const manager = createManager()
    const key = Symbol.for('test-module-runtime-context') as ModuleKey
    let runtimeChannel: unknown
    let runtimeManager: unknown

    class RuntimeAwareModule extends BaseModule<TalexEvents> {
      static readonly key = key
      constructor(ctx: ModuleCreateContext<TalexEvents>) {
        super(ctx.moduleKey, { create: false })
      }
      onInit(ctx: ModuleInitContext<TalexEvents>): void {
        runtimeChannel = ctx.runtime?.channel
        runtimeManager = ctx.runtime?.moduleManager
      }
      onDestroy(): void {}
    }

    expect(await manager.loadModule(RuntimeAwareModule)).toBe(true)
    expect(runtimeChannel).toEqual({})
    expect(runtimeManager).toBeDefined()

    expect(await manager.unloadAll('normal')).toBe(true)
    expect(manager.getLastUnloadObservation()).toMatchObject({
      reason: 'normal',
      appClosing: false,
      totalModules: 1,
      unloadedModules: 1,
      failedModules: 0
    })
  })
})
