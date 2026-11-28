import {
  FlowEvents,
  type HandlerContext,
  type ITuffTransportMain
} from '@talex-touch/utils/transport/main'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown, context: HandlerContext) => unknown>(),
  enforcePermission: vi.fn(),
  checkPermission: vi.fn(() => ({ allowed: true })),
  dispatch: vi.fn(async (senderId: string) => ({
    sessionId: `sess-${senderId}`,
    state: 'DELIVERED'
  })),
  cancel: vi.fn(() => true),
  acknowledge: vi.fn(() => true),
  reportError: vi.fn(() => true),
  resolveTargetSelection: vi.fn(),
  plugins: new Map<string, { sdkapi?: number }>([
    ['plugin-a', { sdkapi: 260101 }],
    ['plugin-b', { sdkapi: 260101 }]
  ])
}))

vi.mock('../permission', () => ({
  getPermissionModule: vi.fn(() => ({
    enforcePermission: mocks.enforcePermission,
    checkPermission: mocks.checkPermission
  }))
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: mocks.plugins
    }
  }
}))

vi.mock('./flow-bus', () => ({
  flowBus: {
    dispatch: mocks.dispatch,
    cancel: mocks.cancel,
    acknowledge: mocks.acknowledge,
    reportError: mocks.reportError,
    resolveTargetSelection: mocks.resolveTargetSelection,
    getSession: (id: string) => flowSessionManager.getSession(id)
  }
}))

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => ({})),
  saveMainConfig: vi.fn()
}))

vi.mock('./logger', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return {
    flowBusIpcLog: logger,
    flowBusSessionLog: logger,
    flowBusTargetLog: logger
  }
})

import { flowConsentStore } from './flow-consent'
import { FlowBusIPC } from './ipc'
import { flowSessionManager } from './session-manager'

function pluginCtx(name: string, sdkapi?: number): HandlerContext {
  return {
    sender: {} as HandlerContext['sender'],
    eventName: 'flow:test',
    plugin: {
      ...createTrustedTestPluginContext({ name, uniqueKey: `${name}-key` }),
      ...(sdkapi !== undefined ? { sdkapi } : {})
    }
  }
}

function unverifiedCtx(name: string): HandlerContext {
  return {
    sender: {} as HandlerContext['sender'],
    eventName: 'flow:test',
    plugin: { name, verified: false } as unknown as HandlerContext['plugin']
  }
}

describe('FlowBus security boundaries', () => {
  let ipc: FlowBusIPC

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    flowSessionManager.clear()
    const transport = {
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
    ipc = new FlowBusIPC(transport)
    ipc.registerHandlers()
  })

  afterEach(() => {
    ipc.unregisterHandlers()
    flowSessionManager.clear()
  })

  it('uses cryptographic randomUUID for session IDs and randomBytes for consent tokens', () => {
    const session = flowSessionManager.createSession('plugin-a', 'plugin-b', 'target', {
      type: 'text',
      data: 'hi'
    })
    expect(session.sessionId).toMatch(
      /^flow-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )

    const onceToken = flowConsentStore.grantOnce('plugin-a', 'plugin-b.target')
    const confirmToken = flowConsentStore.grantConfirmationOnce('plugin-a', 'plugin-b.target')
    expect(onceToken).toMatch(/^[0-9a-f]{48}$/)
    expect(confirmToken).toMatch(/^[0-9a-f]{48}$/)
    expect(onceToken).not.toBe(confirmToken)
  })

  it('rejects unverified plugin contexts and senderId spoofing on dispatch', async () => {
    const dispatchHandler = mocks.handlers.get(FlowEvents.dispatch.toEventName())!

    const unverifiedRes = await dispatchHandler(
      { payload: { type: 'text', data: 'x' } },
      unverifiedCtx('plugin-a')
    )
    expect(unverifiedRes).toMatchObject({ success: false })
    expect(mocks.dispatch).not.toHaveBeenCalled()

    const spoofRes = await dispatchHandler(
      { senderId: 'plugin-b', payload: { type: 'text', data: 'x' } },
      pluginCtx('plugin-a', 260101)
    )
    expect(spoofRes).toMatchObject({ success: false })
    expect(mocks.dispatch).not.toHaveBeenCalled()

    const validRes = await dispatchHandler(
      { payload: { type: 'text', data: 'x' } },
      pluginCtx('plugin-a', 260101)
    )
    expect(validRes).toMatchObject({ success: true })
    expect(mocks.dispatch).toHaveBeenCalledWith('plugin-a', { type: 'text', data: 'x' }, undefined)
  })

  it('rejects _sdkapi spoofing when payload _sdkapi mismatches manifest sdkapi', async () => {
    const dispatchHandler = mocks.handlers.get(FlowEvents.dispatch.toEventName())!
    const res = await dispatchHandler(
      { payload: { type: 'text', data: 'x' }, _sdkapi: 999999 },
      pluginCtx('plugin-a')
    )
    expect(res).toMatchObject({ success: false })
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('enforces session participant ownership on cancel/acknowledge/reportError and blocks plugin selectTarget', async () => {
    const session = flowSessionManager.createSession('plugin-a', 'plugin-b', 'target', {
      type: 'text',
      data: 'secret'
    })

    const cancelHandler = mocks.handlers.get(FlowEvents.cancel.toEventName())!
    const ackHandler = mocks.handlers.get(FlowEvents.acknowledge.toEventName())!
    const reportErrHandler = mocks.handlers.get(FlowEvents.reportError.toEventName())!
    const selectTargetHandler = mocks.handlers.get(FlowEvents.selectTarget.toEventName())!

    // Unrelated plugin-c cannot cancel, ack, or report error on plugin-a -> plugin-b session
    expect(
      await cancelHandler({ sessionId: session.sessionId }, pluginCtx('plugin-c'))
    ).toMatchObject({
      success: false
    })
    // Sender plugin-a cannot acknowledge on behalf of target plugin-b
    expect(await ackHandler({ sessionId: session.sessionId }, pluginCtx('plugin-a'))).toMatchObject(
      {
        success: false
      }
    )
    expect(
      await reportErrHandler(
        { sessionId: session.sessionId, message: 'spoof' },
        pluginCtx('plugin-a')
      )
    ).toMatchObject({ success: false })

    // No plugin may hijack selectTarget
    expect(
      await selectTargetHandler(
        { sessionId: session.sessionId, targetId: 'plugin-a.evil' },
        pluginCtx('plugin-a')
      )
    ).toMatchObject({ success: false })
    expect(mocks.resolveTargetSelection).not.toHaveBeenCalled()

    // Target plugin-b CAN acknowledge
    expect(await ackHandler({ sessionId: session.sessionId }, pluginCtx('plugin-b'))).toMatchObject(
      {
        success: true
      }
    )
    // Participant plugin-a CAN cancel
    expect(
      await cancelHandler({ sessionId: session.sessionId }, pluginCtx('plugin-a'))
    ).toMatchObject({
      success: true
    })
  })
})
