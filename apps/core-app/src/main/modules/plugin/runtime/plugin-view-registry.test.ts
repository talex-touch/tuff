import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import { describe, expect, it } from 'vitest'
import {
  registerPluginWebContents,
  resolvePluginNameByWebContents,
  resolvePluginRegistrationByWebContents,
  unregisterPluginWebContents
} from './plugin-view-registry'

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

describe('plugin view registry', () => {
  it('stores a host-issued activation snapshot', () => {
    const token = registerPluginWebContents(9101, activation(2))

    expect(resolvePluginRegistrationByWebContents(9101)).toEqual({
      registrationToken: token,
      ...activation(2)
    })
    expect(resolvePluginNameByWebContents(9101)).toBe('plugin-a')

    unregisterPluginWebContents(9101, token)
  })

  it('does not let stale cleanup remove a replacement registration', () => {
    const staleToken = registerPluginWebContents(9102, activation(1))
    const currentToken = registerPluginWebContents(9102, activation(2))

    expect(unregisterPluginWebContents(9102, staleToken)).toBe(false)
    expect(resolvePluginRegistrationByWebContents(9102)).toMatchObject(activation(2))
    expect(unregisterPluginWebContents(9102, currentToken)).toBe(true)
    expect(resolvePluginRegistrationByWebContents(9102)).toBeUndefined()
  })

  it('returns no registration for invalid sender ids', () => {
    expect(resolvePluginRegistrationByWebContents(undefined)).toBeUndefined()
    expect(resolvePluginRegistrationByWebContents(Number.NaN)).toBeUndefined()
  })
})
