import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { TalexTouch } from '@talex-touch/utils'
import type { ModuleCreateContext, ModuleKey } from '@talex-touch/utils/types/modules'
import type { ITouchChannel } from 'packages/utils/channel'
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
  const channel = {} as ITouchChannel
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
})
