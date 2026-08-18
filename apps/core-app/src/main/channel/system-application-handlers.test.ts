import type {
  HandlerContext,
  ITuffTransportMain,
  TuffEvent
} from '@talex-touch/utils/transport/main'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { setPermissionModule } from '../modules/permission'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  resolveApplication: vi.fn(),
  checkPermission: vi.fn(),
  getPluginByName: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  MessageChannelMain: class {},
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => [])
  },
  app: {
    getPath: vi.fn(() => '/tmp/tuff')
  }
}))

vi.mock('../modules/plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: mocks.getPluginByName
    }
  }
}))

vi.mock('../modules/box-tool/addon/apps/app-provider', () => ({
  appProvider: {
    resolveApplication: mocks.resolveApplication
  }
}))

import { registerSystemApplicationHandlers } from './system-application-handlers'

type RegisteredHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

const verifiedPluginContext = {
  plugin: createTrustedTestPluginContext({
    name: 'clipboard-history',
    pluginInstanceId: 'clipboard-history-instance',
    uniqueKey: 'clipboard-history-key'
  })
} as HandlerContext

function createTransport() {
  const handlers = new Map<string, RegisteredHandler>()
  const transport = {
    on: vi.fn(
      <TReq, TRes>(
        event: TuffEvent<TReq, TRes> & { toEventName: () => string },
        handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>
      ) => {
        handlers.set(event.toEventName(), handler as RegisteredHandler)
        return () => handlers.delete(event.toEventName())
      }
    )
  } as unknown as ITuffTransportMain

  const invoke = async (payload: unknown, context: HandlerContext) => {
    const handler = handlers.get(AppEvents.system.resolveApplication.toEventName())
    if (!handler) throw new Error('Application resolution handler was not registered')
    return await handler(payload, context)
  }

  return { invoke, transport }
}

describe('registerSystemApplicationHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPluginByName.mockReturnValue({ sdkapi: 260817 })
    mocks.checkPermission.mockReturnValue({ allowed: true })
    mocks.resolveApplication.mockResolvedValue({
      identifier: 'com.demo.app',
      displayName: 'Demo',
      icon: 'tfile:///tmp/demo.png'
    })
    setPermissionModule({ checkPermission: mocks.checkPermission } as never)
  })

  afterEach(() => {
    setPermissionModule(null as never)
  })

  it.each([
    {
      name: 'the caller is unverified',
      configure: () => undefined,
      sdkapi: 260817,
      context: { plugin: { name: 'clipboard-history', verified: false } } as HandlerContext,
      code: 'APPLICATION_RESOLUTION_PERMISSION_DENIED'
    },
    {
      name: 'the permission runtime is unavailable',
      configure: () => setPermissionModule(null as never),
      sdkapi: 260817,
      context: verifiedPluginContext,
      code: 'APPLICATION_RESOLUTION_PERMISSION_UNAVAILABLE'
    },
    {
      name: 'system.applications is denied',
      configure: () => mocks.checkPermission.mockReturnValue({ allowed: false, reason: 'denied' }),
      sdkapi: 260817,
      context: verifiedPluginContext,
      code: 'APPLICATION_RESOLUTION_PERMISSION_DENIED'
    },
    {
      name: 'the payload uses the pre-application-resolution SDK marker',
      configure: () => undefined,
      sdkapi: 260713,
      context: verifiedPluginContext,
      code: 'SDKAPI_MISMATCH'
    }
  ])('fails closed before app lookup when $name', async ({ configure, sdkapi, context, code }) => {
    configure()
    const { invoke, transport } = createTransport()
    registerSystemApplicationHandlers(transport)

    await expect(
      invoke({ identifier: 'com.demo.app', _sdkapi: sdkapi }, context)
    ).rejects.toMatchObject({
      code,
      permissionId: 'system.applications',
      pluginId: 'clipboard-history'
    })
    expect(mocks.resolveApplication).not.toHaveBeenCalled()
  })

  it('rejects invalid identifiers after authorization without touching the provider', async () => {
    const { invoke, transport } = createTransport()
    registerSystemApplicationHandlers(transport)

    await expect(
      invoke({ identifier: '   ', _sdkapi: 260817 }, verifiedPluginContext)
    ).rejects.toThrow('SYSTEM_APPLICATION_IDENTIFIER_INVALID')
    expect(mocks.resolveApplication).not.toHaveBeenCalled()
  })

  it('returns only the provider bounded projection for an exact identifier', async () => {
    const expected = {
      identifier: 'com.demo.app',
      displayName: 'Demo',
      icon: 'tfile:///tmp/demo.png'
    }
    const { invoke, transport } = createTransport()
    registerSystemApplicationHandlers(transport)

    await expect(
      invoke({ identifier: 'com.demo.app', _sdkapi: 260817 }, verifiedPluginContext)
    ).resolves.toEqual(expected)
    expect(mocks.resolveApplication).toHaveBeenCalledWith('com.demo.app')
  })
})
