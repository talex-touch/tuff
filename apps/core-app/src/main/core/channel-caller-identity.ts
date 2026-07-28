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

  if (!input.declaredKey) {
    return {}
  }
  const declaredIdentity = input.resolveIdentity(input.declaredKey)
  return declaredIdentity ? { pluginName: declaredIdentity.name } : {}
}
