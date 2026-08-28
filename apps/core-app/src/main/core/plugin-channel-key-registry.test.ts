import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginChannelKeyRegistry } from './plugin-channel-key-registry'

/**
 * The per-plugin channel key lifecycle (#929).
 *
 * Every test that touched requestKey/revokeKey/isValidKey/resolveIdentity replaced them with
 * vi.fn(), so the rotation logic itself had never run. The failure that matters: if the
 * activation comparison stops distinguishing generations, requestKey hands back the previous
 * generation's key after a plugin reload, the stale key stays valid, and a disabled activation
 * keeps sending on a channel it should have lost.
 */
const activation = (pluginInstanceId: string, activationGeneration: number) => ({
  pluginInstanceId,
  activationGeneration
})

describe('key issuance', () => {
  let registry: PluginChannelKeyRegistry

  beforeEach(() => {
    registry = new PluginChannelKeyRegistry()
  })

  it('issues a key that resolves back to the plugin', () => {
    // Positive control: a registry issuing nothing usable would satisfy every rotation
    // assertion below while breaking every plugin channel.
    const key = registry.requestKey('demo', activation('instance-1', 1))

    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(registry.isValidKey(key)).toBe(true)
    expect(registry.resolveKey(key)).toBe('demo')
    expect(registry.resolveIdentity(key)).toMatchObject({
      name: 'demo',
      pluginInstanceId: 'instance-1',
      activationGeneration: 1
    })
  })

  it('returns the same key for the same activation', () => {
    const first = registry.requestKey('demo', activation('instance-1', 1))
    expect(registry.requestKey('demo', activation('instance-1', 1))).toBe(first)
  })

  it('rotates when the activation generation advances', () => {
    // A plugin reload. The old key must stop working.
    const first = registry.requestKey('demo', activation('instance-1', 1))
    const second = registry.requestKey('demo', activation('instance-1', 2))

    expect(second).not.toBe(first)
    expect(registry.isValidKey(first)).toBe(false)
    expect(registry.resolveIdentity(first)).toBeUndefined()
    expect(registry.resolveKey(first)).toBeUndefined()
  })

  it('rotates when the plugin instance changes', () => {
    // Same generation number, different instance — reinstalled rather than reloaded.
    const first = registry.requestKey('demo', activation('instance-1', 1))
    const second = registry.requestKey('demo', activation('instance-2', 1))

    expect(second).not.toBe(first)
    expect(registry.isValidKey(first)).toBe(false)
  })

  it('leaves no stale entry in any map after rotation', () => {
    // A key dropped from one map but left in another is the injection this prevents.
    const first = registry.requestKey('demo', activation('instance-1', 1))
    const second = registry.requestKey('demo', activation('instance-1', 2))

    expect(registry.resolveKey(first)).toBeUndefined()
    expect(registry.resolveIdentity(first)).toBeUndefined()
    expect(registry.isValidKey(first)).toBe(false)
    expect(registry.keyForName('demo')).toBe(second)
    expect(registry.resolveCurrentIdentity('demo')).toMatchObject({ activationGeneration: 2 })
  })

  it('keeps different plugins on different keys', () => {
    const first = registry.requestKey('alpha', activation('instance-a', 1))
    const second = registry.requestKey('beta', activation('instance-b', 1))

    expect(second).not.toBe(first)
    expect(registry.resolveKey(first)).toBe('alpha')
    expect(registry.resolveKey(second)).toBe('beta')
  })

  it('treats a caller with no activation as matching whatever is current', () => {
    // The legacy requestKey(name) path must not rotate a live key out from under its owner.
    const first = registry.requestKey('demo', activation('instance-1', 1))
    expect(registry.requestKey('demo')).toBe(first)
  })

  it('defaults an activation-less first request rather than failing', () => {
    const key = registry.requestKey('legacy-plugin')
    expect(registry.resolveIdentity(key)).toMatchObject({
      pluginInstanceId: 'legacy:legacy-plugin',
      activationGeneration: 1
    })
  })
})

describe('key revocation', () => {
  let registry: PluginChannelKeyRegistry

  beforeEach(() => {
    registry = new PluginChannelKeyRegistry()
  })

  it('invalidates the key and every lookup through it', () => {
    const key = registry.requestKey('demo', activation('instance-1', 1))

    expect(registry.revokeKey(key)).toBe(true)
    expect(registry.isValidKey(key)).toBe(false)
    expect(registry.resolveKey(key)).toBeUndefined()
    expect(registry.resolveIdentity(key)).toBeUndefined()
    expect(registry.resolveCurrentIdentity('demo')).toBeUndefined()
    expect(registry.keyForName('demo')).toBeUndefined()
  })

  it('reports whether anything was revoked', () => {
    const key = registry.requestKey('demo', activation('instance-1', 1))

    expect(registry.revokeKey(key)).toBe(true)
    expect(registry.revokeKey(key)).toBe(false)
    expect(registry.revokeKey('0'.repeat(32))).toBe(false)
  })

  it('lets the plugin obtain a fresh key afterwards', () => {
    // Revocation must not lock a plugin out permanently.
    const key = registry.requestKey('demo', activation('instance-1', 1))
    registry.revokeKey(key)
    const reissued = registry.requestKey('demo', activation('instance-1', 2))

    expect(reissued).not.toBe(key)
    expect(registry.isValidKey(reissued)).toBe(true)
  })

  it('does not disturb another plugin', () => {
    const alpha = registry.requestKey('alpha', activation('instance-a', 1))
    const beta = registry.requestKey('beta', activation('instance-b', 1))

    registry.revokeKey(alpha)

    expect(registry.isValidKey(beta)).toBe(true)
    expect(registry.resolveKey(beta)).toBe('beta')
  })
})

