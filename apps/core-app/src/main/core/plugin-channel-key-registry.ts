import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { randomBytes } from 'node:crypto'

/**
 * Per-plugin channel keys and the activation they belong to.
 *
 * This is the isolation CLAUDE.md describes as "plugin channels use encrypted keys instead of
 * direct names". It lived inside TouchChannel, where it could not be tested: constructing that
 * class pulls in Electron, Sentry, the perf monitor and most of the main process, so every
 * test that touched these methods replaced them with vi.fn() and the rotation logic itself had
 * never run (#929).
 *
 * It is pure state with no Electron dependency, so it belongs in its own unit — which is also
 * the shape a security boundary should have.
 */
export class PluginChannelKeyRegistry {
  private readonly keyToName = new Map<string, string>()
  private readonly nameToKey = new Map<string, string>()
  private readonly keyToIdentity = new Map<string, PluginActivationIdentity>()

  /**
   * Returns the plugin's current key, minting a new one when the activation has changed.
   *
   * The rotation is the point: after a reload, the previous activation must not keep a working
   * key. A caller that supplies no activation matches whatever is current, which keeps the
   * legacy `requestKey(name)` path from rotating a live key out from under its owner.
   */
  requestKey(
    name: string,
    activation?: Pick<PluginActivationIdentity, 'pluginInstanceId' | 'activationGeneration'>
  ): string {
    const existingKey = this.nameToKey.get(name)
    if (existingKey) {
      const existingIdentity = this.keyToIdentity.get(existingKey)
      const sameActivation =
        existingIdentity &&
        (!activation ||
          (existingIdentity.pluginInstanceId === activation.pluginInstanceId &&
            existingIdentity.activationGeneration === activation.activationGeneration))
      if (sameActivation) {
        return existingKey
      }
      // All three maps move together. A key dropped from one but left in another is exactly
      // the stale-key injection this rotation exists to prevent.
      this.keyToName.delete(existingKey)
      this.keyToIdentity.delete(existingKey)
      this.nameToKey.delete(name)
    }

    const key = randomBytes(16).toString('hex')
    const identity: PluginActivationIdentity = {
      name,
      pluginInstanceId: activation?.pluginInstanceId ?? `legacy:${name}`,
      activationGeneration: activation?.activationGeneration ?? 1,
      key
    }
    this.keyToName.set(key, name)
    this.nameToKey.set(name, key)
    this.keyToIdentity.set(key, identity)

    return key
  }

  /** Returns whether a key existed to revoke, so a caller can tell a real key from a made-up one. */
  revokeKey(key: string): boolean {
    const name = this.keyToName.get(key)
    if (!name) {
      return false
    }

    this.keyToName.delete(key)
    this.nameToKey.delete(name)
    this.keyToIdentity.delete(key)

    return true
  }

  resolveKey(key: string): string | undefined {
    return this.keyToName.get(key)
  }

  isValidKey(key: string): boolean {
    return this.keyToIdentity.has(key)
  }

  resolveIdentity(key: string): PluginActivationIdentity | undefined {
    return this.keyToIdentity.get(key)
  }

  resolveCurrentIdentity(name: string): PluginActivationIdentity | undefined {
    const key = this.nameToKey.get(name)
    return key ? this.keyToIdentity.get(key) : undefined
  }

  /** The key currently issued to a plugin, if any. */
  keyForName(name: string): string | undefined {
    return this.nameToKey.get(name)
  }
}
