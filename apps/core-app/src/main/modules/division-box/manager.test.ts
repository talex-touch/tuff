import type {
  DivisionBoxConfig,
  DivisionBoxState,
  SessionMeta,
  StateChangeEvent
} from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pollingMocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  start: vi.fn()
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: () => pollingMocks
  }
}))

const { FakeDivisionBoxSession } = vi.hoisted(() => {
  class FakeDivisionBoxSession {
    readonly sessionId: string
    readonly config: DivisionBoxConfig
    readonly meta: SessionMeta
    private state = 'prepare' as DivisionBoxState
    private stateChangeListeners: Array<(event: StateChangeEvent) => void> = []

    constructor(sessionId: string, config: DivisionBoxConfig) {
      this.sessionId = sessionId
      this.config = config
      this.meta = {
        pluginId: config.pluginId,
        title: config.title,
        icon: config.icon,
        size: config.size || 'medium',
        keepAlive: Boolean(config.keepAlive),
        createdAt: Date.now(),
        lastAccessedAt: Date.now()
      }
    }

    onStateChange(listener: (event: StateChangeEvent) => void): void {
      this.stateChangeListeners.push(listener)
    }

    getState(): DivisionBoxState {
      return this.state
    }

    async createWindow(): Promise<void> {
      this.state = 'attach' as DivisionBoxState
    }

    async setState(newState: DivisionBoxState): Promise<void> {
      const oldState = this.state
      this.state = newState
      this.stateChangeListeners.forEach((listener) =>
        listener({
          sessionId: this.sessionId,
          oldState,
          newState,
          timestamp: Date.now()
        })
      )
    }

    async destroy(): Promise<void> {
      await this.setState('destroy' as DivisionBoxState)
    }
  }
  return { FakeDivisionBoxSession }
})

vi.mock('./session', () => ({
  DivisionBoxSession: FakeDivisionBoxSession
}))

vi.mock('./logger', () => ({
  divisionBoxManagerLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: vi.fn((name: string) =>
        name === 'demo-plugin' ? { name: 'demo-plugin' } : undefined
      )
    }
  }
}))

vi.mock('../plugin/runtime/plugin-injections', () => ({
  usePluginInjections: vi.fn(() => ({}))
}))

vi.mock('../plugin/runtime/plugin-view-security-profile', () => ({
  resolvePluginViewSecurityProfile: vi.fn(() => ({}))
}))

import { DivisionBoxManager } from './manager'

describe('DivisionBoxManager memory pressure polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Reflect.set(DivisionBoxManager, 'instance', null)
  })

  it('rejects attached UI without a plugin owner before creating a session', async () => {
    const manager = DivisionBoxManager.getInstance()

    await expect(
      manager.createSession({
        url: 'file:///tmp/plugin-view.html',
        title: 'Unowned View'
      })
    ).rejects.toMatchObject({ code: 'CONFIG_ERROR' })
    expect(pollingMocks.register).not.toHaveBeenCalled()
  })

  it('registers memory polling only while sessions exist', async () => {
    const manager = DivisionBoxManager.getInstance()

    expect(pollingMocks.register).not.toHaveBeenCalled()

    const session = await manager.createSession({
      url: 'tuff://detached',
      title: 'Detached Widget',
      keepAlive: false
    })

    expect(pollingMocks.register).toHaveBeenCalledTimes(1)
    expect(pollingMocks.register).toHaveBeenCalledWith(
      'division-box.memory-pressure',
      expect.any(Function),
      { interval: 30, unit: 'seconds' }
    )
    expect(pollingMocks.start).toHaveBeenCalledTimes(1)

    await manager.destroySession(session.sessionId)

    expect(pollingMocks.unregister).toHaveBeenCalledWith('division-box.memory-pressure')
  })

  it('destroys the session when attachUIView throws during createSession', async () => {
    const destroySpy = vi.spyOn(FakeDivisionBoxSession.prototype, 'destroy')
    const attachError = new Error('attach boom')
    Object.assign(FakeDivisionBoxSession.prototype, {
      attachUIView: vi.fn(async () => {
        throw attachError
      })
    })

    const manager = DivisionBoxManager.getInstance()

    await expect(
      manager.createSession({
        url: 'plugin://demo-plugin/index.html',
        title: 'Broken Attach',
        pluginId: 'demo-plugin'
      })
    ).rejects.toThrow('attach boom')

    expect(destroySpy).toHaveBeenCalledTimes(1)
    expect(manager.getActiveSessions()).toHaveLength(0)

    destroySpy.mockRestore()
    delete (FakeDivisionBoxSession.prototype as unknown as Record<string, unknown>).attachUIView
  })
})
