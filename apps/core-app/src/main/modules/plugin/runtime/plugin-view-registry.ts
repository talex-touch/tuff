import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import { randomUUID } from 'node:crypto'

export interface PluginWebContentsRegistration extends PluginActivationIdentity {
  registrationToken: string
}

/**
 * Host-owned plugin surface registry. Payload fields never populate this map.
 */
const pluginWebContentsRegistrations = new Map<number, PluginWebContentsRegistration>()

export function registerPluginWebContents(
  webContentsId: number,
  activation: PluginActivationIdentity
): string {
  const registrationToken = randomUUID()
  pluginWebContentsRegistrations.set(webContentsId, {
    registrationToken,
    ...activation
  })
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
  return pluginWebContentsRegistrations.delete(webContentsId)
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
