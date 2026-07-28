import { describe, expect, it, vi } from 'vitest'
import { PluginHostSession } from './plugin-host-session'
import {
  PluginHostChildCapabilityClient,
  PluginHostChildCapabilityError
} from './plugin-host-child-capabilities'
import {
  HOST_PROTOCOL_VERSION,
  type HostMessageOwner,
  type HostWireMessage
} from './plugin-host-wire'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'child-capability-owner',
  hostGeneration: 11
}

function activeSession(): PluginHostSession {
  const session = new PluginHostSession({ owner, endpoint: 'child' })
  session.accept('main-to-child', {
    ...owner,
    type: 'host-init',
    requestId: 1,
    handshakeNonce: 'nonce'
  })
  session.accept('child-to-main', {
    ...owner,
    type: 'host-ready',
    requestId: 1,
    handshakeNonce: 'nonce'
  })
  session.accept('main-to-child', {
    ...owner,
    type: 'host-load',
    requestId: 2,
    payload: null
  })
  session.accept('child-to-main', {
    ...owner,
    type: 'load-result',
    requestId: 2,
    ok: true,
    result: null
  })
  return session
}

function createClient(overrides: { timeoutMs?: number } = {}) {
  const session = activeSession()
  const sent: HostWireMessage[] = []
  let nextRequestId = 10
  const onFatalViolation = vi.fn()
  const client = new PluginHostChildCapabilityClient({
    owner,
    session,
    capabilityManifest: [
      { id: 'plugin.info.get', callbackLifetime: 'transient', callbackFields: [] },
      { id: 'storage.file.read', callbackLifetime: 'transient', callbackFields: [] }
    ],
    timeoutMs: overrides.timeoutMs,
    allocateRequestId: () => ++nextRequestId,
    postMessage(message) {
      sent.push(message as HostWireMessage)
    },
    onFatalViolation
  })
  return { client, session, sent, onFatalViolation }
}