describe('identity invalidation notifications', () => {
  let registry: PluginChannelKeyRegistry

  beforeEach(() => {
    registry = new PluginChannelKeyRegistry()
  })

  it('notifies only a real rotation or revocation', () => {
    const listener = vi.fn()
    registry.watchIdentityInvalidated(listener)

    const first = registry.requestKey('demo', activation('instance-1', 1))
    expect(registry.requestKey('demo', activation('instance-1', 1))).toBe(first)
    expect(registry.requestKey('demo')).toBe(first)
    expect(registry.revokeKey('0'.repeat(32))).toBe(false)
    expect(listener).not.toHaveBeenCalled()

    const second = registry.requestKey('demo', activation('instance-1', 2))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: first, activationGeneration: 1 })
    )

    expect(registry.revokeKey(second)).toBe(true)
    expect(registry.revokeKey(second)).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: second, activationGeneration: 2 })
    )
  })

  it('publishes rotation only after the replacement identity is current', () => {
    const listener = vi.fn((identity: Readonly<PluginActivationIdentity>) => {
      expect(Object.isFrozen(identity)).toBe(true)
      expect(registry.resolveIdentity(identity.key)).toBeUndefined()
      expect(registry.resolveCurrentIdentity(identity.name)).toMatchObject({
        activationGeneration: 2
      })
      expect(registry.resolveCurrentIdentity(identity.name)?.key).not.toBe(identity.key)
    })
    registry.watchIdentityInvalidated(listener)

    const first = registry.requestKey('demo', activation('instance-1', 1))
    registry.requestKey('demo', activation('instance-1', 2))

    expect(listener).toHaveBeenCalledOnce()
    expect(listener.mock.calls[0]?.[0].key).toBe(first)
  })

  it('publishes revocation only after every lookup is invalid', () => {
    const listener = vi.fn((identity: Readonly<PluginActivationIdentity>) => {
      expect(registry.resolveIdentity(identity.key)).toBeUndefined()
      expect(registry.resolveKey(identity.key)).toBeUndefined()
      expect(registry.resolveCurrentIdentity(identity.name)).toBeUndefined()
      expect(registry.keyForName(identity.name)).toBeUndefined()
    })
    registry.watchIdentityInvalidated(listener)

    const key = registry.requestKey('demo', activation('instance-1', 1))
    expect(registry.revokeKey(key)).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('isolates mutation and errors from later listeners', () => {
    const observed = vi.fn()
    registry.watchIdentityInvalidated((identity) => {
      expect(Object.isFrozen(identity)).toBe(true)
      try {
        ;(identity as PluginActivationIdentity).key = 'tampered-key'
      } catch {
        // The explicit throw below also verifies listener-error isolation.
      }
      throw new Error('faulty listener')
    })
    registry.watchIdentityInvalidated(observed)

    const first = registry.requestKey('demo', activation('instance-1', 1))
    registry.requestKey('demo', activation('instance-1', 2))

    expect(observed).toHaveBeenCalledOnce()
    expect(observed.mock.calls[0]?.[0]).toMatchObject({
      key: first,
      activationGeneration: 1
    })
  })

  it('rejects reentrant key mutations without invalidating the outer result', () => {
    const reentrantKeys: string[] = []
    registry.watchIdentityInvalidated(() => {
      expect(() => registry.requestKey('demo', activation('instance-1', 3))).toThrow(
        'Plugin channel key mutation is not allowed during identity invalidation'
      )
      expect(() => registry.revokeKey(reentrantKeys[0])).toThrow(
        'Plugin channel key mutation is not allowed during identity invalidation'
      )
    })

    const first = registry.requestKey('demo', activation('instance-1', 1))
    reentrantKeys.push(first)
    const second = registry.requestKey('demo', activation('instance-1', 2))

    expect(second).not.toBe(first)
    expect(registry.isValidKey(second)).toBe(true)
    expect(registry.keyForName('demo')).toBe(second)
    expect(registry.resolveCurrentIdentity('demo')).toMatchObject({
      key: second,
      activationGeneration: 2
    })
  })

  it('unsubscribes idempotently', () => {
    const listener = vi.fn()
    const unsubscribe = registry.watchIdentityInvalidated(listener)
    registry.requestKey('demo', activation('instance-1', 1))

    unsubscribe()
    unsubscribe()
    registry.requestKey('demo', activation('instance-1', 2))

    expect(listener).not.toHaveBeenCalled()
  })
})
