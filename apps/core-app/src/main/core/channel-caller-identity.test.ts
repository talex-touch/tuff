import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import { describe, expect, it } from 'vitest'
import { resolveChannelCallerIdentity } from './channel-caller-identity'

function activation(
  generation: number,
  overrides: Partial<PluginActivationIdentity> = {}
): PluginActivationIdentity {
  return {
    name: 'plugin-a',
    pluginInstanceId: 'instance-a',
    activationGeneration: generation,
    key: `key-${generation}`,
    ...overrides
  }
}

function registration(generation: number) {
  return {
    registrationToken: `registration-${generation}`,
    ...activation(generation)
  }
}

describe('resolveChannelCallerIdentity', () => {
  it('derives identity from a current registered sender', () => {
    expect(
      resolveChannelCallerIdentity({
        senderId: 71,
        senderDestroyed: false,
        declaredKey: 'key-2',
        registration: registration(2),
        resolveIdentity: () => activation(2)
      })
    ).toEqual({ pluginName: 'plugin-a', pluginIdentity: activation(2) })
  })

  it('keeps legacy omitted keys sender-bound', () => {
    expect(
      resolveChannelCallerIdentity({
        senderId: 72,
        senderDestroyed: false,
        registration: registration(2),
        resolveIdentity: () => activation(2)
      }).pluginIdentity
    ).toEqual(activation(2))
  })

  it.each([
    ['destroyed sender', { senderDestroyed: true, declaredKey: 'key-2' }],
    ['forged key', { senderDestroyed: false, declaredKey: 'forged' }],
    ['stale generation', { senderDestroyed: false, declaredKey: 'key-1' }]
  ])('fails closed for %s', (_label, values) => {
    const staleRegistration = values.declaredKey === 'key-1' ? registration(1) : registration(2)
    const result = resolveChannelCallerIdentity({
      senderId: 73,
      registration: staleRegistration,
      resolveIdentity: () => activation(2),
      ...values
    })

    expect(result.pluginName).toBe('plugin-a')
    expect(result.pluginIdentity).toBeUndefined()
  })

  it('gives an unregistered sender no plugin name, however valid its key', () => {
    // Previously this returned { pluginName: 'plugin-a' } and was called "unverified plugin" —
    // pluginIdentity stayed empty, so main-transport's strict check still rejected. But the name
    // alone routes the message onto the PLUGIN channel and lands in `data.plugin`, which is what
    // storage namespacing, quota accounting and permission lookups read. "Unverified" was the
    // wrong frame: a name nobody can verify is an impersonation, not a weaker credential (#698).
    //
    // Nothing legitimate lands here. Both production registration sites register the webContents
    // immediately after creating it and before loading content, so a real plugin surface is never
    // unregistered while it can still send.
    const result = resolveChannelCallerIdentity({
      senderId: 74,
      senderDestroyed: false,
      declaredKey: 'key-2',
      resolveIdentity: () => activation(2)
    })

    expect(result).toEqual({})
  })

  it('still refuses an unregistered sender whose key resolves to nothing', () => {
    // Control for the case above: it must fail closed for the same reason, not for a different one.
    const result = resolveChannelCallerIdentity({
      senderId: 76,
      senderDestroyed: false,
      declaredKey: 'unknown-key',
      resolveIdentity: () => undefined
    })

    expect(result).toEqual({})
  })

  it('does not let a stolen key replace the registered plugin identity', () => {
    const result = resolveChannelCallerIdentity({
      senderId: 75,
      senderDestroyed: false,
      declaredKey: 'plugin-b-key',
      registration: registration(2),
      resolveIdentity: (key) =>
        key === 'plugin-b-key'
          ? activation(1, {
              name: 'plugin-b',
              pluginInstanceId: 'instance-b',
              key: 'plugin-b-key'
            })
          : activation(2)
    })

    expect(result).toEqual({ pluginName: 'plugin-a' })
  })
})
