import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import { DivisionBoxEvents } from '@talex-touch/utils/transport/main'
import { describe, expect, it, vi } from 'vitest'

const { getInstanceMock, managerMock } = vi.hoisted(() => {
  const managerMock = {
    createSession: vi.fn(),
    destroySession: vi.fn(),
    getSession: vi.fn(),
    getActiveSessionsInfo: vi.fn(() => [])
  }

  return {
    managerMock,
    getInstanceMock: vi.fn(() => managerMock)
  }
})

vi.mock('./manager', () => ({
  DivisionBoxManager: {
    getInstance: getInstanceMock
  }
}))

vi.mock('../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: null
  }
}))

import { DivisionBoxIPC } from './ipc'
import { FLOW_TRIGGER_UNAVAILABLE_REASON } from './flow-trigger'

describe('DivisionBoxIPC flow trigger compat hard-cut', () => {
  it('returns structured unavailable response and does not create session', async () => {
    let flowTriggerHandler:
      | ((payload: unknown, context: HandlerContext) => Promise<unknown>)
      | undefined
    const transport = {
      on: vi.fn((event, handler) => {
        if (event === DivisionBoxEvents.flowTrigger) {
          flowTriggerHandler = handler as typeof flowTriggerHandler
        }
        return () => {}
      })
    } as unknown as ITuffTransportMain

    const ipc = new DivisionBoxIPC(transport)
    ipc.registerHandlers()

    const response = (await flowTriggerHandler?.(
      {
        targetId: 'plugin.notes.quick-capture',
        payload: {
          type: 'text',
          data: 'hello'
        }
      },
      {} as HandlerContext
    )) as {
      success: boolean
      error?: { code?: string; message?: string }
    }

    expect(response).toEqual({
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: FLOW_TRIGGER_UNAVAILABLE_REASON
      }
    })
    expect(managerMock.createSession).not.toHaveBeenCalled()
  })
})
