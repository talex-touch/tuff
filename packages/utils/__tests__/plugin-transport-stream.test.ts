import { describe, expect, it, vi } from 'vitest'
import { createPluginTuffTransport } from '../transport/sdk/plugin-transport'
import { ClipboardEvents } from '../transport/events'
import { MockMessagePort } from './transport/mock-message-port'

describe('TuffPluginTransport.stream', () => {
  function createChannel() {
    const handlers = new Map<string, (raw: unknown) => void>()
    const channel = {
      send: vi.fn(async (_eventName: string, _payload?: unknown) => undefined),
      regChannel: vi.fn((eventName: string, handler: (raw: unknown) => void) => {
        handlers.set(eventName, handler)
        return () => {
          handlers.delete(eventName)
        }
      }),
    }

    return { channel, handlers }
  }

  it('uses plugin channel fallback stream events', async () => {
    const { channel, handlers } = createChannel()
    const transport = createPluginTuffTransport(channel)
    const eventName = ClipboardEvents.change.toEventName()
    const chunks: unknown[] = []
    let ended = false

    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => chunks.push(chunk),
      onEnd: () => {
        ended = true
      },
    })

    expect(channel.send).toHaveBeenCalledWith(`${eventName}:stream:start`, {
      streamId: controller.streamId,
    })

    handlers.get(`${eventName}:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { latest: null, history: [] } },
    })
    expect(chunks).toEqual([{ latest: null, history: [] }])

    handlers.get(`${eventName}:stream:end:${controller.streamId}`)?.({})
    expect(ended).toBe(true)
    expect(handlers.has(`${eventName}:stream:data:${controller.streamId}`)).toBe(false)
  })

  it('prefers port delivery when openPort succeeds', async () => {
    const { channel } = createChannel()
    const transport = createPluginTuffTransport(channel) as any
    const eventName = ClipboardEvents.change.toEventName()
    const port = new MockMessagePort()

    vi.spyOn(transport, 'openPort').mockResolvedValue({
      portId: 'plugin-port-1',
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
      portId: 'plugin-port-1',
      streamId: controller.streamId,
      type: 'data',
      payload: { chunk: { latest: null, history: [] } },
    })

    expect(chunks).toEqual([{ latest: null, history: [] }])
  })

  it('falls back to channel delivery when port setup fails', async () => {
    const { channel, handlers } = createChannel()
    const transport = createPluginTuffTransport(channel) as any
    const eventName = ClipboardEvents.change.toEventName()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.spyOn(transport, 'openPort').mockRejectedValue(new Error('open failed'))

    const chunks: unknown[] = []
    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => chunks.push(chunk),
    })

    handlers.get(`${eventName}:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { latest: null, history: [] } },
    })

    expect(chunks).toEqual([{ latest: null, history: [] }])
    warnSpy.mockRestore()
  })

  it('falls back to channel after port closes mid-stream', async () => {
    const { channel, handlers } = createChannel()
    const transport = createPluginTuffTransport(channel) as any
    const eventName = ClipboardEvents.change.toEventName()
    const port = new MockMessagePort()

    vi.spyOn(transport, 'openPort').mockResolvedValue({
      portId: 'plugin-port-2',
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
      portId: 'plugin-port-2',
      streamId: controller.streamId,
      type: 'data',
      payload: { chunk: { source: 'port' } },
    })
    port.close()

    handlers.get(`${eventName}:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { source: 'channel' } },
    })

    expect(chunks).toEqual([{ source: 'port' }, { source: 'channel' }])
  })

  it('sends stream cancel through the plugin channel', async () => {
    const { channel } = createChannel()
    const transport = createPluginTuffTransport(channel)
    const eventName = ClipboardEvents.change.toEventName()

    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: vi.fn(),
    })

    controller.cancel()

    expect(channel.send).toHaveBeenCalledWith(`${eventName}:stream:cancel`, {
      streamId: controller.streamId,
    })
    expect(controller.cancelled).toBe(true)
  })
})
