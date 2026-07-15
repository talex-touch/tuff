import type {
  HandlerContext,
  ITuffTransportMain,
  TuffEvent
} from '@talex-touch/utils/transport/main'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { setPermissionModule } from '../modules/permission'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  checkPermission: vi.fn(),
  getPluginByName: vi.fn()
}))

vi.mock('../modules/plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      getPluginByName: mocks.getPluginByName
    }
  }
}))

vi.mock('../modules/system/selection-capture', () => ({
  selectionCaptureService: {
    capture: mocks.capture
  }
}))

import { registerSystemSelectionCaptureHandlers } from './system-selection-capture-handlers'

type RegisteredHandler = (payload: unknown, context: HandlerContext) => Promise<unknown> | unknown

const verifiedPluginContext = {
  plugin: { name: 'selection-plugin', verified: true, uniqueKey: 'selection-plugin-key' }
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
    const handler = handlers.get(AppEvents.system.captureSelection.toEventName())
    if (!handler) throw new Error('Selection capture handler was not registered')
    return await handler(payload, context)
  }

  return { invoke, transport }
}

describe('registerSystemSelectionCaptureHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPluginByName.mockReturnValue({ sdkapi: 260713 })
    setPermissionModule({ checkPermission: mocks.checkPermission } as never)
    mocks.checkPermission.mockReturnValue({ allowed: true })
    mocks.capture.mockResolvedValue({
      text: 'selected text',
      supportLevel: 'best_effort',
      issueCode: 'empty',
      issueMessage: 'No selected text was captured.',
      limitations: ['Focused application controls copy behavior.'],
      capturedAt: 1_784_115_200_000
    })
  })

  afterEach(() => {
    setPermissionModule(null as never)
  })

  it.each([
    {
      name: 'the caller is unverified',
      configure: () => undefined,
      payload: { _sdkapi: 260713 },
      context: {
        plugin: { name: 'selection-plugin', verified: false, uniqueKey: 'selection-plugin-key' }
      } as HandlerContext,
      code: 'SELECTION_CAPTURE_PERMISSION_DENIED'
    },
    {
      name: 'the permission runtime is unavailable',
      configure: () => setPermissionModule(null as never),
      payload: { _sdkapi: 260713 },
      context: verifiedPluginContext,
      code: 'SELECTION_CAPTURE_PERMISSION_UNAVAILABLE'
    },
    {
      name: 'clipboard.read is denied',
      configure: () => mocks.checkPermission.mockReturnValue({ allowed: false, reason: 'denied' }),
      payload: { _sdkapi: 260713 },
      context: verifiedPluginContext,
      code: 'SELECTION_CAPTURE_PERMISSION_DENIED'
    },
    {
      name: 'the payload SDK version differs from the verified plugin',
      configure: () => undefined,
      payload: { _sdkapi: 260626 },
      context: verifiedPluginContext,
      code: 'SDKAPI_MISMATCH'
    }
  ])('fails closed before capture when $name', async ({ configure, payload, context, code }) => {
    configure()
    const { invoke, transport } = createTransport()
    registerSystemSelectionCaptureHandlers(transport)

    await expect(invoke(payload, context)).rejects.toMatchObject({
      code,
      permissionId: 'clipboard.read',
      pluginId: 'selection-plugin'
    })
    expect(mocks.capture).not.toHaveBeenCalled()
  })

  it('returns the exact shared capture result for a verified plugin with clipboard.read', async () => {
    const expected = {
      text: 'selected text',
      supportLevel: 'best_effort' as const,
      issueCode: 'empty' as const,
      issueMessage: 'No selected text was captured.',
      limitations: ['Focused application controls copy behavior.'],
      capturedAt: 1_784_115_200_000
    }
    mocks.capture.mockResolvedValue(expected)
    const { invoke, transport } = createTransport()
    registerSystemSelectionCaptureHandlers(transport)

    await expect(invoke({ _sdkapi: 260713 }, verifiedPluginContext)).resolves.toEqual(expected)
    expect(mocks.capture).toHaveBeenCalledWith({ enabled: true })
  })
})
