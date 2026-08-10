import type { PluginActivationIdentity } from '@talex-touch/utils/transport/main'
import type { PluginWebContentsRegistration } from '../modules/plugin/runtime/plugin-view-registry'

interface ResolveChannelCallerIdentityInput {
  senderId: number | undefined
  senderDestroyed: boolean
  declaredKey?: string
  registration?: PluginWebContentsRegistration
  resolveIdentity: (key: string) => PluginActivationIdentity | undefined
}

interface ResolvedChannelCallerIdentity {
  pluginName?: string
  pluginIdentity?: PluginActivationIdentity
}

function isSameActivation(
  registration: PluginActivationIdentity,
  current: PluginActivationIdentity
): boolean {
  return (
    registration.name === current.name &&
    registration.pluginInstanceId === current.pluginInstanceId &&
    registration.activationGeneration === current.activationGeneration &&
    registration.key === current.key
  )
}

export function resolveChannelCallerIdentity(
  input: ResolveChannelCallerIdentityInput
): ResolvedChannelCallerIdentity {
  const { registration } = input
  if (registration) {
    const result: ResolvedChannelCallerIdentity = { pluginName: registration.name }
    if (input.senderDestroyed) {
      return result
    }
    if (input.declaredKey && input.declaredKey !== registration.key) {
      return result
    }
    const current = input.resolveIdentity(registration.key)
    if (!current || !isSameActivation(registration, current)) {
      return result
    }
    return { pluginName: registration.name, pluginIdentity: current }
  }

  // No registration means no plugin identity, whatever the message claims. The key travelling in
  // the payload used to be accepted here as an identity source, so any webContents holding a plugin
  // key impersonated that plugin on the PLUGIN channel — pluginIdentity stayed empty, so the strict
  // check in main-transport rejected, but every handler reading only `data.plugin` was fooled:
  // storage namespacing, quota accounting, permission lookups (#698).
  //
  // Safe to drop because both production registration sites — plugin-view-controller and
  // plugin-window-transport-service — register the webContents immediately after creating it and
  // before loading any content, so a real plugin surface is never unregistered while it can send.
  // declaredKey survives above purely as a consistency check that rejects on mismatch.
  return {}
}
