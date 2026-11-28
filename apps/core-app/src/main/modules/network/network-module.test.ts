import type { ModuleInitContext } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkEvents } from '@talex-touch/utils/transport/events'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { idleBudgetCoordinator } from '../../service/idle-budget-coordinator'
import { NetworkModule } from './network-module'

const mocks = vi.hoisted(() => ({
  broadcast: vi.fn(),
  rawHandlers: new Map<string, (payload?: unknown) => unknown>(),
  handlers: new Map<string, (payload?: unknown) => unknown>(),
  isOnline: vi.fn(() => true),
  off: vi.fn(),
  on: vi.fn(),
  service: {
    getStatus: vi.fn(),
    setOnlineStatus: vi.fn(),
    request: vi.fn(),
    requestForPlugin: vi.fn()
  },
  status: null as { changedAt: number; online: boolean; reason: string } | null,
  transportInvoke: vi.fn(),
  regChannel: vi.fn((_type: string, eventName: string, handler: (payload?: unknown) => unknown) => {
    mocks.rawHandlers.set(eventName, handler)
    return vi.fn()
  }),
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
    on: mocks.transportOn,
    invoke: mocks.transportInvoke
  }))
}))

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({
    channel: {
      regChannel: mocks.regChannel
    }
  }))
}))

vi.mock('../permission', () => ({
  getPermissionModule: () => ({
    checkPermission: vi.fn((_pluginId: string, permissionId: string) => ({
      allowed: permissionId === 'network.internet'
    })),
    getGuard: () => ({
      check: vi.fn((_pluginId: string, permissionId: string) => ({
        allowed: permissionId === 'network.internet'
      }))
    })
  })
}))

vi.mock('../permission/permission-module-ref', () => ({
  getPermissionModule: () => ({
    checkPermission: vi.fn((_pluginId: string, permissionId: string) => ({
      allowed: permissionId === 'network.internet'
    })),
    getGuard: () => ({
      check: vi.fn((_pluginId: string, permissionId: string) => ({
        allowed: permissionId === 'network.internet'
      }))
    })
  })
}))

