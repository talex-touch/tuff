import { describe, expect, it, vi } from 'vitest'
import {
  HostWireValueError,
  decodeHostWireValue,
  encodeHostWireValue,
  hostWireCancelHandle,
  hostWireResourceHandle
} from './plugin-host-wire-codec'

describe('plugin host wire codec', () => {
  it('roundtrips undefined, errors and typed arrays without exposing prototypes', () => {
    const encoded = encodeHostWireValue({
      absent: undefined,
      error: Object.assign(new Error('failed'), { code: 'STABLE_CODE' }),
      bytes: new Uint8Array([1, 2, 3])
    })
    const decoded = decodeHostWireValue(encoded) as Record<string, unknown>

    expect(Object.hasOwn(decoded, 'absent')).toBe(true)
    expect(decoded.absent).toBeUndefined()
    expect(decoded.error).toEqual({ code: 'STABLE_CODE', message: 'failed', name: 'Error' })
    expect(decoded.bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
  })

  it('roundtrips Error at the exact member limit without bulk descriptor allocation', () => {
    const descriptorSpy = vi.spyOn(Object, 'getOwnPropertyDescriptors')
    const error = new Error('x')
    const encoded = encodeHostWireValue(error, { limits: { maxMembers: 3 } })
    expect(decodeHostWireValue(encoded, { limits: { maxMembers: 3 } })).toEqual({
      message: 'x',
      name: 'Error'
    })
    expect(descriptorSpy).not.toHaveBeenCalledWith(error)
    descriptorSpy.mockRestore()
  })

  it('encodes callbacks, cancel tokens and resources as owner-resolved handles', () => {
    const callback = () => 'local-only'
    const encoded = encodeHostWireValue(
      {
        callback,
        cancel: hostWireCancelHandle('cancel-1'),
        resource: hostWireResourceHandle('resource-1', 'subscription')
      },
      {
        registerCallback: (value) => (value === callback ? 'callback-1' : 'wrong'),
        unregisterCallback: () => undefined
      }
    )

    const resolved = vi.fn()
    const decoded = decodeHostWireValue(encoded, {
      resolveCallback: (id) => (id === 'callback-1' ? resolved : undefined),
      resolveCancel: (id) => ({ cancelId: id }),
      resolveResource: (id, kind) => ({ id, kind })
    }) as Record<string, unknown>

    expect(decoded.callback).toBe(resolved)
    expect(decoded.cancel).toEqual({ cancelId: 'cancel-1' })
    expect(decoded.resource).toEqual({ id: 'resource-1', kind: 'subscription' })
  })

  it.each([
    ['bigint', 1n, 'PLUGIN_HOST_WIRE_UNSUPPORTED'],
    ['symbol', Symbol('x'), 'PLUGIN_HOST_WIRE_UNSUPPORTED'],
    ['class', new (class Unsafe {})(), 'PLUGIN_HOST_WIRE_NON_PLAIN_OBJECT'],
    ['map', new Map(), 'PLUGIN_HOST_WIRE_NON_PLAIN_OBJECT']
  ])('rejects unsupported %s values', (_label, value, code) => {
    expect(() => encodeHostWireValue(value)).toThrowError(expect.objectContaining({ code }))
  })

  it('rejects functions unless the callback registry owns them', () => {
    expect(() => encodeHostWireValue(() => undefined)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_CALLBACK_UNSUPPORTED' })
    )
  })

  it('rejects cycles, excessive depth, members and encoded byte size', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => encodeHostWireValue(cyclic)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_CYCLIC' })
    )

    expect(() => encodeHostWireValue({ a: { b: 1 } }, { limits: { maxDepth: 1 } })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_DEPTH' })
    )
    expect(() => encodeHostWireValue([1, 2], { limits: { maxMembers: 1 } })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_MEMBERS' })
    )
    expect(() => encodeHostWireValue('0123456789', { limits: { maxBytes: 8 } })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_BYTES' })
    )
  })

  it('rejects prototype-polluting keys during encode and forged handles during decode', () => {
    const polluted = Object.create(null) as Record<string, unknown>
    Object.defineProperty(polluted, '__proto__', { enumerable: true, value: { admin: true } })
    expect(() => encodeHostWireValue(polluted)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_FORBIDDEN_KEY' })
    )

    expect(() => decodeHostWireValue({ __tuffHostWire: 'callback', id: 'forged' })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_UNKNOWN_HANDLE' })
    )
  })

  it('redacts owner resolver failures behind a stable wire error', () => {
    const secret = '/private/plugin/path'
    let failure: unknown
    try {
      decodeHostWireValue(
        { __tuffHostWire: 'callback', id: 'callback-1' },
        {
          resolveCallback: () => {
            throw new Error(secret)
          }
        }
      )
    } catch (error) {
      failure = error
    }

    expect(failure).toEqual(new HostWireValueError('PLUGIN_HOST_WIRE_UNKNOWN_HANDLE'))
    expect(failure).not.toHaveProperty('message', expect.stringContaining(secret))
  })

  it('rejects callback handles whose owner resolver returns a non-function', () => {
    expect(() =>
      decodeHostWireValue(
        { __tuffHostWire: 'callback', id: 'callback-1' },
        {
          resolveCallback: (() => ({ forged: true })) as unknown as () => (
            ...args: unknown[]
          ) => unknown
        }
      )
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_UNKNOWN_HANDLE' }))
  })

  it('rolls back registered callbacks when a later registration fails', () => {
    const removed: string[] = []
    let sequence = 0
    expect(() =>
      encodeHostWireValue([() => undefined, () => undefined], {
        registerCallback: () => {
          sequence += 1
          if (sequence === 2) throw new Error('registry full')
          return `callback-${sequence}`
        },
        unregisterCallback: (id) => removed.push(id)
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_UNSUPPORTED' }))
    expect(removed).toEqual(['callback-1'])
  })

  it('rebuilds callback registry wire errors without attached diagnostics', () => {
    const injected = Object.assign(new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE'), {
      path: '/private/plugin/path'
    })
    let failure: unknown
    try {
      encodeHostWireValue(() => undefined, {
        registerCallback: () => {
          throw injected
        },
        unregisterCallback: () => undefined
      })
    } catch (error) {
      failure = error
    }

    expect(failure).toEqual(new HostWireValueError('PLUGIN_HOST_WIRE_INVALID_HANDLE'))
    expect(failure).not.toHaveProperty('path')
  })

  it('keeps callback rollback failures behind the original stable codec error', () => {
    let sequence = 0
    let failure: unknown
    try {
      encodeHostWireValue([() => undefined, () => undefined], {
        registerCallback: () => {
          sequence += 1
          if (sequence === 2) throw new Error('/private/registration-detail')
          return 'callback-1'
        },
        unregisterCallback: () => {
          throw new Error('/private/rollback-detail')
        }
      })
    } catch (error) {
      failure = error
    }

    expect(failure).toEqual(new HostWireValueError('PLUGIN_HOST_WIRE_UNSUPPORTED'))
    expect(failure).not.toHaveProperty('message', expect.stringContaining('/private'))
  })

  it('rolls back callbacks whose registry returns an invalid id', () => {
    const removed: string[] = []
    expect(() =>
      encodeHostWireValue(() => undefined, {
        registerCallback: () => '',
        unregisterCallback: (id) => removed.push(id)
      })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_INVALID_HANDLE' }))
    expect(removed).toEqual([''])
  })

  it('counts UTF-8 handle bytes and rejects invalid resource kinds at construction', () => {
    const multibyteId = '界'.repeat(40)
    expect(() =>
      encodeHostWireValue(hostWireCancelHandle(multibyteId), { limits: { maxBytes: 160 } })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_BYTES' }))

    expect(() => hostWireResourceHandle('resource-1', 'bogus' as 'stream')).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_INVALID_HANDLE' })
    )
  })

  it('rejects overlong handles before scanning their UTF-8 bytes', () => {
    const byteLength = vi.spyOn(Buffer, 'byteLength')
    try {
      expect(() => hostWireCancelHandle('x'.repeat(1024 * 1024))).toThrowError(
        expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_INVALID_HANDLE' })
      )
      expect(byteLength).not.toHaveBeenCalled()
    } finally {
      byteLength.mockRestore()
    }
  })

  it('rejects oversized strings before scanning their UTF-8 bytes', () => {
    const byteLength = vi.spyOn(Buffer, 'byteLength')
    try {
      expect(() =>
        encodeHostWireValue('x'.repeat(1024 * 1024), { limits: { maxBytes: 64 } })
      ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_BYTES' }))
      expect(byteLength).not.toHaveBeenCalled()
    } finally {
      byteLength.mockRestore()
    }
  })

  it('rejects oversized arrays before inspecting their elements', () => {
    const oversized = new Array(2)
    Object.defineProperty(oversized, '0', {
      enumerable: true,
      get: () => {
        throw new Error('must not inspect after member rejection')
      }
    })
    expect(() => encodeHostWireValue(oversized, { limits: { maxMembers: 1 } })).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_MEMBERS' })
    )
  })

  it('rejects non-canonical markers and non-finite decoded numbers', () => {
    expect(() =>
      decodeHostWireValue({ __tuffHostWire: 'undefined', extra: { deep: true } })
    ).toThrowError(expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_INVALID_HANDLE' }))
    expect(() => decodeHostWireValue(Number.NaN)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_UNSUPPORTED' })
    )
  })

  it('does not execute array or Error accessors while validating', () => {
    const array: unknown[] = []
    Object.defineProperty(array, '0', {
      enumerable: true,
      get: () => {
        throw new Error('must not execute')
      }
    })
    Object.defineProperty(array, 'length', { value: 1 })
    expect(() => encodeHostWireValue(array)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_ACCESSOR' })
    )

    const error = new Error('safe')
    Object.defineProperty(error, 'code', {
      enumerable: true,
      get: () => {
        throw new Error('must not execute')
      }
    })
    expect(() => encodeHostWireValue(error)).toThrowError(
      expect.objectContaining({ code: 'PLUGIN_HOST_WIRE_ACCESSOR' })
    )
  })

  it('uses stable errors without serializing rejected values', () => {
    const secret = 'secret-value-that-must-not-appear'
    try {
      encodeHostWireValue(new Map([[secret, secret]]))
      throw new Error('expected encode to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(HostWireValueError)
      expect((error as Error).message).not.toContain(secret)
    }
  })
})
