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

  it('routes an unregistered valid-key holder as unverified plugin', () => {
    const result = resolveChannelCallerIdentity({
      senderId: 74,
      senderDestroyed: false,
      declaredKey: 'key-2',
      resolveIdentity: () => activation(2)
    })

    expect(result).toEqual({ pluginName: 'plugin-a' })
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
