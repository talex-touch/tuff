import { describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '../../transport/events'
import { startClientStream } from '../../transport/sdk/stream/client-runtime'
import {
  buildStreamDataEnvelope,
  buildStreamEndEnvelope,
  buildStreamErrorEnvelope,
  buildStreamStartPayload,
  getStreamEventNames,
  normalizePortStreamMessage,
} from '../../transport/sdk/stream/protocol'

describe('stream protocol helpers', () => {
  it('derives stream event names and start payload consistently', () => {
    const eventName = ClipboardEvents.change.toEventName()
    const streamEvents = getStreamEventNames(eventName)

    expect(streamEvents.start).toBe(`${eventName}:stream:start`)
    expect(streamEvents.cancel).toBe(`${eventName}:stream:cancel`)
    expect(streamEvents.data('abc')).toBe(`${eventName}:stream:data:abc`)
    expect(buildStreamStartPayload({ foo: 'bar' }, 'stream-1')).toEqual({
      foo: 'bar',
      streamId: 'stream-1',
    })
    expect(buildStreamStartPayload(undefined, 'stream-1')).toEqual({
      streamId: 'stream-1',
    })
  })

  it('normalizes port envelopes for data, error and end messages', () => {
    expect(normalizePortStreamMessage(buildStreamDataEnvelope('clipboard:change', 's1', { ok: true }))).toEqual({
      type: 'data',
      streamId: 's1',
      chunk: { ok: true },
    })

    expect(normalizePortStreamMessage(buildStreamErrorEnvelope('clipboard:change', 's2', 'boom'))).toEqual({
      type: 'error',
      streamId: 's2',
      error: 'boom',
    })

    expect(normalizePortStreamMessage(buildStreamEndEnvelope('clipboard:change', 's3'))).toEqual({
      type: 'end',
      streamId: 's3',
    })
  })
})

describe('startClientStream', () => {
  function createAdapter() {
    const handlers = new Map<string, (raw: unknown) => void>()
    const streamControllers = new Map()
    const send = vi.fn(async (_eventName: string, _payload?: unknown) => undefined)

    return {
      handlers,
      streamControllers,
      send,
      adapter: {
        streamControllers,
        send,
        registerChannel: (eventName: string, handler: (raw: unknown) => void) => {
          handlers.set(eventName, handler)
          return () => {
            handlers.delete(eventName)
          }
        },
      },
    }
  }

  it('cleans up idempotently and stops dispatching after cancel', async () => {
    const { adapter, handlers, send, streamControllers } = createAdapter()
    const eventName = ClipboardEvents.change.toEventName()
    const onData = vi.fn()
    const onEnd = vi.fn()

    const controller = await startClientStream(adapter, eventName, undefined, {
      onData,
      onEnd,
    })

    expect(send).toHaveBeenCalledWith(`${eventName}:stream:start`, {
      streamId: controller.streamId,
    })
    expect(streamControllers.has(controller.streamId)).toBe(true)

    controller.cancel()
    controller.cancel()

    expect(send).toHaveBeenCalledWith(`${eventName}:stream:cancel`, {
      streamId: controller.streamId,
    })
    expect(streamControllers.has(controller.streamId)).toBe(false)
    expect(handlers.size).toBe(0)

    handlers.get(`${eventName}:stream:data:${controller.streamId}`)?.({
      header: { status: 'request' },
      data: { chunk: { latest: null, history: [] } },
    })
    handlers.get(`${eventName}:stream:end:${controller.streamId}`)?.({})

    expect(onData).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })
})
