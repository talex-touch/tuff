import type { HandlerContext } from '../../../../../packages/utils/transport/main'
import { defineRawEvent } from '../../../../../packages/utils/transport/event/builder'
import { TuffMainTransport } from '../../../../../packages/utils/transport/sdk/main-transport'
import { describe, expect, it, vi } from 'vitest'

const { ipcHandle, browserWindowMock } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  browserWindowMock: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock('electron', () => ({
  ipcMain: { handle: ipcHandle, on: vi.fn() },
  MessageChannelMain: class {},
  BrowserWindow: browserWindowMock,
}))

function createHarness() {
  const channel = {
    regChannel: vi.fn(() => vi.fn()),
    sendTo: vi.fn(),
    sendPlugin: vi.fn(),
    broadcast: vi.fn(),
    broadcastTo: vi.fn(),
    broadcastPlugin: vi.fn(),
  }
  const keyManager = {
    requestKey: vi.fn(),
    revokeKey: vi.fn(),
    resolveKey: vi.fn(),
    isValidKey: vi.fn(() => false),
    resolveIdentity: vi.fn(),
    resolveCurrentIdentity: vi.fn(),
    resolveSenderIdentity: vi.fn(),
  }
  return new TuffMainTransport(channel as never, keyManager as never)
}

describe('TuffMainTransport multiple handler diagnostics', () => {
  it('executes every same-event registration for local invoke and ipcMain.handle', async () => {
    const event = defineRawEvent<{ lane: string }, string>('diagnostic:corebox:duplicate-handler-cardinality')
    const transport = createHarness()
    const calls: string[] = []
    const first = vi.fn((_payload: unknown, context: HandlerContext) => {
      calls.push(`first:${context.eventName}`)
      return 'first'
    })
    const second = vi.fn((_payload: unknown, context: HandlerContext) => {
      calls.push(`second:${context.eventName}`)
      return 'second'
    })

    const disposeFirst = transport.on(event, first)
    const disposeSecond = transport.on(event, second)
    const sender = { id: 701 } as HandlerContext['sender']

    await expect(transport.invoke(event, { lane: 'local' }, { sender })).resolves.toBe('second')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([`first:${event.toEventName()}`, `second:${event.toEventName()}`])

    calls.length = 0
    first.mockClear()
    second.mockClear()
    const ipcHandler = ipcHandle.mock.calls.find(([eventName]) => eventName === event.toEventName())?.[1]
    expect(ipcHandler).toBeTypeOf('function')
    await expect(ipcHandler({ sender }, { lane: 'ipc' })).resolves.toBe('second')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(calls).toEqual([`first:${event.toEventName()}`, `second:${event.toEventName()}`])

    disposeFirst()
    calls.length = 0
    first.mockClear()
    second.mockClear()
    await expect(transport.invoke(event, { lane: 'after-dispose' }, { sender })).resolves.toBe('second')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)

    disposeSecond()
  })
})
