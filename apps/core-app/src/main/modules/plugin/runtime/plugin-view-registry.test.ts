import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import { describe, expect, it } from 'vitest'
import {
  maskPluginViewChannelKey,
  registerPluginWebContents,
  resolvePluginKeyByViewNonce,
  resolvePluginNameByWebContents,
  resolvePluginRegistrationByWebContents,
  resolvePluginViewNonce,
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

/**
 * The per-surface alias that replaced the channel key on the wire (#697).
 *
 * The key used to reach the plugin view as a renderer command-line argument, readable from the
 * process table by any unprivileged process. What matters here is not that an alias exists but
 * that it stops working the moment its surface does — an alias outliving its registration would
 * be the same long-lived bearer credential under a different name.
 */
describe('plugin view channel alias', () => {
  it('mints a distinct alias per surface and resolves each back to its own key', () => {
    const tokenA = registerPluginWebContents(9201, activation(1))
    const tokenB = registerPluginWebContents(9202, activation(2, { key: 'key-other' }))

    const nonceA = resolvePluginViewNonce(9201)
    const nonceB = resolvePluginViewNonce(9202)

    expect(nonceA).toBeTruthy()
    expect(nonceB).toBeTruthy()
    expect(nonceA).not.toBe(nonceB)
    expect(resolvePluginKeyByViewNonce(nonceA)).toBe('key-1')
    expect(resolvePluginKeyByViewNonce(nonceB)).toBe('key-other')

    unregisterPluginWebContents(9201, tokenA)
    unregisterPluginWebContents(9202, tokenB)
  })

  it('never hands out the key itself as an alias', () => {
    const token = registerPluginWebContents(9203, activation(3))

    expect(resolvePluginViewNonce(9203)).not.toBe('key-3')
    // The key is what the alias exists to keep off the wire, so it must not resolve as one either.
    expect(resolvePluginKeyByViewNonce('key-3')).toBeUndefined()

    unregisterPluginWebContents(9203, token)
  })

  /**
   * The case that is easy to write so it always passes: assert the revoked alias fails *and* that
   * the very same call succeeded a moment earlier, so a lookup that is broken outright cannot be
   * mistaken for revocation working.
   */
  it('stops resolving an alias once its surface is unregistered', () => {
    const token = registerPluginWebContents(9204, activation(4))
    const nonce = resolvePluginViewNonce(9204)

    expect(resolvePluginKeyByViewNonce(nonce)).toBe('key-4')

    expect(unregisterPluginWebContents(9204, token)).toBe(true)

    expect(resolvePluginKeyByViewNonce(nonce)).toBeUndefined()
    expect(resolvePluginViewNonce(9204)).toBeUndefined()
  })

  it('drops the previous alias when a surface is re-registered', () => {
    registerPluginWebContents(9205, activation(5))
    const first = resolvePluginViewNonce(9205)
    const token = registerPluginWebContents(9205, activation(6))
    const second = resolvePluginViewNonce(9205)

    expect(second).not.toBe(first)
    expect(resolvePluginKeyByViewNonce(first)).toBeUndefined()
    expect(resolvePluginKeyByViewNonce(second)).toBe('key-6')

    unregisterPluginWebContents(9205, token)
  })

  it('refuses empty and unknown aliases rather than resolving something', () => {
    expect(resolvePluginKeyByViewNonce(undefined)).toBeUndefined()
    expect(resolvePluginKeyByViewNonce('')).toBeUndefined()
    expect(resolvePluginKeyByViewNonce('not-a-nonce')).toBeUndefined()
  })

  describe('outbound masking', () => {
    it('swaps the key for the alias of the surface it belongs to', () => {
      const token = registerPluginWebContents(9206, activation(7))
      const nonce = resolvePluginViewNonce(9206)

      expect(maskPluginViewChannelKey(9206, 'key-7')).toBe(nonce)

      unregisterPluginWebContents(9206, token)
    })

    /**
     * Everything that is not a registered plugin view still matches on the key itself — the app
     * renderer receiving a bridged plugin message, the plugin host process. Masking there would
     * make them drop every message with no error raised anywhere, so the pass-through cases are
     * asserted as explicitly as the masked one.
     */
    it('leaves messages to every other receiver untouched', () => {
      const token = registerPluginWebContents(9207, activation(8))

      expect(maskPluginViewChannelKey(9208, 'key-8')).toBe('key-8')
      expect(maskPluginViewChannelKey(undefined, 'key-8')).toBe('key-8')
      // A registered surface, but a key that is not its own: another plugin's message routed to
      // the wrong view is a bug worth leaving visible rather than aliasing into looking correct.
      expect(maskPluginViewChannelKey(9207, 'key-of-another-plugin')).toBe('key-of-another-plugin')

      unregisterPluginWebContents(9207, token)
    })

    it('passes through absent and non-string keys', () => {
      const token = registerPluginWebContents(9209, activation(9))

      expect(maskPluginViewChannelKey(9209, undefined)).toBeUndefined()
      expect(maskPluginViewChannelKey(9209, '')).toBe('')
      expect(maskPluginViewChannelKey(9209, 42)).toBe(42)

      unregisterPluginWebContents(9209, token)
    })

    it('stops masking once the surface is gone', () => {
      const token = registerPluginWebContents(9210, activation(10))
      const nonce = resolvePluginViewNonce(9210)

      expect(maskPluginViewChannelKey(9210, 'key-10')).toBe(nonce)

      unregisterPluginWebContents(9210, token)

      expect(maskPluginViewChannelKey(9210, 'key-10')).toBe('key-10')
    })
  })
})
