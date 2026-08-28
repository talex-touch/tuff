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
  toStreamError,
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
      error: { message: 'boom' },
    })

    expect(normalizePortStreamMessage(buildStreamEndEnvelope('clipboard:change', 's3'))).toEqual({
      type: 'end',
      streamId: 's3',
    })
  })

  it('projects stable stream messages into machine-readable error codes', () => {
    expect(toStreamError('INTELLIGENCE_PERMISSION_DENIED')).toMatchObject({
      message: 'INTELLIGENCE_PERMISSION_DENIED',
      code: 'INTELLIGENCE_PERMISSION_DENIED',
    })
    expect(toStreamError('permission denied')).toMatchObject({
      message: 'permission denied',
    })
    expect(toStreamError('permission denied')).not.toHaveProperty('code')
  })

  it('always wraps caller-owned errors without mutating frozen or sealed values', () => {
    const frozen = Object.freeze(new Error('INTELLIGENCE_PERMISSION_DENIED'))
    const projected = toStreamError(frozen)
    expect(projected).not.toBe(frozen)
    expect(projected).toMatchObject({
      message: 'INTELLIGENCE_PERMISSION_DENIED',
      code: 'INTELLIGENCE_PERMISSION_DENIED',
    })
    expect(frozen).not.toHaveProperty('code')

    const coded = Object.seal(Object.assign(new Error('permission denied'), { code: 'EXISTING_CODE' }))
    const codedProjection = toStreamError(coded)
    expect(codedProjection).not.toBe(coded)
    expect(codedProjection).toMatchObject({
      message: 'permission denied',
      code: 'EXISTING_CODE',
    })
  })

  it('does not trust throwing error getters or toString implementations', () => {
    const throwingMessage = Object.create(null)
    Object.defineProperty(throwingMessage, 'message', {
      get: () => {
        throw new Error('message getter should stay local')
      },
    })
    Object.defineProperty(throwingMessage, 'code', { value: 'SAFE_ERROR_CODE' })

    expect(toStreamError(throwingMessage)).toMatchObject({
      message: 'Stream error',
      code: 'SAFE_ERROR_CODE',
    })

    const throwingCode = Object.create(null)
    Object.defineProperty(throwingCode, 'message', { value: 'permission denied' })
    Object.defineProperty(throwingCode, 'code', {
      get: () => {
        throw new Error('code getter should stay local')
      },
    })
    expect(toStreamError(throwingCode)).toMatchObject({ message: 'permission denied' })
    expect(toStreamError(throwingCode)).not.toHaveProperty('code')

    const throwingToString = {
      toString() {
        throw new Error('toString should stay local')
      },
    }
    expect(toStreamError(throwingToString)).toMatchObject({ message: 'Stream error' })
  })

  it('round-trips an explicit stable code independently from the message', () => {
    const envelope = buildStreamErrorEnvelope('clipboard:change', 's4', {
      message: 'permission denied',
      code: 'INTELLIGENCE_PERMISSION_DENIED',
    })

    expect(envelope).toMatchObject({
      payload: {
        error: 'permission denied',
        code: 'INTELLIGENCE_PERMISSION_DENIED',
      },
      error: {
        message: 'permission denied',
        code: 'stream_error',
      },
    })
    expect(normalizePortStreamMessage(envelope)).toEqual({
      type: 'error',
      streamId: 's4',
      error: {
        message: 'permission denied',
        code: 'INTELLIGENCE_PERMISSION_DENIED',
      },
    })
  })

  it('drops unstable explicit codes instead of putting them on the wire', () => {
    const envelope = buildStreamErrorEnvelope('clipboard:change', 's5', {
      message: 'permission denied',
      code: 'stream_error',
    })

    expect(envelope.payload).toEqual({ error: 'permission denied' })
    expect(envelope.error).toEqual({
      code: 'stream_error',
      message: 'permission denied',
    })
    expect(normalizePortStreamMessage(envelope)).toEqual({
      type: 'error',
      streamId: 's5',
      error: { message: 'permission denied' },
    })
    expect(toStreamError({ message: 'permission denied', code: 'stream_error' })).not.toHaveProperty('code')
  })

  it('uses a stable fallback when a port error omits its message', () => {
    expect(normalizePortStreamMessage({ type: 'error', streamId: 's6' })).toEqual({
      type: 'error',
      streamId: 's6',
      error: { message: 'Stream error' },
    })
    expect(normalizePortStreamMessage({
      type: 'error',
      streamId: 's7',
      payload: { code: 'INTELLIGENCE_PERMISSION_DENIED' },
    })).toEqual({
      type: 'error',
      streamId: 's7',
      error: {
        message: 'INTELLIGENCE_PERMISSION_DENIED',
        code: 'INTELLIGENCE_PERMISSION_DENIED',
      },
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

  it('cleans MessagePort error state even when onError throws and preserves code', async () => {
    const { adapter, handlers, streamControllers } = createAdapter()
    const eventName = ClipboardEvents.change.toEventName()
    const portListeners = new Map<string, (event: MessageEvent) => void>()
    const close = vi.fn(async () => undefined)
    const port = {
      addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
        portListeners.set(type, listener)
      }),
      removeEventListener: vi.fn((type: string) => {
        portListeners.delete(type)
      }),
      start: vi.fn(),
    }
    const onError = vi.fn((_error: Error) => {
      throw new Error('consumer error callback failed')
    })

    const controller = await startClientStream(
      {
        ...adapter,
        openPort: vi.fn(async () => ({
          portId: 'port-1',
          channel: eventName,
          port: port as unknown as MessagePort,
          close,
        })),
      },
      eventName,
      undefined,
      { onData: vi.fn(), onError },
    )

    const envelope = buildStreamErrorEnvelope(eventName, controller.streamId, {
      message: 'permission denied',
      code: 'INTELLIGENCE_PERMISSION_DENIED',
    })
    expect(() => portListeners.get('message')?.({ data: envelope } as MessageEvent)).toThrow(
      'consumer error callback failed',
    )
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      message: 'permission denied',
      code: 'INTELLIGENCE_PERMISSION_DENIED',
    })
    expect(streamControllers.has(controller.streamId)).toBe(false)
    expect(handlers.size).toBe(0)
    expect(portListeners.size).toBe(0)
    expect(close).toHaveBeenCalledWith('stream_cleanup')
  })

  it('cleans MessagePort end state even when onEnd throws', async () => {
    const { adapter, handlers, streamControllers } = createAdapter()
    const eventName = ClipboardEvents.change.toEventName()
    const portListeners = new Map<string, (event: MessageEvent) => void>()
    const close = vi.fn(async () => undefined)
    const port = {
      addEventListener: vi.fn((type: string, listener: (event: MessageEvent) => void) => {
        portListeners.set(type, listener)
      }),
      removeEventListener: vi.fn((type: string) => {
        portListeners.delete(type)
      }),
      start: vi.fn(),
    }
    const onEnd = vi.fn(() => {
      throw new Error('consumer end callback failed')
    })

    const controller = await startClientStream(
      {
        ...adapter,
        openPort: vi.fn(async () => ({
          portId: 'port-2',
          channel: eventName,
          port: port as unknown as MessagePort,
          close,
        })),
      },
      eventName,
      undefined,
      { onData: vi.fn(), onEnd },
    )

    expect(() => portListeners.get('message')?.({
      data: buildStreamEndEnvelope(eventName, controller.streamId),
    } as MessageEvent)).toThrow('consumer end callback failed')
    expect(streamControllers.has(controller.streamId)).toBe(false)
    expect(handlers.size).toBe(0)
    expect(portListeners.size).toBe(0)
    expect(close).toHaveBeenCalledWith('stream_cleanup')
  })
})
