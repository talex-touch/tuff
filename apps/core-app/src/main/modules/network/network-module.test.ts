import type { ModuleInitContext } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkEvents } from '@talex-touch/utils/transport/events'
import { NetworkModule } from './network-module'

const mocks = vi.hoisted(() => ({
  broadcast: vi.fn(),
  handlers: new Map<string, (payload?: unknown) => unknown>(),
  isOnline: vi.fn(() => true),
  off: vi.fn(),
  on: vi.fn(),
  service: {
    getStatus: vi.fn(),
    setOnlineStatus: vi.fn()
  },
  status: null as { changedAt: number; online: boolean; reason: string } | null,
  transportOn: vi.fn((event, handler) => {
    mocks.handlers.set(event.toEventName(), handler)
    return vi.fn()
  })
}))

vi.mock('electron', () => ({
  net: {
    isOnline: mocks.isOnline
  },
  powerMonitor: {
    off: mocks.off,
    on: mocks.on
  }
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    broadcast: mocks.broadcast,
    on: mocks.transportOn
  }))
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({
    channel: {}
  }))
}))

vi.mock('./network-service', () => ({
  getNetworkService: vi.fn(() => mocks.service)
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn()
    })),
    info: vi.fn(),
    warn: vi.fn()
  }))
}))

describe('NetworkModule lifecycle status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.broadcast.mockClear()
    mocks.handlers.clear()
    mocks.isOnline.mockReset()
    mocks.isOnline.mockReturnValue(true)
    mocks.off.mockClear()
    mocks.on.mockClear()
    mocks.service.getStatus.mockReset()
    mocks.service.setOnlineStatus.mockReset()
    mocks.status = null
    mocks.service.getStatus.mockImplementation(() => mocks.status)
    mocks.service.setOnlineStatus.mockImplementation((online: boolean, reason: string) => ({
      ...(mocks.status = {
        changedAt: Date.now(),
        online,
        reason
      })
    }))
    mocks.transportOn.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('broadcasts status only when renderer lifecycle changes online state', () => {
    const module = new NetworkModule()
    module.onInit({} as ModuleInitContext<TalexEvents>)
    mocks.broadcast.mockClear()

    mocks.handlers.get(NetworkEvents.lifecycle.offline.toEventName())?.({ reason: 'offline' })
    mocks.handlers.get(NetworkEvents.lifecycle.offline.toEventName())?.({ reason: 'offline' })
    mocks.handlers.get(NetworkEvents.lifecycle.online.toEventName())?.({ reason: 'online' })

    const statusPayloads = mocks.broadcast.mock.calls
      .filter(([event]) => event === NetworkEvents.lifecycle.status)
      .map(([, payload]) => payload)
    expect(statusPayloads).toMatchObject([
      { online: false, reason: 'offline' },
      { online: true, reason: 'online' }
    ])

    module.onDestroy({} as never)
  })

  it('probes electron net status on resume and broadcasts recovered online state', () => {
    const module = new NetworkModule()
    mocks.isOnline.mockReturnValueOnce(false)
    module.onInit({} as ModuleInitContext<TalexEvents>)
    mocks.broadcast.mockClear()

    mocks.isOnline.mockReturnValue(true)
    const resumeHandler = mocks.on.mock.calls.find(([event]) => event === 'resume')?.[1]
    resumeHandler?.()

    expect(mocks.broadcast).toHaveBeenCalledWith(
      NetworkEvents.lifecycle.status,
      expect.objectContaining({ online: true, reason: 'resume' })
    )
    expect(mocks.broadcast).toHaveBeenCalledWith(
      NetworkEvents.lifecycle.online,
      expect.objectContaining({ online: true, reason: 'resume' })
    )

    module.onDestroy({} as never)
  })
})
