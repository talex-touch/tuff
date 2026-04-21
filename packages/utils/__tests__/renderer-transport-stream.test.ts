import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '../transport/events'
import { TuffRendererTransport } from '../transport/sdk/renderer-transport'
import { MockMessagePort } from './transport/mock-message-port'

let currentChannel: {
  send: ReturnType<typeof vi.fn>
  regChannel: ReturnType<typeof vi.fn>
}
let currentHandlers: Map<string, (raw: unknown) => void>

vi.mock('../renderer/hooks/use-channel', () => ({
  useChannel: () => currentChannel,
}))

describe('TuffRendererTransport.stream', () => {
  beforeEach(() => {
    currentHandlers = new Map()
    currentChannel = {
      send: vi.fn(async (_eventName: string, _payload?: unknown) => undefined),
      regChannel: vi.fn((eventName: string, handler: (raw: unknown) => void) => {
        currentHandlers.set(eventName, handler)
        return () => {
          currentHandlers.delete(eventName)
        }
      }),
    }
  })

  it('prefers port delivery when openPort succeeds', async () => {
    const transport = new TuffRendererTransport()
    const eventName = ClipboardEvents.change.toEventName()
    const port = new MockMessagePort()

    vi.spyOn(transport as any, 'openPort').mockResolvedValue({
      portId: 'renderer-port-1',
      channel: eventName,
      port: port as unknown as MessagePort,
      close: vi.fn(async () => undefined),
    })

    const chunks: unknown[] = []
    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => chunks.push(chunk),
    })

    port.dispatchMessage({
      channel: eventName,
      portId: 'renderer-port-1',
      streamId: controller.streamId,
      type: 'data',
      payload: { chunk: { latest: null, history: [] } },
    })

    expect(currentChannel.send).toHaveBeenCalledWith(`${eventName}:stream:start`, {
      streamId: controller.streamId,
    })
    expect(chunks).toEqual([{ latest: null, history: [] }])
  })

  it('falls back to channel events when the host cannot open a port', async () => {
    const transport = new TuffRendererTransport()
    const eventName = ClipboardEvents.change.toEventName()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.spyOn(transport as any, 'openPort').mockResolvedValue(null)

    const chunks: unknown[] = []
    const ended = vi.fn()
    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => chunks.push(chunk),
      onEnd: ended,
    })

    currentHandlers.get(`${eventName}:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { latest: null, history: [] } },
    })
    currentHandlers.get(`${eventName}:stream:end:${controller.streamId}`)?.({})

    expect(chunks).toEqual([{ latest: null, history: [] }])
    expect(ended).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})
