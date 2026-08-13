import { beforeEach, describe, expect, it } from 'vitest'
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
