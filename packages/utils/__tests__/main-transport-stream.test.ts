import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClipboardChangePayload } from '../transport/events/types/clipboard'
import type { StreamContext } from '../transport/types'
import { ClipboardEvents } from '../transport/events'
import { TuffMainTransport } from '../transport/sdk/main-transport'

const { ipcHandle, FakeMessageChannelMain, browserWindowMock } = vi.hoisted(() => {
  class FakeMessagePortMain {
    private closeHandlers = new Set<() => void>()

    on(eventName: string, handler: () => void): void {
      if (eventName === 'close') {
        this.closeHandlers.add(handler)
      }
    }

    start(): void {}

    close(): void {
      this.closeHandlers.forEach(handler => handler())
    }

    postMessage(): void {}
  }

  class FakeMessageChannelMain {
    port1 = new FakeMessagePortMain()
    port2 = new FakeMessagePortMain()
  }

  return {
    ipcHandle: vi.fn(),
    FakeMessageChannelMain,
    browserWindowMock: {
      getFocusedWindow: vi.fn(() => null),
      getAllWindows: vi.fn(() => []),
    },
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcHandle,
  },
  MessageChannelMain: FakeMessageChannelMain,
  BrowserWindow: browserWindowMock,
}))

describe('TuffMainTransport.onStream', () => {
  function createChannel() {
    const handlers = new Map<string, (data: any) => void>()
    return {
      handlers,
      channel: {
        regChannel: vi.fn((type: string, eventName: string, handler: (data: any) => void) => {
          handlers.set(`${type}:${eventName}`, handler)
          return () => {
            handlers.delete(`${type}:${eventName}`)
          }
        }),
        sendTo: vi.fn(async () => undefined),
        sendPlugin: vi.fn(async () => undefined),
        broadcast: vi.fn(),
        broadcastTo: vi.fn(),
      },
    }
  }

  function createSender(id = 1) {
    return {
      id,
      send: vi.fn(),
      postMessage: vi.fn(),
      isDestroyed: vi.fn(() => false),
      once: vi.fn(),
    }
  }

  beforeEach(() => {
    ipcHandle.mockClear()
  })

  it('falls back to channel events when no stream port is available', () => {
    const { channel, handlers } = createChannel()
    const transport = new TuffMainTransport(channel as any, {} as any)
    const eventName = ClipboardEvents.change.toEventName()
    const sender = createSender()

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      context.emit({ latest: null, history: [] })
      context.end()
    })

    handlers.get(`main:${eventName}:stream:start`)?.({
      data: { streamId: 'stream-main-1' },
      header: { event: { sender } },
    })

    expect(sender.send).toHaveBeenCalledTimes(2)
    expect(sender.send).toHaveBeenNthCalledWith(1, '@main-process-message', expect.objectContaining({
      data: { chunk: { latest: null, history: [] } },
      name: `${eventName}:stream:data:stream-main-1`,
    }))
    expect(sender.send).toHaveBeenNthCalledWith(2, '@main-process-message', expect.objectContaining({
      data: {},
      name: `${eventName}:stream:end:stream-main-1`,
    }))
  })

  it('stops emitting after cancel for plugin-originated streams', () => {
    const { channel, handlers } = createChannel()
    const transport = new TuffMainTransport(channel as any, {} as any)
    const eventName = ClipboardEvents.change.toEventName()
    const sender = createSender(2)
    let capturedContext: StreamContext<ClipboardChangePayload> | null = null

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      capturedContext = context
    })

    handlers.get(`plugin:${eventName}:stream:start`)?.({
      data: { streamId: 'stream-plugin-1' },
      plugin: 'clipboard-history',
      header: { event: { sender }, uniqueKey: 'plugin-key' },
    })

    handlers.get(`plugin:${eventName}:stream:cancel`)?.({
      data: { streamId: 'stream-plugin-1' },
    })

    expect(capturedContext).not.toBeNull()
    capturedContext!.emit({ latest: null, history: [] })
    capturedContext!.end()

    expect(sender.send).not.toHaveBeenCalled()
  })
})
