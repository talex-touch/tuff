import type {
  IntelligenceProviderConfig,
  IntelligenceProviderModelOption
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import { ensureIntelligenceConfigLoaded, getCapabilityOptions } from './intelligence-config'
import { getIntelligenceProviderManager } from './intelligence-sdk'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    const item = normalizeString(value)
    if (!item || seen.has(item)) {
      continue
    }
    seen.add(item)
    normalized.push(item)
  }

  return normalized
}

function sortModels(models: string[], defaultModel: string | null): string[] {
  return [...models].sort((a, b) => {
    if (defaultModel && a === defaultModel) return -1
    if (defaultModel && b === defaultModel) return 1
    return a.localeCompare(b)
  })
}

function hasUsableRuntimeCredential(provider: IntelligenceProviderConfig): boolean {
  if (provider.type === IntelligenceProviderType.LOCAL) {
    return true
  }

  const apiKey = normalizeString(provider.apiKey)
  return Boolean(apiKey) && apiKey !== 'guest' && provider.metadata?.tokenMode !== 'guest'
}

function supportsCapability(provider: IntelligenceProviderConfig, capabilityId: string): boolean {
  return (
    !Array.isArray(provider.capabilities) ||
    provider.capabilities.length === 0 ||
    provider.capabilities.includes(capabilityId)
  )
}

export function getProviderModelOptions(
  capabilityId = 'text.chat'
): IntelligenceProviderModelOption[] {
  ensureIntelligenceConfigLoaded()

  const capability = intelligenceCapabilityRegistry.get(capabilityId)
  if (!capability) {
    return []
  }

  const options = getCapabilityOptions(capabilityId)
  const allowedProviderIds = new Set(options.allowedProviderIds ?? [])

  return getIntelligenceProviderManager()
    .getEnabled()
    .map((provider) => provider.getConfig())
    .filter((provider) => provider.enabled !== false)
    .filter((provider) => capability.supportedProviders.includes(provider.type))
    .filter((provider) => allowedProviderIds.size === 0 || allowedProviderIds.has(provider.id))
    .filter((provider) => supportsCapability(provider, capabilityId))
    .map((provider) => {
      const defaultModel = normalizeString(provider.defaultModel) || null
      const models = sortModels(
        normalizeStringList([...(provider.models ?? []), defaultModel].filter(Boolean)),
        defaultModel
      )
      const available = hasUsableRuntimeCredential(provider) && models.length > 0

      return {
        providerId: provider.id,
        providerName: normalizeString(provider.name) || provider.id,
        providerType: provider.type,
        models,
        defaultModel,
        capabilities: normalizeStringList(provider.capabilities ?? []),
        available
      }
    })
    .filter((provider) => provider.models.length > 0)
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1
      return a.providerName.localeCompare(b.providerName)
    })
}