describe('PluginHostChildCapabilityClient', () => {
  it('correlates concurrent fixed capability calls by request id', async () => {
    const harness = createClient()
    const first = harness.client.invoke('plugin.info.get', { sequence: 1 })
    const second = harness.client.invoke('storage.file.read', { sequence: 2 })
    const [firstCall, secondCall] = harness.sent

    harness.client.acceptResult(
      harness.session.accept('main-to-child', {
        ...owner,
        type: 'capability-result',
        requestId: secondCall.requestId,
        ok: true,
        result: { sequence: 2 }
      })
    )
    harness.client.acceptResult(
      harness.session.accept('main-to-child', {
        ...owner,
        type: 'capability-result',
        requestId: firstCall.requestId,
        ok: true,
        result: { sequence: 1 }
      })
    )

    await expect(first).resolves.toEqual({ sequence: 1 })
    await expect(second).resolves.toEqual({ sequence: 2 })
    expect(harness.client.pendingCount).toBe(0)
  })

  it.each([
    ['unknown fixed id', 'constructor.constructor', 'PLUGIN_HOST_UNKNOWN_CAPABILITY'],
    ['unlisted fixed id', 'clipboard.read', 'PLUGIN_HOST_CAPABILITY_NOT_DECLARED']
  ])('rejects %s without sending', async (_label, capability, code) => {
    const harness = createClient()

    await expect(harness.client.invoke(capability, null)).rejects.toEqual(
      new PluginHostChildCapabilityError(code)
    )
    expect(harness.sent).toEqual([])
  })

  it('propagates only the stable main error code', async () => {
    const harness = createClient()
    const pending = harness.client.invoke('plugin.info.get', null)
    const call = harness.sent[0]

    harness.client.acceptResult(
      harness.session.accept('main-to-child', {
        ...owner,
        type: 'capability-result',
        requestId: call.requestId,
        ok: false,
        error: { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' }
      })
    )

    await expect(pending).rejects.toEqual(
      new PluginHostChildCapabilityError('PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    )
  })

  it('rejects timeout, cancellation, and shutdown pending work deterministically', async () => {
    vi.useFakeTimers()
    try {
      const timed = createClient({ timeoutMs: 5 })
      const timeout = timed.client.invoke('plugin.info.get', null)
      const timeoutAssertion = expect(timeout).rejects.toEqual(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_TIMEOUT')
      )
      await vi.advanceTimersByTimeAsync(5)
      await timeoutAssertion
      expect(timed.onFatalViolation).toHaveBeenCalledWith('PLUGIN_HOST_VIOLATION_PROTOCOL')

      const cancelled = createClient()
      const cancellation = cancelled.client.invoke('plugin.info.get', null)
      cancelled.client.cancelAll()
      await expect(cancellation).rejects.toEqual(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED')
      )

      const closed = createClient()
      const shutdown = closed.client.invoke('plugin.info.get', null)
      closed.client.close()
      await expect(shutdown).rejects.toEqual(
        new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_CLOSED')
      )
      expect(closed.client.pendingCount).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels only capability calls owned by one lifecycle scope', async () => {
    const harness = createClient()
    const first = harness.client.invoke('plugin.info.get', { sequence: 1 }, 101)
    const second = harness.client.invoke('storage.file.read', { sequence: 2 }, 202)
    const [firstCall, secondCall] = harness.sent

    harness.client.cancelScope(101)

    await expect(first).rejects.toEqual(
      new PluginHostChildCapabilityError('PLUGIN_HOST_CHILD_CAPABILITY_CANCELLED')
    )
    expect(harness.sent.at(-1)).toMatchObject({
      type: 'cancel',
      targetRequestId: firstCall.requestId
    })
    expect(harness.client.pendingCount).toBe(1)

    harness.client.acceptResult(
      harness.session.accept('main-to-child', {
        ...owner,
        type: 'capability-result',
        requestId: firstCall.requestId,
        ok: false,
        error: { code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' }
      })
    )
    harness.client.acceptResult(
      harness.session.accept('main-to-child', {
        ...owner,
        type: 'capability-result',
        requestId: secondCall.requestId,
        ok: true,
        result: 'second-result'
      })
    )
    await expect(second).resolves.toBe('second-result')
    expect(harness.client.pendingCount).toBe(0)
    expect(harness.onFatalViolation).not.toHaveBeenCalled()
  })

  it('does not preempt main-owned IO deadlines with the transport fallback', async () => {
    vi.useFakeTimers()
    try {
      const harness = createClient()
      const pending = harness.client.invoke('storage.file.read', null)
      const call = harness.sent[0]

      await vi.advanceTimersByTimeAsync(30_000)
      expect(harness.client.pendingCount).toBe(1)
      expect(harness.onFatalViolation).not.toHaveBeenCalled()

      harness.client.acceptResult(
        harness.session.accept('main-to-child', {
          ...owner,
          type: 'capability-result',
          requestId: call.requestId,
          ok: true,
          result: 'slow-io-result'
        })
      )
      await expect(pending).resolves.toBe('slow-io-result')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects wrong-owner, stale-generation, and malformed results before correlation', async () => {
    const wrongOwner = createClient()
    const wrongOwnerPending = wrongOwner.client.invoke('plugin.info.get', null)
    const wrongOwnerCall = wrongOwner.sent[0]
    expect(() =>
      wrongOwner.session.accept('main-to-child', {
        ...owner,
        activationHandle: 'stale-owner',
        type: 'capability-result',
        requestId: wrongOwnerCall.requestId,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_OWNER_MISMATCH' }))
    wrongOwner.client.close()
    await expect(wrongOwnerPending).rejects.toBeInstanceOf(PluginHostChildCapabilityError)

    const staleGeneration = createClient()
    const stalePending = staleGeneration.client.invoke('plugin.info.get', null)
    const staleCall = staleGeneration.sent[0]
    expect(() =>
      staleGeneration.session.accept('main-to-child', {
        ...owner,
        hostGeneration: owner.hostGeneration + 1,
        type: 'capability-result',
        requestId: staleCall.requestId,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_OWNER_MISMATCH' }))
    staleGeneration.client.close()
    await expect(stalePending).rejects.toBeInstanceOf(PluginHostChildCapabilityError)

    const malformed = createClient()
    const malformedPending = malformed.client.invoke('plugin.info.get', null)
    const malformedCall = malformed.sent[0]
    expect(() =>
      malformed.session.accept('main-to-child', {
        ...owner,
        type: 'capability-result',
        requestId: malformedCall.requestId,
        ok: true,
        result: { smuggled: () => undefined }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_UNSUPPORTED' }))
    malformed.client.close()
    await expect(malformedPending).rejects.toBeInstanceOf(PluginHostChildCapabilityError)
  })

  it('fails closed on an unknown, duplicate, or late result', async () => {
    const unknown = createClient()
    unknown.client.acceptResult({
      ...owner,
      type: 'capability-result',
      requestId: 999,
      ok: true,
      result: null
    })
    expect(unknown.onFatalViolation).toHaveBeenCalledWith('PLUGIN_HOST_VIOLATION_PROTOCOL')

    const duplicate = createClient()
    const pending = duplicate.client.invoke('plugin.info.get', null)
    const call = duplicate.sent[0]
    const result = duplicate.session.accept('main-to-child', {
      ...owner,
      type: 'capability-result',
      requestId: call.requestId,
      ok: true,
      result: null
    })
    duplicate.client.acceptResult(result)
    await pending
    duplicate.client.acceptResult(result)
    expect(duplicate.onFatalViolation).toHaveBeenCalledWith('PLUGIN_HOST_VIOLATION_PROTOCOL')

    const late = createClient()
    const cancelled = late.client.invoke('plugin.info.get', null)
    const lateCall = late.sent[0]
    late.client.cancelAll()
    await expect(cancelled).rejects.toBeInstanceOf(PluginHostChildCapabilityError)
    late.client.acceptResult({
      ...owner,
      type: 'capability-result',
      requestId: lateCall.requestId,
      ok: true,
      result: null
    })
    expect(late.onFatalViolation).toHaveBeenCalledWith('PLUGIN_HOST_VIOLATION_PROTOCOL')
  })
})
