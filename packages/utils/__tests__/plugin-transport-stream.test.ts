import { describe, expect, it, vi } from 'vitest'
import { createPluginTuffTransport } from '../transport/sdk/plugin-transport'
import { ClipboardEvents } from '../transport/events'

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
