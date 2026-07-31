import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { NativeTransport, NativeTransportError } from './native-transport'
import {
  capability,
  deferred,
  errorResponse,
  FakeNativeCarrier,
  successResponse
} from './native-transport.test-helpers'

describe('NativeTransport unary and lifecycle', () => {
  it('shares initialization, isolates carrier failure, and routes available/degraded capabilities', async () => {
    const first = new FakeNativeCarrier('first', [
      capability('fixture.available'),
      capability('fixture.degraded', 'degraded'),
      capability('fixture.unavailable', 'unavailable')
    ])
    const failed = new FakeNativeCarrier('failed', [capability('fixture.failed')])
    failed.handshakeImpl = () => {
      throw new Error('private path must not escape')
    }
    const transport = new NativeTransport({ carriers: [first, failed] })

    const one = transport.initialize()
    const two = transport.initialize()
    expect(one).toBe(two)
    const snapshot = await one
    expect(first.handshakeCalls).toBe(1)
    expect(snapshot.capabilities.map((item) => item.id)).toEqual([
      'fixture.available',
      'fixture.degraded'
    ])
    expect(snapshot.carriers).toEqual([
      expect.objectContaining({ carrierId: 'first', state: 'ready' }),
      expect.objectContaining({
        carrierId: 'failed',
        state: 'unavailable',
        code: 'CARRIER_HANDSHAKE_FAILED'
      })
    ])

    await expect(transport.invoke('fixture.unavailable', 'echo', null)).rejects.toMatchObject({
      code: 'CAPABILITY_NOT_FOUND'
    })
    const result = await transport.invoke('fixture.degraded', 'echo', { ok: true })
    expect(result.value).toEqual({ ok: true })
    await transport.dispose()
  })

  it('times out one handshake and disposes it when the late handshake settles', async () => {
    vi.useFakeTimers()
    try {
      const carrier = new FakeNativeCarrier('late', [capability('fixture.late')])
      const pending = deferred<ReturnType<(typeof carrier)['handshake']>>()
      carrier.handshakeImpl = async () => await pending.promise
      const transport = new NativeTransport({
        carriers: [carrier],
        policy: { handshakeTimeoutMs: 10 }
      })

      const initializing = transport.initialize()
      await vi.advanceTimersByTimeAsync(10)
      await expect(initializing).resolves.toMatchObject({
        capabilities: [],
        carriers: [{ state: 'unavailable', code: 'CARRIER_HANDSHAKE_TIMEOUT' }]
      })
      pending.resolve(carrier.snapshot)
      await vi.advanceTimersByTimeAsync(0)
      expect(carrier.disposeCalls).toBe(1)
      await transport.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes duplicate routable capabilities instead of choosing by order', async () => {
    const first = new FakeNativeCarrier('first', [capability('fixture.conflict')])
    const second = new FakeNativeCarrier('second', [capability('fixture.conflict')])
    const transport = new NativeTransport({ carriers: [first, second] })
    const snapshot = await transport.initialize()

    expect(snapshot.conflicts).toEqual(['fixture.conflict'])
    expect(snapshot.capabilities).toEqual([])
    await expect(transport.invoke('fixture.conflict', 'echo', null)).rejects.toMatchObject({
      code: 'CAPABILITY_NOT_FOUND'
    })
    await transport.dispose()
  })

  it('round-trips attachments and maps protocol failures without payload logging', async () => {
    const carrier = new FakeNativeCarrier('fixture', [capability('fixture.echo')])
    const logger = { info: vi.fn(), warn: vi.fn() }
    const transport = new NativeTransport({ carriers: [carrier], logger })
    await transport.initialize()

    const result = await transport.invoke(
      'fixture.echo',
      'echo',
      { secret: 'not-logged' },
      {
        attachments: [
          {
            id: 'input',
            data: Buffer.from('owned'),
            mediaType: 'application/octet-stream'
          }
        ]
      }
    )
    expect(result.value).toEqual({ secret: 'not-logged' })
    expect(result.attachments[0].toString()).toBe('owned')
    expect(carrier.invocations[0]?.attachments).toEqual([
      expect.objectContaining({ id: 'input', index: 0, byteLength: 5 })
    ])

    carrier.invokeImpl = async (control) => errorResponse(control, 'FIXTURE_FAILED')
    await expect(transport.invoke('fixture.echo', 'echo', null)).rejects.toMatchObject({
      code: 'FIXTURE_FAILED',
      requestId: expect.any(String),
      carrierId: 'fixture'
    })
    const logged = JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls])
    expect(logged).not.toContain('not-logged')
    expect(logged).not.toContain('owned')
    await transport.dispose()
  })

  it('fails closed on response correlation and packet attachment mismatches', async () => {
    const carrier = new FakeNativeCarrier('fixture', [capability('fixture.echo')])
    const transport = new NativeTransport({ carriers: [carrier] })
    await transport.initialize()

    carrier.invokeImpl = async (control) => {
      const packet = successResponse(control, { invalid: true })
      packet.control.requestId = 'wrong-request'
      return packet
    }
    await expect(transport.invoke('fixture.echo', 'echo', null)).rejects.toMatchObject({
      code: 'NATIVE_PROTOCOL_VIOLATION'
    })

    carrier.invokeImpl = async (control) => {
      const packet = successResponse(control, null, [Buffer.from('expected')])
      packet.attachments[0] = Buffer.from('wrong-length')
      return packet
    }
    await expect(transport.invoke('fixture.echo', 'echo', null)).rejects.toMatchObject({
      code: 'NATIVE_PROTOCOL_VIOLATION'
    })
    await transport.dispose()
  })

  it('lets deadline and caller abort claim terminal and suppresses late native completion', async () => {
    vi.useFakeTimers()
    try {
      const carrier = new FakeNativeCarrier('fixture', [capability('fixture.echo')])
      const late = deferred<ReturnType<typeof successResponse>>()
      carrier.invokeImpl = async () => await late.promise
      const transport = new NativeTransport({ carriers: [carrier] })
      await transport.initialize()

      const timed = transport.invoke('fixture.echo', 'echo', null, { timeoutMs: 20 })
      const timedExpectation = expect(timed).rejects.toMatchObject({
        code: 'DEADLINE_EXCEEDED'
      })
      await Promise.resolve()
      const timedRequest = carrier.invocations[0]
      await vi.advanceTimersByTimeAsync(20)
      await timedExpectation
      expect(carrier.cancellations).toContainEqual({
        targetType: 'request',
        id: timedRequest?.requestId,
        reason: 'deadline'
      })
      late.resolve(successResponse(timedRequest!, { late: true }))
      await Promise.resolve()

      const abortedDeferred = deferred<ReturnType<typeof successResponse>>()
      carrier.invokeImpl = async () => await abortedDeferred.promise
      const controller = new AbortController()
      const aborted = transport.invoke('fixture.echo', 'echo', null, {
        signal: controller.signal,
        timeoutMs: 1000
      })
      const abortedExpectation = expect(aborted).rejects.toMatchObject({ code: 'CANCELLED' })
      await Promise.resolve()
      const abortedRequest = carrier.invocations[1]
      controller.abort()
      await abortedExpectation
      abortedDeferred.resolve(successResponse(abortedRequest!, { late: true }))
      await Promise.resolve()

      const health = await transport.health()
      expect(health.inFlightUnary).toBe(0)
      await transport.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses process-lifetime non-reused ids', async () => {
    const carrier = new FakeNativeCarrier('fixture', [capability('fixture.echo')])
    const transport = new NativeTransport({ carriers: [carrier] })
    await transport.initialize()
    await transport.invoke('fixture.echo', 'echo', 1)
    await transport.invoke('fixture.echo', 'echo', 2)

    const [first, second] = carrier.invocations.map((request) => request.requestId)
    expect(first).not.toBe(second)
    expect(first).toMatch(/^nt-[0-9a-f]{24}-request-1$/)
    expect(second).toMatch(/^nt-[0-9a-f]{24}-request-2$/)
    await transport.dispose()
  })

  it('rejects in-flight unary on dispose and suppresses its late completion', async () => {
    const carrier = new FakeNativeCarrier('fixture', [capability('fixture.echo')])
    const late = deferred<ReturnType<typeof successResponse>>()
    carrier.invokeImpl = async () => await late.promise
    carrier.healthImpl = vi.fn(carrier.healthImpl)
    const transport = new NativeTransport({ carriers: [carrier] })
    await transport.initialize()

    const invocation = transport.invoke('fixture.echo', 'echo', null)
    const rejected = expect(invocation).rejects.toMatchObject({ code: 'TRANSPORT_DISPOSED' })
    await Promise.resolve()
    const request = carrier.invocations[0]
    await transport.dispose()
    await rejected
    late.resolve(successResponse(request!, { late: true }))
    await Promise.resolve()

    const health = await transport.health()
    expect(health).toMatchObject({
      state: 'disposed',
      inFlightUnary: 0,
      openStreams: 0
    })
    expect(carrier.healthImpl).not.toHaveBeenCalled()
  })

  it('disposes carriers concurrently and remains bounded when one never settles', async () => {
    vi.useFakeTimers()
    try {
      const first = new FakeNativeCarrier('first', [capability('fixture.first')])
      const second = new FakeNativeCarrier('second', [capability('fixture.second')])
      const never = deferred<void>()
      first.disposeImpl = async () => await never.promise
      const transport = new NativeTransport({
        carriers: [first, second],
        policy: { maxTransportDisposeMs: 25 }
      })
      await transport.initialize()

      const disposeOne = transport.dispose()
      const disposeTwo = transport.dispose()
      expect(disposeOne).toBe(disposeTwo)
      await Promise.resolve()
      expect(first.disposeCalls).toBe(1)
      expect(second.disposeCalls).toBe(1)
      await vi.advanceTimersByTimeAsync(25)
      await disposeOne
      expect(transport.getState()).toBe('disposed')
      await expect(transport.invoke('fixture.second', 'echo', null)).rejects.toMatchObject({
        code: 'TRANSPORT_DISPOSED'
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not register a handshake that finishes after disposal starts', async () => {
    const carrier = new FakeNativeCarrier('fixture', [capability('fixture.echo')])
    const pending = deferred<ReturnType<(typeof carrier)['handshake']>>()
    carrier.handshakeImpl = async () => await pending.promise
    const transport = new NativeTransport({ carriers: [carrier] })
    const initializing = transport.initialize()
    const disposing = transport.dispose()
    pending.resolve(carrier.snapshot)

    await expect(initializing).rejects.toMatchObject({ code: 'TRANSPORT_DISPOSED' })
    await disposing
    expect(carrier.disposeCalls).toBeGreaterThan(0)
    expect(transport.getState()).toBe('disposed')
  })

  it('exposes carrier-scoped health without adding native.runtime to routes', async () => {
    const carrier = new FakeNativeCarrier('fixture', [capability('fixture.echo')])
    const transport = new NativeTransport({ carriers: [carrier] })
    await transport.initialize()
    const health = await transport.health()

    expect(health.carriers).toEqual([
      expect.objectContaining({
        carrierId: 'fixture',
        state: 'ready',
        response: expect.objectContaining({ ok: true })
      })
    ])
    await expect(transport.invoke('native.runtime', 'health', null)).rejects.toBeInstanceOf(
      NativeTransportError
    )
    await transport.dispose()
  })
})
