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

vi.mock('./session', () => ({
  DivisionBoxSession: FakeDivisionBoxSession
}))

describe('DivisionBoxManager memory pressure polling', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('registers memory polling only while sessions exist', async () => {
    const { DivisionBoxManager } = await import('./manager')
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
})
