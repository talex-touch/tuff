import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { NativeTransport } from './native-transport'
import {
  capability,
  FakeNativeCarrier,
  streamData,
  streamEnd,
  streamError,
  successResponse
} from './native-transport.test-helpers'

function createTransport(): {
  transport: NativeTransport
  carrier: FakeNativeCarrier
} {
  const carrier = new FakeNativeCarrier('stream-carrier', [
    capability('fixture.counter', 'available', ['stream'])
  ])
  return {
    carrier,
    transport: new NativeTransport({ carriers: [carrier] })
  }
}

function accepted(control: Parameters<typeof successResponse>[0]) {
  const payload = control.payload as { streamId: string; initialWindow: number }
  return successResponse(control, {
    streamId: payload.streamId,
    effectiveWindow: payload.initialWindow,
    cancellation: 'cooperative'
  })
}

describe('NativeTransport stream lifecycle', () => {
  it('accepts frames that arrive synchronously before open returns', async () => {
    const { transport, carrier } = createTransport()
    await transport.initialize()
    carrier.openStreamImpl = (control, _attachments, onFrame) => {
      const streamId = (control.payload as { streamId: string }).streamId
      onFrame(streamData(streamId, 1, { value: 1 }))
      onFrame(streamEnd(streamId, 2, { emitted: 1 }))
      return accepted(control)
    }

    const stream = transport.openStream<null, { value: number }>('fixture.counter', 'count', null, {
      initialWindow: 1
    })
    const iterator = stream[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: expect.objectContaining({ value: { value: 1 } })
    })
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    await expect(stream.closed).resolves.toEqual({
      kind: 'end',
      value: { emitted: 1 }
    })
    expect(carrier.acknowledgements).toEqual([{ streamId: stream.id, sequence: 1 }])
    expect(carrier.released).toEqual([stream.id])
    await transport.dispose()
  })

  it('ACKs only when the consumer removes a chunk', async () => {
    const { transport, carrier } = createTransport()
    await transport.initialize()
    const frames: {
      emit?: Parameters<FakeNativeCarrier['openStreamImpl']>[2]
    } = {}
    carrier.openStreamImpl = (control, _attachments, onFrame) => {
      frames.emit = onFrame
      return accepted(control)
    }
    const stream = transport.openStream('fixture.counter', 'count', null, {
      initialWindow: 2
    })
    const streamId = stream.id

    frames.emit?.(streamData(streamId, 1, { value: 1 }))
    frames.emit?.(streamData(streamId, 2, { value: 2 }))
    expect(carrier.acknowledgements).toEqual([])

    const iterator = stream[Symbol.asyncIterator]()
    await iterator.next()
    expect(carrier.acknowledgements).toEqual([{ streamId, sequence: 1 }])
    await iterator.next()
    expect(carrier.acknowledgements).toEqual([
      { streamId, sequence: 1 },
      { streamId, sequence: 2 }
    ])
    frames.emit?.(streamEnd(streamId, 3))
    await iterator.next()
    await transport.dispose()
  })

  it('fails closed on sequence and queue-window violations', async () => {
    const { transport, carrier } = createTransport()
    await transport.initialize()
    carrier.openStreamImpl = (control, _attachments, onFrame) => {
      const streamId = (control.payload as { streamId: string }).streamId
      onFrame(streamData(streamId, 2, { invalid: true }))
      return accepted(control)
    }
    const invalidSequence = transport.openStream('fixture.counter', 'count', null, {
      initialWindow: 1
    })
    await expect(invalidSequence.closed).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'NATIVE_PROTOCOL_VIOLATION' }
    })
    await expect(invalidSequence[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'NATIVE_PROTOCOL_VIOLATION'
    })

    carrier.openStreamImpl = (control, _attachments, onFrame) => {
      const streamId = (control.payload as { streamId: string }).streamId
      onFrame(streamData(streamId, 1, 1))
      onFrame(streamData(streamId, 2, 2))
      return accepted(control)
    }
    const overflow = transport.openStream('fixture.counter', 'count', null, {
      initialWindow: 1
    })
    await expect(overflow.closed).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'NATIVE_PROTOCOL_VIOLATION' }
    })
    await transport.dispose()
  })

  it('rejects malformed packets and structured ACK faults before resolving next()', async () => {
    const { transport, carrier } = createTransport()
    await transport.initialize()
    carrier.openStreamImpl = (control, _attachments, onFrame) => {
      const streamId = (control.payload as { streamId: string }).streamId
      const malformed = streamData(streamId, 1, { invalid: true })
      malformed.attachments = [Buffer.from('unexpected')]
      onFrame(malformed)
      return accepted(control)
    }
    const malformed = transport.openStream('fixture.counter', 'count', null)
    await expect(malformed[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'NATIVE_PROTOCOL_VIOLATION'
    })

    const frames: {
      emit?: Parameters<FakeNativeCarrier['openStreamImpl']>[2]
    } = {}
    carrier.openStreamImpl = (control, _attachments, onFrame) => {
      frames.emit = onFrame
      return accepted(control)
    }
    carrier.acknowledge = () => {
      throw new Error('raw addon path must not escape')
    }
    const ackFailure = transport.openStream('fixture.counter', 'count', null)
    const next = ackFailure[Symbol.asyncIterator]().next()
    frames.emit?.(streamData(ackFailure.id, 1, { notDelivered: true }))
    await expect(next).rejects.toMatchObject({ code: 'CARRIER_ACK_FAILED' })
    await expect(ackFailure.closed).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'CARRIER_ACK_FAILED' }
    })

    carrier.acknowledge = () => {
      throw Object.assign(new Error('not inspected'), {
        code: 'NATIVE_BACKPRESSURE_BROKEN'
      })
    }
    const backpressure = transport.openStream('fixture.counter', 'count', null)
    const backpressureNext = backpressure[Symbol.asyncIterator]().next()
    frames.emit?.(streamData(backpressure.id, 1, { notDelivered: true }))
    await expect(backpressureNext).rejects.toMatchObject({
      code: 'NATIVE_BACKPRESSURE_BROKEN',
      category: 'protocol',
      retryable: false
    })
    await transport.dispose()
  })

  it('drains accepted data before surfacing a native terminal error', async () => {
    const { transport, carrier } = createTransport()
    await transport.initialize()
    carrier.openStreamImpl = (control, _attachments, onFrame) => {
      const streamId = (control.payload as { streamId: string }).streamId
      onFrame(streamData(streamId, 1, { value: 1 }))
      onFrame(streamError(streamId, 2))
      return accepted(control)
    }

    const stream = transport.openStream<null, { value: number }>('fixture.counter', 'count', null, {
      initialWindow: 1
    })
    const iterator = stream[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { value: { value: 1 } }
    })
    await expect(iterator.next()).rejects.toMatchObject({ code: 'FIXTURE_STREAM_FAILED' })
    await expect(stream.closed).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'FIXTURE_STREAM_FAILED' }
    })
    await transport.dispose()
  })

  it('iterator return cancels only the owned stream and bounds missing terminal by grace', async () => {
    vi.useFakeTimers()
    try {
      const { transport, carrier } = createTransport()
      await transport.initialize()
      const first = transport.openStream('fixture.counter', 'count', null)
      const second = transport.openStream('fixture.counter', 'count', null)

      await first[Symbol.asyncIterator]().return?.()
      expect(carrier.cancellations).toContainEqual({
        targetType: 'stream',
        id: first.id,
        reason: 'consumer_closed'
      })
      expect(carrier.cancellations.some((cancel) => cancel.id === second.id)).toBe(false)
      let closed = false
      void first.closed.then(() => {
        closed = true
      })
      await vi.advanceTimersByTimeAsync(999)
      expect(closed).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await first.closed).toEqual({ kind: 'cancelled' })
      second.cancel()
      await transport.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('AbortSignal and deadline use stable local terminal precedence', async () => {
    vi.useFakeTimers()
    try {
      const { transport, carrier } = createTransport()
      await transport.initialize()
      const controller = new AbortController()
      const aborted = transport.openStream('fixture.counter', 'count', null, {
        signal: controller.signal
      })
      controller.abort()
      await vi.advanceTimersByTimeAsync(1000)
      await expect(aborted.closed).resolves.toMatchObject({
        kind: 'cancelled',
        error: { code: 'CANCELLED' }
      })

      const timed = transport.openStream('fixture.counter', 'count', null, {
        timeoutMs: 20
      })
      await vi.advanceTimersByTimeAsync(20)
      await expect(timed.closed).resolves.toMatchObject({
        kind: 'error',
        error: { code: 'DEADLINE_EXCEEDED' }
      })
      expect(carrier.cancellations).toContainEqual({
        targetType: 'stream',
        id: timed.id,
        reason: 'deadline'
      })
      await transport.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a native terminal processed before the timer wins', async () => {
    vi.useFakeTimers()
    try {
      const { transport, carrier } = createTransport()
      await transport.initialize()
      carrier.openStreamImpl = (control, _attachments, onFrame) => {
        const streamId = (control.payload as { streamId: string }).streamId
        setTimeout(() => onFrame(streamEnd(streamId, 1, { done: true })), 10)
        return accepted(control)
      }
      const stream = transport.openStream('fixture.counter', 'count', null, {
        timeoutMs: 20
      })
      await vi.advanceTimersByTimeAsync(10)
      await expect(stream.closed).resolves.toEqual({
        kind: 'end',
        value: { done: true }
      })
      await vi.advanceTimersByTimeAsync(20)
      expect(carrier.cancellations.some((cancel) => cancel.id === stream.id)).toBe(false)
      await transport.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('transport disposal terminates open streams and leaves no live state', async () => {
    const { transport, carrier } = createTransport()
    await transport.initialize()
    const stream = transport.openStream('fixture.counter', 'count', null)
    const next = stream[Symbol.asyncIterator]().next()

    await transport.dispose()
    await expect(next).rejects.toMatchObject({ code: 'TRANSPORT_DISPOSED' })
    await expect(stream.closed).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'TRANSPORT_DISPOSED' }
    })
    expect(carrier.cancellations).toContainEqual({
      targetType: 'stream',
      id: stream.id,
      reason: 'dispose'
    })
    expect((await transport.health()).openStreams).toBe(0)
  })
})
