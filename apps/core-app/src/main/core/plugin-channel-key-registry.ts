import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { randomBytes } from 'node:crypto'

type IdentityInvalidationListener = (identity: Readonly<PluginActivationIdentity>) => void

/**
 * Per-plugin channel keys and the activation they belong to.
 *
 * The key is a **bearer capability token**, not encryption of anything: 16 random bytes minted per
 * activation. CLAUDE.md described it as encryption until #804, which is worth stating plainly —
 * a reviewer who reads that word assumes confidentiality and replay resistance and stops looking
 * for the things that actually matter here, namely where the token travels and when it dies.
 *
 * What it does provide: it is unguessable, it rotates whenever the activation changes, and it is
 * revoked on disable, on runtime crash and on failed activation. There is no TTL, because the
 * token's lifetime is the activation's — a timer would expire a key out from under a live plugin
 * without making a leaked one meaningfully less useful in the window before it fired.
 *
 * It lived inside TouchChannel, where it could not be tested: constructing that class pulls in
 * Electron, Sentry, the perf monitor and most of the main process, so every test that touched
 * these methods replaced them with vi.fn() and the rotation logic itself had never run (#929).
 *
 * It is pure state with no Electron dependency, so it belongs in its own unit — which is also
 * the shape a security boundary should have.
 */
export class PluginChannelKeyRegistry {
  private readonly keyToName = new Map<string, string>()
  private readonly nameToKey = new Map<string, string>()
  private readonly keyToIdentity = new Map<string, PluginActivationIdentity>()
  private readonly identityInvalidationListeners = new Set<IdentityInvalidationListener>()
  private notifyingIdentityInvalidation = false

  private assertMutationAllowed(): void {
    if (this.notifyingIdentityInvalidation) {
      throw new Error('Plugin channel key mutation is not allowed during identity invalidation')
    }
  }

  private notifyIdentityInvalidated(identity: PluginActivationIdentity): void {
    const snapshot = Object.freeze({ ...identity })
    this.notifyingIdentityInvalidation = true
    try {
      for (const listener of [...this.identityInvalidationListeners]) {
        try {
          listener(snapshot)
        } catch {
          // Identity invalidation must complete even when one host listener is faulty.
        }
      }
    } finally {
      this.notifyingIdentityInvalidation = false
    }
  }

  watchIdentityInvalidated(listener: IdentityInvalidationListener): () => void {
    this.identityInvalidationListeners.add(listener)
    return () => {
      this.identityInvalidationListeners.delete(listener)
    }
  }

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
    this.assertMutationAllowed()
    const existingKey = this.nameToKey.get(name)
    const existingIdentity = existingKey ? this.keyToIdentity.get(existingKey) : undefined
    if (existingKey) {
      const sameActivation =
        existingIdentity &&
        (!activation ||
          (existingIdentity.pluginInstanceId === activation.pluginInstanceId &&
            existingIdentity.activationGeneration === activation.activationGeneration))
      if (sameActivation) {
        return existingKey
      }
    }

    const key = randomBytes(16).toString('hex')
    const identity: PluginActivationIdentity = Object.freeze({
      name,
      pluginInstanceId: activation?.pluginInstanceId ?? `legacy:${name}`,
      activationGeneration: activation?.activationGeneration ?? 1,
      key
    })

    if (existingKey) {
      // All three maps move together. A key dropped from one but left in another is exactly
      // the stale-key injection this rotation exists to prevent.
      this.keyToName.delete(existingKey)
      this.keyToIdentity.delete(existingKey)
      this.nameToKey.delete(name)
    }
    this.keyToName.set(key, name)
    this.nameToKey.set(name, key)
    this.keyToIdentity.set(key, identity)
    if (existingIdentity) {
      this.notifyIdentityInvalidated(existingIdentity)
    }

    return key
  }

  /** Returns whether a key existed to revoke, so a caller can tell a real key from a made-up one. */
  revokeKey(key: string): boolean {
    this.assertMutationAllowed()
    const name = this.keyToName.get(key)
    const identity = this.keyToIdentity.get(key)
    if (!name) {
      return false
    }

    this.keyToName.delete(key)
    this.nameToKey.delete(name)
    this.keyToIdentity.delete(key)
    if (identity) {
      this.notifyIdentityInvalidated(identity)
    }

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
