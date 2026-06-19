import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { ensureIntelligenceConfigLoaded, getCapabilityOptions } from './intelligence-config'
import { getIntelligenceProviderManager } from './intelligence-sdk'

export interface IntelligenceCapabilityStatusSnapshot {
  capabilityId: string
  available: boolean
  providerIds: string[]
  reason?: string
}

function hasUsableRuntimeCredential(provider: IntelligenceProviderConfig): boolean {
  if (provider.type === IntelligenceProviderType.LOCAL) {
    return true
  }

  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
  return Boolean(apiKey) && apiKey !== 'guest' && provider.metadata?.tokenMode !== 'guest'
}

function providerCanServeCapability(
  provider: IntelligenceProviderConfig,
  capabilityId: string
): boolean {
  if (provider.enabled === false) {
    return false
  }
  if (!hasUsableRuntimeCredential(provider)) {
    return false
  }
  return (
    !Array.isArray(provider.capabilities) ||
    provider.capabilities.length === 0 ||
    provider.capabilities.includes(capabilityId)
  )
}

export function resolveCapabilityStatus(
  capabilityId: string
): IntelligenceCapabilityStatusSnapshot {
  ensureIntelligenceConfigLoaded()
  const capability = intelligenceCapabilityRegistry.get(capabilityId)
  if (!capability) {
    return {
      capabilityId,
      available: false,
      providerIds: [],
      reason: 'capability-not-found'
    }
  }

  const options = getCapabilityOptions(capabilityId)
  const allowedProviderIds = new Set(options.allowedProviderIds ?? [])
  const providerIds = getIntelligenceProviderManager()
    .getEnabled()
    .map((provider) => provider.getConfig())
    .filter((provider) => capability.supportedProviders.includes(provider.type))
    .filter((provider) => allowedProviderIds.size === 0 || allowedProviderIds.has(provider.id))
    .filter((provider) => providerCanServeCapability(provider, capabilityId))
    .map((provider) => provider.id)

  return {
    capabilityId,
    available: providerIds.length > 0,
    providerIds,
    reason: providerIds.length > 0 ? undefined : 'no-enabled-provider'
  }
}
