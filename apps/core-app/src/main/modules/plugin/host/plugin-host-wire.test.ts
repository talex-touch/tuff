import { describe, expect, it, vi } from 'vitest'
import {
  HOST_PROTOCOL_VERSION,
  HostProtocolError,
  parseHostMessage,
  type HostMessageDirection
} from './plugin-host-wire'

const owner = {
  protocolVersion: HOST_PROTOCOL_VERSION,
  activationHandle: 'activation-opaque-handle',
  hostGeneration: 4
} as const

function parse(direction: HostMessageDirection, message: Record<string, unknown>) {
  return parseHostMessage(direction, owner, { ...owner, ...message })
}

describe('plugin host wire protocol', () => {
  it.each([
    ['host-init', 'main-to-child', { type: 'host-init', requestId: 1, handshakeNonce: 'nonce-1' }],
    [
      'host-ready',
      'child-to-main',
      { type: 'host-ready', requestId: 1, handshakeNonce: 'nonce-1' }
    ],
    ['host-load', 'main-to-child', { type: 'host-load', requestId: 2, payload: { encoded: true } }],
    [
      'load-result success',
      'child-to-main',
      { type: 'load-result', requestId: 2, ok: true, result: { methods: ['onInit'] } }
    ],
    [
      'lifecycle-call',
      'main-to-child',
      { type: 'lifecycle-call', requestId: 3, method: 'onInit', payload: [] }
    ],
    [
      'lifecycle-result failure',
      'child-to-main',
      { type: 'lifecycle-result', requestId: 3, ok: false, error: { code: 'INIT_FAILED' } }
    ],
    [
      'callback-call',
      'main-to-child',
      { type: 'callback-call', requestId: 4, callbackId: 'callback-1', payload: ['value'] }
    ],
    [
      'callback-result',
      'child-to-main',
      { type: 'callback-result', requestId: 4, ok: true, result: undefined }
    ],
    ['cancel', 'main-to-child', { type: 'cancel', requestId: 6, targetRequestId: 7 }],
    ['capability cancel', 'child-to-main', { type: 'cancel', requestId: 7, targetRequestId: 6 }],
    [
      'resource-dispose',
      'child-to-main',
      {
        type: 'resource-dispose',
        requestId: 8,
        resourceId: 'resource-1',
        resourceKind: 'subscription'
      }
    ],
    ['shutdown', 'main-to-child', { type: 'shutdown', requestId: 9 }],
    [
      'violation',
      'child-to-main',
      {
        type: 'violation',
        requestId: 10,
        error: { code: 'PLUGIN_HOST_VIOLATION_PROTOCOL', retryable: false }
      }
    ]
  ])('accepts exact %s messages', (_label, direction, message) => {
    expect(
      parse(direction as HostMessageDirection, message as Record<string, unknown>)
    ).toMatchObject(message)
  })

  it('accepts fixed capability calls from child to main', () => {
    expect(
      parse('child-to-main', {
        type: 'capability-call',
        requestId: 7,
        capability: 'storage.file.read',
        payload: { path: 'state.json' }
      })
    ).toMatchObject({ capability: 'storage.file.read', requestId: 7 })
  })

  it('rejects arbitrary capability paths and message directions', () => {
    expect(() =>
      parse('child-to-main', {
        type: 'capability-call',
        requestId: 1,
        capability: 'constructor.constructor',
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_UNKNOWN_CAPABILITY' }))

    expect(() =>
      parse('main-to-child', {
        type: 'capability-call',
        requestId: 1,
        capability: 'storage.file.read',
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WRONG_DIRECTION' }))
  })

  it.each([
    ['wrong version', { protocolVersion: 1 }, 'PLUGIN_HOST_PROTOCOL_VERSION'],
    ['missing handle', { activationHandle: '' }, 'PLUGIN_HOST_INVALID_OWNER'],
    ['invalid generation', { hostGeneration: 0 }, 'PLUGIN_HOST_INVALID_OWNER'],
    ['invalid request', { requestId: -1 }, 'PLUGIN_HOST_INVALID_REQUEST_ID']
  ])('rejects %s', (_label, override, code) => {
    expect(() =>
      parseHostMessage('child-to-main', owner, {
        ...owner,
        type: 'capability-call',
        requestId: 1,
        capability: 'storage.file.read',
        payload: null,
        ...override
      })
    ).toThrowError(expect.objectContaining({ code }))
  })

  it('rejects owner mismatch before dispatch', () => {
    expect(() =>
      parseHostMessage('child-to-main', owner, {
        ...owner,
        activationHandle: 'attacker-selected',
        hostGeneration: 999,
        type: 'capability-call',
        requestId: 1,
        capability: 'storage.file.read',
        payload: null
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_OWNER_MISMATCH' }))
  })

  it('rejects malformed and ambiguous discriminants', () => {
    expect(() =>
      parse('child-to-main', {
        type: 'capability-call',
        requestId: 1,
        capability: 'storage.file.read',
        payload: null,
        result: 'unexpected-control-field'
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_INVALID_MESSAGE' }))

    expect(() =>
      parseHostMessage('main-to-child', owner, {
        ...owner,
        type: 'capability-result',
        requestId: 1,
        ok: false,
        error: { code: 'DENIED' },
        result: 'ambiguous'
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_INVALID_MESSAGE' }))
  })

  it('rejects unstable error codes that could carry native diagnostics', () => {
    expect(() =>
      parse('child-to-main', {
        type: 'lifecycle-result',
        requestId: 1,
        ok: false,
        error: { code: 'SECRET:/private/path' }
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_INVALID_MESSAGE' }))
  })

  it('rejects extra enumerable fields before allocating an exhaustive key list', () => {
    const ownKeys = vi.spyOn(Reflect, 'ownKeys')
    try {
      const oversized: Record<string, unknown> = {
        ...owner,
        type: 'shutdown',
        requestId: 1
      }
      for (let index = 0; index < 10_000; index++) oversized[`extra-${index}`] = index

      expect(() => parseHostMessage('main-to-child', owner, oversized)).toThrowError(
        expect.objectContaining({ code: 'PLUGIN_HOST_INVALID_MESSAGE' })
      )
      expect(ownKeys).not.toHaveBeenCalled()
    } finally {
      ownKeys.mockRestore()
    }
  })

  it.each([
    [
      'arbitrary lifecycle method',
      'main-to-child',
      { type: 'lifecycle-call', requestId: 1, method: 'constructor', payload: [] },
      'PLUGIN_HOST_UNKNOWN_LIFECYCLE'
    ],
    [
      'arbitrary resource kind',
      'child-to-main',
      {
        type: 'resource-dispose',
        requestId: 1,
        resourceId: 'resource-1',
        resourceKind: 'database'
      },
      'PLUGIN_HOST_UNKNOWN_RESOURCE_KIND'
    ],
    [
      'arbitrary violation code',
      'child-to-main',
      { type: 'violation', requestId: 1, error: { code: 'SECRET_PATH' } },
      'PLUGIN_HOST_UNKNOWN_VIOLATION'
    ],
    [
      'wrong handshake direction',
      'child-to-main',
      { type: 'host-init', requestId: 1, handshakeNonce: 'nonce-1' },
      'PLUGIN_HOST_WRONG_DIRECTION'
    ],
    [
      'extra load control field',
      'main-to-child',
      { type: 'host-load', requestId: 1, payload: null, pluginName: 'attacker-selected' },
      'PLUGIN_HOST_INVALID_MESSAGE'
    ],
    [
      'malformed cancel target',
      'main-to-child',
      { type: 'cancel', requestId: 1, targetRequestId: -1 },
      'PLUGIN_HOST_INVALID_REQUEST_ID'
    ],
    [
      'shutdown result extension',
      'child-to-main',
      { type: 'shutdown-result', requestId: 1, ok: true },
      'PLUGIN_HOST_UNKNOWN_MESSAGE'
    ],
    [
      'non-DTO violation',
      'child-to-main',
      { type: 'violation', requestId: 1, code: 'PLUGIN_HOST_VIOLATION_PROTOCOL' },
      'PLUGIN_HOST_INVALID_MESSAGE'
    ],
    [
      'violation error with extra diagnostics',
      'child-to-main',
      {
        type: 'violation',
        requestId: 1,
        error: { code: 'PLUGIN_HOST_VIOLATION_PROTOCOL', nativePath: '/private/plugin.js' }
      },
      'PLUGIN_HOST_INVALID_MESSAGE'
    ]
  ])('rejects %s', (_label, direction, message, code) => {
    expect(() =>
      parse(direction as HostMessageDirection, message as Record<string, unknown>)
    ).toThrowError(expect.objectContaining({ code }))
  })

  it('does not execute message or expected-owner control-field accessors', () => {
    const message = {
      ...owner,
      type: 'shutdown',
      requestId: 1
    }
    Object.defineProperty(message, 'requestId', {
      enumerable: true,
      get: () => {
        throw new Error('must not execute')
      }
    })
    const expectedOwner = { ...owner }
    const readExpectedHandle = vi.fn(() => owner.activationHandle)
    Object.defineProperty(expectedOwner, 'activationHandle', {
      enumerable: true,
      get: readExpectedHandle
    })

    expect(() => parseHostMessage('main-to-child', owner, message)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_INVALID_MESSAGE' })
    )
    expect(() =>
      parseHostMessage('main-to-child', expectedOwner, {
        ...owner,
        type: 'shutdown',
        requestId: 1
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_INVALID_MESSAGE' }))
    expect(readExpectedHandle).not.toHaveBeenCalled()
  })

  it('uses stable redacted protocol errors', () => {
    try {
      parseHostMessage('child-to-main', owner, { type: 'unknown', secret: 'do-not-copy' })
      throw new Error('expected parse to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(HostProtocolError)
      expect((error as HostProtocolError).code).toBe('PLUGIN_HOST_PROTOCOL_VERSION')
      expect((error as Error).message).not.toContain('do-not-copy')
    }
  })
})
