import { describe, expect, it, vi } from 'vitest'
import {
  HOST_PROTOCOL_VERSION,
  type HostMessageDirection,
  type HostMessageOwner
} from './plugin-host-wire'
import {
  PluginHostSession,
  PluginHostSessionError,
  type PluginHostPendingRequest
} from './plugin-host-session'

const owner: HostMessageOwner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'opaque-activation-handle',
  hostGeneration: 11
}

function message(value: Record<string, unknown>): Record<string, unknown> {
  return { ...owner, ...value }
}

function accept(
  session: PluginHostSession,
  direction: HostMessageDirection,
  value: Record<string, unknown>
) {
  return session.accept(direction, message(value))
}

function activate(session: PluginHostSession): void {
  accept(session, 'main-to-child', {
    type: 'host-init',
    requestId: 1,
    handshakeNonce: 'nonce-1'
  })
  accept(session, 'child-to-main', {
    type: 'host-ready',
    requestId: 1,
    handshakeNonce: 'nonce-1'
  })
  accept(session, 'main-to-child', {
    type: 'host-load',
    requestId: 2,
    payload: { script: 'encoded' }
  })
  accept(session, 'child-to-main', {
    type: 'load-result',
    requestId: 2,
    ok: true,
    result: { methods: ['onInit'] }
  })
}

