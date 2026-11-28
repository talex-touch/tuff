import type { ModuleInitContext } from '@talex-touch/utils'
import {
  FlowEvents,
  type HandlerContext,
  type ITuffTransportMain
} from '@talex-touch/utils/transport/main'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TalexEvents } from '../../core/eventbus/touch-event'

const mocks = vi.hoisted(() => {
  const enforcePermission = vi.fn()
  return {
    handlers: new Map<string, (payload: unknown, ctx: HandlerContext) => unknown>(),
    enforcePermission,
    getPermissionModule: vi.fn<() => { enforcePermission: typeof enforcePermission } | null>(
      () => ({
        enforcePermission
      })
    ),
    plugins: new Map<string, { sdkapi?: number }>([
      ['plugin-a', { sdkapi: 260101 }],
      ['legacy-plugin', {}]
    ]),
    nativeShare: vi.fn(async () => ({ success: true, target: 'mail' })),
    cleanupTempFiles: vi.fn(async () => undefined)
  }
})

vi.mock('electron', () => {
  const electronMock = {
    app: {
      getLocale: vi.fn(() => 'en-US'),
      getPath: vi.fn(() => '/tmp'),
      getVersion: vi.fn(() => '0.0.0-test'),
      setPath: vi.fn()
    },
    clipboard: { writeText: vi.fn(), writeHTML: vi.fn() },
    crashReporter: { start: vi.fn() },
    ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn(), removeListener: vi.fn() },
    MessageChannelMain: vi.fn(),
    powerMonitor: { on: vi.fn(), removeListener: vi.fn() }
  }
  return {
    __esModule: true,
    default: electronMock,
    ...electronMock
  }
})

vi.mock('../../core/runtime-accessor', () => ({
  resolveMainRuntime: vi.fn(() => ({
    transport: {
      on: vi.fn(
        (
          event: { toEventName: () => string },
          handler: (payload: unknown, ctx: HandlerContext) => unknown
        ) => {
          mocks.handlers.set(event.toEventName(), handler)
          return vi.fn()
        }
      ),
      broadcast: vi.fn(),
      sendToPlugin: vi.fn(async () => undefined)
    } as unknown as ITuffTransportMain
  }))
}))

vi.mock('../../utils/i18n-helper', () => ({
  t: (key: string) => key
}))

vi.mock('../permission', () => ({
  getPermissionModule: mocks.getPermissionModule
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: mocks.plugins
    }
  }
}))

vi.mock('./flow-consent', () => ({
  flowConsentStore: {
    hasConsent: vi.fn(() => true),
    consumeOnce: vi.fn(() => false),
    consumeConfirmationOnce: vi.fn(() => false),
    grantConsent: vi.fn(),
    grantOnce: vi.fn(() => 'tok'),
    grantConfirmationOnce: vi.fn(() => 'confirm-tok')
  },
  requiresFlowConsent: vi.fn(() => false)
}))

vi.mock('./flow-audit-logger', () => ({
  flowAuditLogger: {
    log: vi.fn(),
    logSessionComplete: vi.fn()
  }
}))

vi.mock('./logger', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return {
    flowBusModuleLog: logger,
    flowBusIpcLog: logger,
    flowBusDispatchLog: logger,
    flowBusSessionLog: logger,
    flowBusTargetLog: logger
  }
})

vi.mock('./native-share', () => ({
  nativeShareService: {
    getAvailableTargets: vi.fn(() => [
      {
        id: 'mail',
        name: 'Mail',
        supportedTypes: ['text']
      }
    ]),
    describeTarget: vi.fn(() => ({ name: 'Mail', description: 'Mail' })),
    payloadToShareOptions: vi.fn((payload: { data: unknown }) => ({
      text: String(payload.data)
    })),
    normalizeTarget: vi.fn((target?: string) => target?.replace(/^native\./, '') ?? 'mail'),
    share: mocks.nativeShare,
    cleanupTempFiles: mocks.cleanupTempFiles
  }
}))

import { flowBus } from './flow-bus'
import { FlowBusModule } from './module'
import { flowSessionManager } from './session-manager'
import { flowTargetRegistry } from './target-registry'

function pluginCtx(name: string, sdkapi?: number): HandlerContext {
  return {
    sender: {} as HandlerContext['sender'],
    eventName: 'flow:module-test',
    plugin: {
      ...createTrustedTestPluginContext({ name, uniqueKey: `${name}-key` }),
      ...(sdkapi !== undefined ? { sdkapi } : {})
    }
  }
}

describe('FlowBusModule native delivery and security checks', () => {
  let mod: FlowBusModule

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.getPermissionModule.mockReturnValue({
      enforcePermission: mocks.enforcePermission
    })
    flowTargetRegistry.clear()
    flowSessionManager.clear()

    mod = new FlowBusModule()
    await mod.onInit({} as ModuleInitContext<TalexEvents>)
  })

  afterEach(async () => {
    await mod.onDestroy()
    flowTargetRegistry.clear()
    flowSessionManager.clear()
  })

  it('acknowledges Flow sessions with requireAck=true when native delivery succeeds', async () => {
    const result = await flowBus.dispatch(
      'corebox',
      { type: 'text', data: 'share via native mail' },
      { preferredTarget: 'native.mail', requireAck: true, timeout: 500 }
    )

    expect(mocks.nativeShare).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'share via native mail', target: 'mail' }),
      { callerPluginId: undefined, callerSdkApi: undefined }
    )
    expect(result).toEqual({
      sessionId: expect.any(String),
      state: 'ACKED',
      ackPayload: { success: true, target: 'mail' }
    })
  })

  it('rejects _sdkapi spoofing when manifest omits sdkapi and fails closed if permission module is null', async () => {
    const registerHandler = mocks.handlers.get(FlowEvents.registerTargets.toEventName())!

    await expect(
      registerHandler(
        { pluginId: 'legacy-plugin', targets: [], _sdkapi: 260121 },
        pluginCtx('legacy-plugin')
      )
    ).rejects.toMatchObject({ code: 'SDKAPI_MISMATCH' })

    mocks.getPermissionModule.mockReturnValueOnce(null)
    await expect(
      registerHandler({ pluginId: 'plugin-a', targets: [] }, pluginCtx('plugin-a', 260101))
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })
})