vi.mock('../permission/permission-ports', () => ({
  resolvePermissionPluginDeclaredSdkApi: vi.fn(async () => 260215)
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: vi.fn(() => ({ sdkapi: 260215 }))
    }
  }
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
    mocks.rawHandlers.clear()
    mocks.isOnline.mockReset()
    mocks.isOnline.mockReturnValue(true)
    mocks.off.mockClear()
    mocks.on.mockClear()
    mocks.service.getStatus.mockReset()
    mocks.service.setOnlineStatus.mockReset()
    mocks.service.request.mockReset()
    mocks.service.requestForPlugin.mockReset()
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
    mocks.transportInvoke.mockReset()
    mocks.regChannel.mockClear()
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

  it('routes verified plugin requests once through isolated requestForPlugin and blocks file://', async () => {
    const module = new NetworkModule()
    const response = {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { translatedText: '你好，世界' },
      url: 'https://example.test/translate',
      ok: true
    }
    const sender = { id: 42 }
    const request = {
      method: 'POST',
      url: 'https://example.test/translate',
      responseType: 'json',
      body: { text: 'Hello world' }
    }
    mocks.service.requestForPlugin.mockResolvedValueOnce(response)

    module.onInit({} as ModuleInitContext<TalexEvents>)
    try {
      // Must not double-register NetworkEvents.api.request on raw plugin channel
      expect(mocks.regChannel).not.toHaveBeenCalled()

      const handler = mocks.handlers.get(NetworkEvents.api.request.toEventName()) as
        | ((payload: unknown, context: unknown) => Promise<unknown>)
        | undefined
      expect(handler).toBeTypeOf('function')

      const pluginContext = createTrustedTestPluginContext({
        name: 'touch-translation',
        pluginInstanceId: 'translation-instance',
        activationGeneration: 2
      })

      // Non-HTTP schemes such as file:// are rejected before hitting the network service
      await expect(
        handler?.(
          { method: 'GET', url: 'file:///etc/passwd', responseType: 'text' },
          { sender, eventName: NetworkEvents.api.request.toEventName(), plugin: pluginContext }
        )
      ).rejects.toThrow('NETWORK_UNSUPPORTED_PROTOCOL')
      expect(mocks.service.request).not.toHaveBeenCalled()
      expect(mocks.service.requestForPlugin).not.toHaveBeenCalled()

      // Unverified plugin context is denied
      await expect(
        handler?.(request, {
          sender,
          eventName: NetworkEvents.api.request.toEventName(),
          plugin: { name: 'touch-translation', uniqueKey: 'forged' }
        })
      ).rejects.toThrow()

      // Host requests still go through service.request
      await expect(
        handler?.(request, {
          sender,
          eventName: NetworkEvents.api.request.toEventName(),
          plugin: undefined
        })
      ).resolves.toBeUndefined()
      expect(mocks.service.request).toHaveBeenCalledWith(request)

      // Authoritative plugin requests route through requestForPlugin with whitelisted fields only
      mocks.service.request.mockClear()
      mocks.service.requestForPlugin.mockClear()
      mocks.service.requestForPlugin.mockResolvedValueOnce(response)
      await expect(
        handler?.(
          {
            ...request,
            headers: { 'x-test': '1' },
            unexpectedField: 'dropped'
          },
          {
            sender,
            eventName: NetworkEvents.api.request.toEventName(),
            plugin: pluginContext
          }
        )
      ).resolves.toEqual(response)
      expect(mocks.service.request).not.toHaveBeenCalled()
      expect(mocks.service.requestForPlugin).toHaveBeenCalledWith(
        {
          method: 'POST',
          url: 'https://example.test/translate',
          responseType: 'json',
          headers: { 'x-test': '1' },
          body: { text: 'Hello world' }
        },
        {
          pluginName: 'touch-translation',
          allowLocal: false,
          allowInternet: true
        }
      )

      // Plugin requests supplying proxyOverride are rejected fail-closed
      mocks.service.requestForPlugin.mockClear()
      await expect(
        handler?.(
          {
            ...request,
            proxyOverride: {
              mode: 'custom',
              custom: { httpProxy: 'http://attacker.example:8080' },
              authRef: 'auth.token'
            }
          },
          {
            sender,
            eventName: NetworkEvents.api.request.toEventName(),
            plugin: pluginContext
          }
        )
      ).rejects.toThrow('PLUGIN_NETWORK_REQUEST_INVALID')
      expect(mocks.service.requestForPlugin).not.toHaveBeenCalled()
    } finally {
      module.onDestroy({} as never)
    }
  })

  it('pauses 5s net.isOnline polling during background-hidden and system-suspended and resumes without duplicate timers', () => {
    const module = new NetworkModule()
    const coordinatorInternal = idleBudgetCoordinator as unknown as {
      transitionTo: (
        state: 'active' | 'background-hidden' | 'system-suspended',
        reason: string
      ) => void
    }

    module.onInit({} as ModuleInitContext<TalexEvents>)
    // Initial probe ran synchronously on init.
    expect(mocks.isOnline).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5_000)
    expect(mocks.isOnline).toHaveBeenCalledTimes(2)

    // Enter background-hidden -> 0 polls over 30s.
    coordinatorInternal.transitionTo('background-hidden', 'window-hidden-grace-elapsed')
    vi.advanceTimersByTime(30_000)
    expect(mocks.isOnline).toHaveBeenCalledTimes(2)

    // Enter system-suspended -> still 0 polls over 30s.
    coordinatorInternal.transitionTo('system-suspended', 'power-suspend')
    vi.advanceTimersByTime(30_000)
    expect(mocks.isOnline).toHaveBeenCalledTimes(2)

    // Return to active -> immediate resume probe + single 5s interval (no duplicates).
    coordinatorInternal.transitionTo('active', 'power-resume')
    expect(mocks.isOnline).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(5_000)
    expect(mocks.isOnline).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(5_000)
    expect(mocks.isOnline).toHaveBeenCalledTimes(5)

    module.onDestroy({} as never)
    idleBudgetCoordinator.destroy()
    vi.advanceTimersByTime(30_000)
    expect(mocks.isOnline).toHaveBeenCalledTimes(5)
    expect(vi.getTimerCount()).toBe(0)
  })
})