describe('PluginHostSession', () => {
  it('owns an immutable identity and follows handshake -> ready -> loading -> active', () => {
    const mutableOwner = { ...owner }
    const session = new PluginHostSession({ owner: mutableOwner })
    mutableOwner.activationHandle = 'mutated'
    mutableOwner.hostGeneration = 99

    expect(session.owner).toEqual(owner)
    expect(Object.isFrozen(session.owner)).toBe(true)
    expect(session.state).toBe('handshake')

    accept(session, 'main-to-child', {
      type: 'host-init',
      requestId: 1,
      handshakeNonce: 'nonce-1'
    })
    expect(session.state).toBe('handshake')
    expect(session.pendingCount).toBe(1)

    accept(session, 'child-to-main', {
      type: 'host-ready',
      requestId: 1,
      handshakeNonce: 'nonce-1'
    })
    expect(session.state).toBe('ready')

    accept(session, 'main-to-child', { type: 'host-load', requestId: 2, payload: null })
    expect(session.state).toBe('loading')
    accept(session, 'child-to-main', {
      type: 'load-result',
      requestId: 2,
      ok: true,
      result: { methods: [] }
    })
    expect(session.state).toBe('active')
    expect(session.pendingCount).toBe(0)
  })

  it('snapshots nested codec limits at construction', () => {
    const limits = { maxDepth: 2 }
    const session = new PluginHostSession({ owner, codec: { limits } })
    limits.maxDepth = 32
    activate(session)

    expect(() =>
      accept(session, 'child-to-main', {
        type: 'capability-call',
        requestId: 3,
        capability: 'plugin.info.get',
        payload: { nested: { too: { deep: true } } }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_DEPTH' }))
  })

  it('admits host init and load at most once per activation', () => {
    const duplicateInit = new PluginHostSession({ owner })
    accept(duplicateInit, 'main-to-child', {
      type: 'host-init',
      requestId: 1,
      handshakeNonce: 'nonce-1'
    })
    expect(() =>
      accept(duplicateInit, 'main-to-child', {
        type: 'host-init',
        requestId: 2,
        handshakeNonce: 'nonce-2'
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_ILLEGAL_STATE' }))

    const duplicateLoad = new PluginHostSession({ owner })
    accept(duplicateLoad, 'main-to-child', {
      type: 'host-init',
      requestId: 1,
      handshakeNonce: 'nonce-1'
    })
    accept(duplicateLoad, 'child-to-main', {
      type: 'host-ready',
      requestId: 1,
      handshakeNonce: 'nonce-1'
    })
    accept(duplicateLoad, 'main-to-child', { type: 'host-load', requestId: 2, payload: null })
    accept(duplicateLoad, 'child-to-main', {
      type: 'load-result',
      requestId: 2,
      ok: false,
      error: { code: 'LOAD_FAILED' }
    })
    expect(duplicateLoad.state).toBe('closing')
    expect(() =>
      accept(duplicateLoad, 'main-to-child', {
        type: 'host-load',
        requestId: 3,
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_ILLEGAL_STATE' }))
  })

  it('rejects a ready message that does not echo the main-issued handshake nonce', () => {
    const session = new PluginHostSession({ owner })
    accept(session, 'main-to-child', {
      type: 'host-init',
      requestId: 1,
      handshakeNonce: 'nonce-main-issued'
    })

    expect(() =>
      accept(session, 'child-to-main', {
        type: 'host-ready',
        requestId: 1,
        handshakeNonce: 'nonce-child-selected'
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_HANDSHAKE_MISMATCH' }))
    expect(session.state).toBe('violated')
  })

  it('enforces legal state and direction without trusting child metadata', () => {
    const session = new PluginHostSession({ owner })
    expect(() =>
      session.accept('child-to-main', {
        ...message({ type: 'host-ready', requestId: 1, handshakeNonce: 'nonce-1' }),
        activationHandle: 'child-selected',
        pluginName: 'admin'
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_OWNER_MISMATCH' }))
    expect(session.state).toBe('violated')

    const active = new PluginHostSession({ owner })
    activate(active)
    expect(() =>
      accept(active, 'main-to-child', {
        type: 'host-load',
        requestId: 3,
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_ILLEGAL_STATE' }))
    expect(active.state).toBe('violated')
  })

  it('allows the same request id in the main and child request namespaces', () => {
    const session = new PluginHostSession({ owner })
    activate(session)
    accept(session, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onInit',
      payload: []
    })
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })
    expect(session.pendingCount).toBe(2)

    accept(session, 'child-to-main', {
      type: 'lifecycle-result',
      requestId: 3,
      ok: true,
      result: null
    })
    accept(session, 'main-to-child', {
      type: 'capability-result',
      requestId: 3,
      ok: true,
      result: null
    })
    expect(session.pendingCount).toBe(0)
  })

  it('rejects duplicate request ids within each request-origin namespace', () => {
    const duplicateMain = new PluginHostSession({ owner })
    activate(duplicateMain)
    accept(duplicateMain, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onInit',
      payload: []
    })
    expect(() =>
      accept(duplicateMain, 'main-to-child', {
        type: 'callback-call',
        requestId: 3,
        callbackId: 'callback-1',
        payload: []
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_DUPLICATE_REQUEST_ID' }))

    const duplicateChild = new PluginHostSession({ owner })
    activate(duplicateChild)
    accept(duplicateChild, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })
    expect(() =>
      accept(duplicateChild, 'child-to-main', {
        type: 'capability-call',
        requestId: 3,
        capability: 'plugin.info.get',
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_DUPLICATE_REQUEST_ID' }))
  })

  it('rejects mismatched response types', () => {
    const mismatch = new PluginHostSession({ owner })
    activate(mismatch)
    accept(mismatch, 'main-to-child', {
      type: 'callback-call',
      requestId: 3,
      callbackId: 'callback-1',
      payload: []
    })
    expect(() =>
      accept(mismatch, 'child-to-main', {
        type: 'lifecycle-result',
        requestId: 3,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_RESPONSE_MISMATCH' }))
  })

  it('correlates both main and child requests and rejects unknown responses', () => {
    const session = new PluginHostSession({ owner })
    activate(session)
    accept(session, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onFeatureTriggered',
      payload: []
    })
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 4,
      capability: 'plugin.info.get',
      payload: null
    })
    expect(session.pendingCount).toBe(2)

    accept(session, 'child-to-main', {
      type: 'lifecycle-result',
      requestId: 3,
      ok: true,
      result: null
    })
    accept(session, 'main-to-child', {
      type: 'capability-result',
      requestId: 4,
      ok: true,
      result: null
    })
    expect(session.pendingCount).toBe(0)

    expect(() =>
      accept(session, 'main-to-child', {
        type: 'capability-result',
        requestId: 99,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_UNKNOWN_RESPONSE' }))
  })

  it('rejects duplicate child requests before resolving payload handles', () => {
    const resolveCallback = vi.fn()
    const session = new PluginHostSession({ owner, codec: { resolveCallback } })
    activate(session)
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })

    expect(() =>
      accept(session, 'child-to-main', {
        type: 'capability-call',
        requestId: 3,
        capability: 'plugin.info.get',
        payload: { __tuffHostWire: 'callback', id: 'callback-1' }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_DUPLICATE_REQUEST_ID' }))
    expect(resolveCallback).not.toHaveBeenCalled()
  })

  it('rejects unknown child responses before resolving payload handles', () => {
    const resolveCallback = vi.fn()
    const session = new PluginHostSession({ owner, codec: { resolveCallback } })
    activate(session)

    expect(() =>
      accept(session, 'child-to-main', {
        type: 'lifecycle-result',
        requestId: 99,
        ok: true,
        result: { __tuffHostWire: 'callback', id: 'callback-1' }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_UNKNOWN_RESPONSE' }))
    expect(resolveCallback).not.toHaveBeenCalled()
  })

  it('rejects unknown main responses before resolving child resource handles', () => {
    const resolveResource = vi.fn(() => Object.freeze({ resource: true }))
    const session = new PluginHostSession({
      owner,
      endpoint: 'child',
      codec: { resolveResource }
    })
    activate(session)

    expect(() =>
      accept(session, 'main-to-child', {
        type: 'capability-result',
        requestId: 99,
        ok: true,
        result: {
          __tuffHostWire: 'resource',
          id: 'resource-unknown-response',
          kind: 'subscription'
        }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_UNKNOWN_RESPONSE' }))
    expect(resolveResource).not.toHaveBeenCalled()
  })

  it('cancels only main-origin work and rejects its late response', () => {
    const rejected = vi.fn()
    const session = new PluginHostSession({ owner, onPendingRejected: rejected })
    activate(session)
    accept(session, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onFeatureTriggered',
      payload: []
    })
    accept(session, 'main-to-child', { type: 'cancel', requestId: 4, targetRequestId: 3 })

    expect(session.pendingCount).toBe(1)
    expect(rejected).toHaveBeenCalledTimes(1)
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 3, requestType: 'lifecycle-call' }),
      new PluginHostSessionError('PLUGIN_HOST_SESSION_REQUEST_CANCELLED')
    )
    accept(session, 'child-to-main', {
      type: 'lifecycle-result',
      requestId: 3,
      ok: false,
      error: { code: 'PLUGIN_HOST_CHILD_CANCELLED' }
    })
    expect(session.pendingCount).toBe(0)
    expect(() =>
      accept(session, 'child-to-main', {
        type: 'lifecycle-result',
        requestId: 3,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_LATE_RESPONSE' }))
  })

  it('rejects cancellation of unknown or child-origin work', () => {
    const unknown = new PluginHostSession({ owner })
    activate(unknown)
    expect(() =>
      accept(unknown, 'main-to-child', { type: 'cancel', requestId: 3, targetRequestId: 99 })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_INVALID_CANCEL' }))

    const childOrigin = new PluginHostSession({ owner })
    activate(childOrigin)
    accept(childOrigin, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })
    expect(() =>
      accept(childOrigin, 'main-to-child', {
        type: 'cancel',
        requestId: 4,
        targetRequestId: 3
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_INVALID_CANCEL' }))
  })

  it('allows child cancellation only in the child-origin request namespace', () => {
    const rejected = vi.fn()
    const session = new PluginHostSession({ owner, onPendingRejected: rejected })
    activate(session)
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 30,
      capability: 'plugin.info.get',
      payload: null
    })

    accept(session, 'child-to-main', {
      type: 'cancel',
      requestId: 31,
      targetRequestId: 30
    })
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 30, requestType: 'capability-call' }),
      new PluginHostSessionError('PLUGIN_HOST_SESSION_REQUEST_CANCELLED')
    )
    accept(session, 'main-to-child', {
      type: 'capability-result',
      requestId: 30,
      ok: false,
      error: { code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' }
    })
    expect(session.pendingCount).toBe(0)
  })

  it('keeps equal numeric request and cancel ids isolated by origin direction', () => {
    const rejected = vi.fn()
    const session = new PluginHostSession({ owner, onPendingRejected: rejected })
    activate(session)
    accept(session, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 30,
      method: 'onFeatureTriggered',
      payload: []
    })
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 30,
      capability: 'plugin.info.get',
      payload: null
    })

    accept(session, 'main-to-child', {
      type: 'cancel',
      requestId: 31,
      targetRequestId: 30
    })
    expect(rejected).toHaveBeenCalledTimes(1)
    expect(rejected).toHaveBeenLastCalledWith(
      expect.objectContaining({ direction: 'main-to-child', requestId: 30 }),
      new PluginHostSessionError('PLUGIN_HOST_SESSION_REQUEST_CANCELLED')
    )

    accept(session, 'child-to-main', {
      type: 'cancel',
      requestId: 31,
      targetRequestId: 30
    })
    expect(rejected).toHaveBeenCalledTimes(2)
    expect(rejected).toHaveBeenLastCalledWith(
      expect.objectContaining({ direction: 'child-to-main', requestId: 30 }),
      new PluginHostSessionError('PLUGIN_HOST_SESSION_REQUEST_CANCELLED')
    )

    accept(session, 'child-to-main', {
      type: 'lifecycle-result',
      requestId: 30,
      ok: false,
      error: { code: 'PLUGIN_HOST_CHILD_CANCELLED' }
    })
    accept(session, 'main-to-child', {
      type: 'capability-result',
      requestId: 30,
      ok: false,
      error: { code: 'PLUGIN_HOST_CAPABILITY_CANCELLED' }
    })
    expect(session.pendingCount).toBe(0)
    expect(session.state).toBe('active')
  })

  it('accepts only the exact canonical cancellation result for each request kind', () => {
    const lifecycle = new PluginHostSession({ owner })
    activate(lifecycle)
    accept(lifecycle, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onFeatureTriggered',
      payload: []
    })
    accept(lifecycle, 'main-to-child', {
      type: 'cancel',
      requestId: 4,
      targetRequestId: 3
    })
    expect(() =>
      accept(lifecycle, 'child-to-main', {
        type: 'lifecycle-result',
        requestId: 3,
        ok: false,
        error: { code: 'ATTACKER_CANCELLED' }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_LATE_RESPONSE' }))

    const capability = new PluginHostSession({ owner })
    activate(capability)
    accept(capability, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })
    accept(capability, 'child-to-main', {
      type: 'cancel',
      requestId: 4,
      targetRequestId: 3
    })
    expect(() =>
      accept(capability, 'main-to-child', {
        type: 'capability-result',
        requestId: 3,
        ok: false,
        error: { code: 'PLUGIN_HOST_CHILD_CANCELLED' }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_LATE_RESPONSE' }))
  })

  it('abandons only the endpoint-owned outbound request and classifies its response as late', () => {
    const rejected = vi.fn()
    const session = new PluginHostSession({
      owner,
      endpoint: 'child',
      onPendingRejected: rejected
    })
    activate(session)
    accept(session, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onInit',
      payload: []
    })
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })

    expect(session.abandonRequest(3)).toBe(true)
    expect(session.abandonRequest(3)).toBe(false)
    expect(session.pendingCount).toBe(1)
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 3,
        requestType: 'capability-call',
        direction: 'child-to-main'
      }),
      new PluginHostSessionError('PLUGIN_HOST_SESSION_REQUEST_CANCELLED')
    )
    expect(() =>
      accept(session, 'main-to-child', {
        type: 'capability-result',
        requestId: 3,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_LATE_RESPONSE' }))
  })

  it('bounds pending requests before admitting more work', () => {
    const session = new PluginHostSession({ owner, maxPendingRequests: 1 })
    activate(session)
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })

    expect(() =>
      accept(session, 'main-to-child', {
        type: 'callback-call',
        requestId: 4,
        callbackId: 'callback-1',
        payload: []
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_PENDING_LIMIT' }))
  })

  it('bounds request history independently for main and child origins', () => {
    const mainHistory = new PluginHostSession({
      owner,
      maxPendingRequests: 2,
      maxTrackedRequestIds: 2
    })
    activate(mainHistory)
    expect(() =>
      accept(mainHistory, 'main-to-child', {
        type: 'lifecycle-call',
        requestId: 3,
        method: 'onInit',
        payload: []
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_REQUEST_LIMIT' }))

    const childHistory = new PluginHostSession({
      owner,
      maxPendingRequests: 2,
      maxTrackedRequestIds: 2
    })
    activate(childHistory)
    accept(childHistory, 'child-to-main', {
      type: 'capability-call',
      requestId: 1,
      capability: 'plugin.info.get',
      payload: null
    })
    accept(childHistory, 'main-to-child', {
      type: 'capability-result',
      requestId: 1,
      ok: true,
      result: null
    })
    accept(childHistory, 'child-to-main', {
      type: 'capability-call',
      requestId: 2,
      capability: 'plugin.info.get',
      payload: null
    })
    accept(childHistory, 'main-to-child', {
      type: 'capability-result',
      requestId: 2,
      ok: true,
      result: null
    })

    expect(() =>
      accept(childHistory, 'child-to-main', {
        type: 'capability-call',
        requestId: 3,
        capability: 'plugin.info.get',
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_REQUEST_LIMIT' }))
    expect(childHistory.state).toBe('violated')
    expect(childHistory.pendingCount).toBe(0)
  })

  it('rejects duplicate results as late in each request-origin namespace', () => {
    const mainResult = new PluginHostSession({ owner })
    activate(mainResult)
    accept(mainResult, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onInit',
      payload: []
    })
    accept(mainResult, 'child-to-main', {
      type: 'lifecycle-result',
      requestId: 3,
      ok: true,
      result: null
    })
    expect(() =>
      accept(mainResult, 'child-to-main', {
        type: 'lifecycle-result',
        requestId: 3,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_LATE_RESPONSE' }))

    const childResult = new PluginHostSession({ owner })
    activate(childResult)
    accept(childResult, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })
    accept(childResult, 'main-to-child', {
      type: 'capability-result',
      requestId: 3,
      ok: true,
      result: null
    })
    expect(() =>
      accept(childResult, 'main-to-child', {
        type: 'capability-result',
        requestId: 3,
        ok: true,
        result: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_LATE_RESPONSE' }))
  })

  it('applies callback codecs only to capability-call payloads with owner context', () => {
    const childCallback = vi.fn()
    const cancelToken = Object.freeze({ cancel: 'child-cancel-1' })
    const resource = Object.freeze({ resource: 'child-resource-1' })
    const resolveCallback = vi.fn(
      (resolvedOwner: HostMessageOwner, id: string, context: { messageType: string }) => {
        expect(resolvedOwner).toBe(mainSession.owner)
        expect(context.messageType).toBe('capability-call')
        return id === 'child-callback-1' ? childCallback : undefined
      }
    )
    const resolveCancel = vi.fn((resolvedOwner: HostMessageOwner, id: string) => {
      expect(resolvedOwner).toBe(mainSession.owner)
      return id === 'child-cancel-1' ? cancelToken : undefined
    })
    const resolveResource = vi.fn((resolvedOwner: HostMessageOwner, id: string, kind: string) => {
      expect(resolvedOwner).toBe(mainSession.owner)
      return id === 'child-resource-1' && kind === 'subscription' ? resource : undefined
    })
    const mainSession = new PluginHostSession({
      owner,
      codec: { resolveCallback, resolveCancel, resolveResource }
    })
    activate(mainSession)

    accept(mainSession, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 3,
      method: 'onInit',
      payload: null
    })
    const capabilityCall = accept(mainSession, 'child-to-main', {
      type: 'capability-call',
      requestId: 4,
      capability: 'plugin.info.get',
      payload: {
        callback: { __tuffHostWire: 'callback', id: 'child-callback-1' },
        cancel: { __tuffHostWire: 'cancel', id: 'child-cancel-1' },
        resource: {
          __tuffHostWire: 'resource',
          id: 'child-resource-1',
          kind: 'subscription'
        }
      }
    })
    expect(capabilityCall).toMatchObject({
      payload: { callback: childCallback, cancel: cancelToken, resource }
    })
    expect(resolveCallback).toHaveBeenCalledTimes(1)

    const lifecycleResult = accept(mainSession, 'child-to-main', {
      type: 'lifecycle-result',
      requestId: 3,
      ok: true,
      result: { __tuffHostWire: 'undefined' }
    })
    expect('result' in lifecycleResult && lifecycleResult.result).toBeUndefined()
    accept(mainSession, 'main-to-child', {
      type: 'capability-result',
      requestId: 4,
      ok: true,
      result: null
    })

    const registerCallback = vi.fn(
      (_resolvedOwner: HostMessageOwner, callback: unknown, context: { requestId: number }) => {
        expect(callback).toBe(childCallback)
        expect(context.requestId).toBe(7)
        return 'child-callback-registered'
      }
    )
    const unregisterCallback = vi.fn()
    const childSession = new PluginHostSession({
      owner,
      endpoint: 'child',
      codec: { registerCallback, unregisterCallback }
    })
    activate(childSession)
    const encodedCall = accept(childSession, 'child-to-main', {
      type: 'capability-call',
      requestId: 7,
      capability: 'plugin.info.get',
      payload: { callback: childCallback }
    })
    expect(encodedCall).toMatchObject({
      payload: {
        callback: { __tuffHostWire: 'callback', id: 'child-callback-registered' }
      }
    })
    expect(unregisterCallback).not.toHaveBeenCalled()

    const resultSession = new PluginHostSession({
      owner,
      endpoint: 'child',
      codec: { registerCallback, unregisterCallback }
    })
    activate(resultSession)
    accept(resultSession, 'main-to-child', {
      type: 'lifecycle-call',
      requestId: 8,
      method: 'onInit',
      payload: null
    })
    expect(() =>
      accept(resultSession, 'child-to-main', {
        type: 'lifecycle-result',
        requestId: 8,
        ok: true,
        result: childCallback
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_CALLBACK_UNSUPPORTED' }))
  })

  it('reports owner and codec violations once using only their stable code', () => {
    const ownerFatal = vi.fn()
    const ownerSession = new PluginHostSession({ owner, onFatalViolation: ownerFatal })
    expect(() =>
      ownerSession.accept('child-to-main', {
        ...message({ type: 'host-ready', requestId: 1, handshakeNonce: 'nonce-1' }),
        activationHandle: 'stale-handle'
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_OWNER_MISMATCH' }))
    expect(ownerFatal.mock.calls).toEqual([['PLUGIN_HOST_OWNER_MISMATCH']])
    expect(() =>
      accept(ownerSession, 'child-to-main', {
        type: 'host-ready',
        requestId: 1,
        handshakeNonce: 'nonce-1'
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_VIOLATED' }))
    expect(ownerFatal).toHaveBeenCalledTimes(1)

    const codecFatal = vi.fn()
    const codecSession = new PluginHostSession({
      owner,
      codec: { limits: { maxDepth: 2 } },
      onFatalViolation: codecFatal
    })
    activate(codecSession)
    expect(() =>
      accept(codecSession, 'child-to-main', {
        type: 'capability-call',
        requestId: 3,
        capability: 'plugin.info.get',
        payload: { nested: { too: { deep: true } } }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_DEPTH' }))
    expect(codecFatal.mock.calls).toEqual([['PLUGIN_HOST_WIRE_DEPTH']])
  })

  it('enters closing on shutdown and waits for the external close barrier', () => {
    const rejected: Array<[PluginHostPendingRequest, PluginHostSessionError]> = []
    const session = new PluginHostSession({
      owner,
      onPendingRejected: (pending, error) => rejected.push([pending, error])
    })
    activate(session)
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })
    const shutdown = { type: 'shutdown', requestId: 4 }
    accept(session, 'main-to-child', shutdown)

    expect(session.state).toBe('closing')
    expect(session.pendingCount).toBe(0)
    expect(rejected).toHaveLength(1)
    expect(rejected[0][0]).toMatchObject({ requestId: 3 })
    expect(rejected[0][1].code).toBe('PLUGIN_HOST_SESSION_SHUTTING_DOWN')

    expect(accept(session, 'main-to-child', shutdown)).toMatchObject(shutdown)
    expect(session.abandonRequest(3)).toBe(false)
    expect(session.state).toBe('closing')
    expect(rejected).toHaveLength(1)

    session.close()
    expect(session.state).toBe('closed')
    expect(rejected).toHaveLength(1)
  })

  it('accepts an exact stable violation DTO and reports its code once', () => {
    const rejected = vi.fn()
    const fatal = vi.fn()
    const session = new PluginHostSession({
      owner,
      onPendingRejected: rejected,
      onFatalViolation: fatal
    })
    activate(session)
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })

    expect(
      accept(session, 'child-to-main', {
        type: 'violation',
        requestId: 4,
        error: {
          code: 'PLUGIN_HOST_VIOLATION_PROTOCOL',
          message: 'child detail must not reach fatal callback',
          retryable: false
        }
      })
    ).toMatchObject({
      type: 'violation',
      error: { code: 'PLUGIN_HOST_VIOLATION_PROTOCOL' }
    })
    expect(session.state).toBe('violated')
    expect(session.pendingCount).toBe(0)
    expect(rejected).toHaveBeenCalledTimes(1)
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 3 }),
      new PluginHostSessionError('PLUGIN_HOST_SESSION_VIOLATED')
    )
    expect(fatal.mock.calls).toEqual([['PLUGIN_HOST_VIOLATION_PROTOCOL']])
    expect(() =>
      accept(session, 'child-to-main', {
        type: 'capability-call',
        requestId: 5,
        capability: 'plugin.info.get',
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_SESSION_VIOLATED' }))
    expect(rejected).toHaveBeenCalledTimes(1)
    expect(fatal).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['close', (session: PluginHostSession) => session.close(), 'closed'],
    ['violate', (session: PluginHostSession) => session.violate(), 'violated']
  ] as const)('%s rejects and clears pending exactly once', (_label, finish, state) => {
    const rejected = vi.fn()
    const session = new PluginHostSession({ owner, onPendingRejected: rejected })
    activate(session)
    accept(session, 'child-to-main', {
      type: 'capability-call',
      requestId: 3,
      capability: 'plugin.info.get',
      payload: null
    })
    accept(session, 'main-to-child', {
      type: 'callback-call',
      requestId: 4,
      callbackId: 'callback-1',
      payload: []
    })

    finish(session)
    finish(session)
    expect(session.state).toBe(state)
    expect(session.pendingCount).toBe(0)
    expect(rejected).toHaveBeenCalledTimes(2)
  })
})
