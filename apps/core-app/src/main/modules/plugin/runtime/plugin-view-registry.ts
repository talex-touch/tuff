import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import { randomUUID } from 'node:crypto'

export interface PluginWebContentsRegistration extends PluginActivationIdentity {
  registrationToken: string
}

/**
 * Host-owned plugin surface registry. Payload fields never populate this map.
 */
const pluginWebContentsRegistrations = new Map<number, PluginWebContentsRegistration>()

/**
 * Per-surface aliases for the plugin channel key (#697).
 *
 * The key used to travel to the plugin view as a renderer command-line argument, where any
 * unprivileged process on the machine reads it out of the process table. It is a long-lived
 * credential — one value for the whole activation, shared by every window that plugin opens —
 * so the exposure lasted as long as the plugin did.
 *
 * A nonce replaces it on the wire. It is minted here, alongside the registration, because that
 * is the one place where a surface's lifetime is already known: minting and revocation cannot
 * drift apart if neither has its own call site. Revocation is what makes the alias worth having,
 * so it is not left to a caller to remember.
 */
const nonceByWebContents = new Map<number, string>()
const webContentsByNonce = new Map<string, number>()

export function registerPluginWebContents(
  webContentsId: number,
  activation: PluginActivationIdentity
): string {
  const registrationToken = randomUUID()
  // A surface can be re-registered without being destroyed, and the stale alias would otherwise
  // keep resolving to a registration it no longer belongs to.
  revokePluginViewNonce(webContentsId)
  pluginWebContentsRegistrations.set(webContentsId, {
    registrationToken,
    ...activation
  })
  const nonce = randomUUID()
  nonceByWebContents.set(webContentsId, nonce)
  webContentsByNonce.set(nonce, webContentsId)
  return registrationToken
}

export function unregisterPluginWebContents(
  webContentsId: number,
  registrationToken?: string
): boolean {
  const current = pluginWebContentsRegistrations.get(webContentsId)
  if (!current) {
    return false
  }
  if (registrationToken && current.registrationToken !== registrationToken) {
    return false
  }
  revokePluginViewNonce(webContentsId)
  return pluginWebContentsRegistrations.delete(webContentsId)
}

function revokePluginViewNonce(webContentsId: number): void {
  const previous = nonceByWebContents.get(webContentsId)
  if (previous === undefined) {
    return
  }
  nonceByWebContents.delete(webContentsId)
  webContentsByNonce.delete(previous)
}

/**
 * The alias this surface presents on the channel. Minted at registration, so it is already
 * there when the preload asks — every registration site creates the webContents and registers it
 * before loading any content.
 */
export function resolvePluginViewNonce(webContentsId: number | undefined): string | undefined {
  if (typeof webContentsId !== 'number' || !Number.isFinite(webContentsId)) {
    return undefined
  }
  return nonceByWebContents.get(webContentsId)
}

/**
 * Resolves an inbound alias back to the real channel key.
 *
 * Returns nothing once the surface is gone. A nonce outliving its registration would be exactly
 * the bearer credential this replaced, so the lookup goes through the live registration rather
 * than caching the key beside the nonce.
 */
export function resolvePluginKeyByViewNonce(nonce: string | undefined): string | undefined {
  if (typeof nonce !== 'string' || !nonce) {
    return undefined
  }
  const webContentsId = webContentsByNonce.get(nonce)
  if (webContentsId === undefined) {
    return undefined
  }
  return pluginWebContentsRegistrations.get(webContentsId)?.key
}

export function resolvePluginRegistrationByWebContents(
  webContentsId: number | undefined
): PluginWebContentsRegistration | undefined {
  if (typeof webContentsId !== 'number' || !Number.isFinite(webContentsId)) {
    return undefined
  }
  return pluginWebContentsRegistrations.get(webContentsId)
}

export function resolvePluginNameByWebContents(
  webContentsId: number | undefined
): string | undefined {
  return resolvePluginRegistrationByWebContents(webContentsId)?.name
}

/**
 * Replaces the channel key with this surface's alias on the way out (#697).
 *
 * Only the surface the key belongs to gets an alias. Anything else — the app renderer receiving a
 * bridged plugin message, the plugin host process, a window that was never registered — is
 * returned unchanged, because those receivers match on the key itself and swapping it would make
 * them drop every message without an error anywhere.
 */
export function maskPluginViewChannelKey(
  webContentsId: number | undefined,
  uniqueKey: unknown
): unknown {
  if (typeof uniqueKey !== 'string' || !uniqueKey) {
    return uniqueKey
  }
  const registration = resolvePluginRegistrationByWebContents(webContentsId)
  if (!registration || registration.key !== uniqueKey) {
    return uniqueKey
  }
  return resolvePluginViewNonce(webContentsId) ?? uniqueKey
}
