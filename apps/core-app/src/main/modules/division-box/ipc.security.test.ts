import {
  DivisionBoxEvents,
  type HandlerContext,
  type ITuffTransportMain
} from '@talex-touch/utils/transport/main'
import { createTrustedTestPluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const sessionA = {
    sessionId: 'sess-a',
    meta: {
      pluginId: 'plugin-a',
      title: 'A',
      size: 'medium',
      keepAlive: false,
      createdAt: 1,
      lastAccessedAt: 1
    },
    getAttachedPlugin: () => ({ name: 'plugin-a' }),
    getState: () => 'active',
    getSessionState: vi.fn(() => ({ secret: 'a-only' })),
    setSessionState: vi.fn(),
    togglePin: vi.fn(() => true),
    isAlwaysOnTop: vi.fn(() => false),
    setOpacity: vi.fn(),
    getOpacity: vi.fn(() => 1),
    toggleDevTools: vi.fn(() => true),
    isDevToolsOpen: vi.fn(() => false),
    getUIView: vi.fn(() => null)
  }
  const sessionB = {
    sessionId: 'sess-b',
    meta: {
      pluginId: 'plugin-b',
      title: 'B',
      size: 'medium',
      keepAlive: false,
      createdAt: 1,
      lastAccessedAt: 1
    },
    getAttachedPlugin: () => ({ name: 'plugin-b' }),
    getState: () => 'active',
    getSessionState: vi.fn(() => ({ secret: 'b-only' })),
    setSessionState: vi.fn(),
    togglePin: vi.fn(() => true),
    isAlwaysOnTop: vi.fn(() => false),
    setOpacity: vi.fn(),
    getOpacity: vi.fn(() => 1),
    toggleDevTools: vi.fn(() => true),
    isDevToolsOpen: vi.fn(() => false),
    getUIView: vi.fn(() => null)
  }
  return {
    handlers: new Map<string, (payload: unknown, ctx: HandlerContext) => unknown>(),
    sessionA,
    sessionB,
    destroySession: vi.fn(async () => undefined),
    getSession: vi.fn((id: string) =>
      id === 'sess-a' ? sessionA : id === 'sess-b' ? sessionB : undefined
    ),
    getActiveSessions: vi.fn(() => [sessionA, sessionB]),
    getActiveSessionsInfo: vi.fn(() => [
      { sessionId: sessionA.sessionId, state: 'active', meta: sessionA.meta },
      { sessionId: sessionB.sessionId, state: 'active', meta: sessionB.meta }
    ]),
    enforcePermission: vi.fn(),
    plugins: new Map<string, { sdkapi?: number }>([
      ['plugin-a', { sdkapi: 260101 }],
      ['plugin-b', { sdkapi: 260101 }]
    ])
  }
})

vi.mock('../permission', () => ({
  getPermissionModule: vi.fn(() => ({
    enforcePermission: mocks.enforcePermission
  }))
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      plugins: mocks.plugins
    }
  }
}))

vi.mock('./manager', () => ({
  DivisionBoxManager: {
    getInstance: () => ({
      getSession: mocks.getSession,
      getActiveSessions: mocks.getActiveSessions,
      getActiveSessionsInfo: mocks.getActiveSessionsInfo,
      destroySession: mocks.destroySession
    })
  }
}))

vi.mock('./logger', () => ({
  divisionBoxIpcLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { DivisionBoxIPC } from './ipc'

function pluginCtx(name: string): HandlerContext {
  return {
    sender: {} as HandlerContext['sender'],
    eventName: 'division-box:test',
    plugin: {
      ...createTrustedTestPluginContext({ name, uniqueKey: `${name}-key` }),
      sdkapi: 260101
    }
  }
}

function unverifiedCtx(name: string): HandlerContext {
  return {
    sender: {} as HandlerContext['sender'],
    eventName: 'division-box:test',
    plugin: { name, verified: false } as unknown as HandlerContext['plugin']
  }
}

describe('DivisionBoxIPC cross-plugin ownership isolation', () => {
  let ipc: DivisionBoxIPC

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
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
      broadcast: vi.fn()
    } as unknown as ITuffTransportMain
    ipc = new DivisionBoxIPC(transport)
    ipc.registerHandlers()
  })

  afterEach(() => {
    ipc.unregisterHandlers()
  })

  it('blocks plugin-a from inspecting, mutating, closing, or injecting input into plugin-b sessions', async () => {
    const ctxA = pluginCtx('plugin-a')

    expect(
      await mocks.handlers.get(DivisionBoxEvents.getState.toEventName())?.(
        { sessionId: 'sess-b' },
        ctxA
      )
    ).toMatchObject({ success: false })
    expect(
      await mocks.handlers.get(DivisionBoxEvents.updateState.toEventName())?.(
        { sessionId: 'sess-b', key: 'k', value: 'v' },
        ctxA
      )
    ).toMatchObject({ success: false })
    expect(mocks.sessionB.setSessionState).not.toHaveBeenCalled()

    expect(
      await mocks.handlers.get(DivisionBoxEvents.close.toEventName())?.(
        { sessionId: 'sess-b' },
        ctxA
      )
    ).toMatchObject({ success: false })
    expect(mocks.destroySession).not.toHaveBeenCalled()

    expect(
      await mocks.handlers.get(DivisionBoxEvents.toggleDevTools.toEventName())?.(
        { sessionId: 'sess-b' },
        ctxA
      )
    ).toMatchObject({ success: false })
    expect(mocks.sessionB.toggleDevTools).not.toHaveBeenCalled()

    expect(
      await mocks.handlers.get(DivisionBoxEvents.togglePin.toEventName())?.(
        { sessionId: 'sess-b' },
        ctxA
      )
    ).toMatchObject({ success: false })
    expect(
      await mocks.handlers.get(DivisionBoxEvents.setOpacity.toEventName())?.(
        { sessionId: 'sess-b', opacity: 0.5 },
        ctxA
      )
    ).toMatchObject({ success: false })
    expect(
      await mocks.handlers.get(DivisionBoxEvents.getWindowState.toEventName())?.(
        { sessionId: 'sess-b' },
        ctxA
      )
    ).toMatchObject({ success: false })
    expect(
      await mocks.handlers.get(DivisionBoxEvents.inputChange.toEventName())?.(
        { sessionId: 'sess-b', input: 'injected' },
        ctxA
      )
    ).toMatchObject({ success: false })
  })

  it('scopes getActiveSessions to the calling plugin and rejects unverified plugin contexts', async () => {
    const listHandler = mocks.handlers.get(DivisionBoxEvents.getActiveSessions.toEventName())!

    const resA = (await listHandler(undefined, pluginCtx('plugin-a'))) as {
      success: boolean
      data?: Array<{ sessionId: string }>
    }
    expect(resA.success).toBe(true)
    expect(resA.data?.map((s) => s.sessionId)).toEqual(['sess-a'])

    const unverifiedRes = await listHandler(undefined, unverifiedCtx('plugin-a'))
    expect(unverifiedRes).toMatchObject({ success: false })
  })
})
