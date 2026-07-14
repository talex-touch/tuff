import type {
  IntelligenceProviderConfig,
  IntelligenceProviderModelOption,
} from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import {
  ensureIntelligenceConfigLoaded,
  getCapabilityOptions,
  getEffectiveCapabilityRoutingConfig,
} from './intelligence-config'
import { getIntelligenceProviderManager, providerSupportsCapability } from './intelligence-sdk'

const CAPABILITY_FALLBACK_MODELS: Record<
  string,
  Partial<Record<IntelligenceProviderType, string[]>>
> = {
  'embedding.generate': {
    [IntelligenceProviderType.OPENAI]: ['text-embedding-3-small', 'text-embedding-3-large'],
    [IntelligenceProviderType.SILICONFLOW]: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3'],
  },
  'search.semantic': {
    [IntelligenceProviderType.OPENAI]: ['text-embedding-3-small', 'text-embedding-3-large'],
    [IntelligenceProviderType.SILICONFLOW]: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3'],
  },
  'search.rerank': {
    [IntelligenceProviderType.OPENAI]: ['text-embedding-3-small', 'text-embedding-3-large'],
    [IntelligenceProviderType.SILICONFLOW]: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3'],
  },
  'audio.tts': {
    [IntelligenceProviderType.OPENAI]: ['tts-1', 'tts-1-hd'],
    [IntelligenceProviderType.SILICONFLOW]: ['fnlp/MOSS-TTSD-v0.5'],
  },
  'audio.stt': {
    [IntelligenceProviderType.OPENAI]: ['whisper-1', 'gpt-4o-transcribe'],
    [IntelligenceProviderType.SILICONFLOW]: ['FunAudioLLM/SenseVoiceSmall'],
  },
  'audio.transcribe': {
    [IntelligenceProviderType.OPENAI]: ['whisper-1', 'gpt-4o-transcribe'],
    [IntelligenceProviderType.SILICONFLOW]: ['FunAudioLLM/SenseVoiceSmall'],
  },
  'image.generate': {
    [IntelligenceProviderType.OPENAI]: ['gpt-image-1'],
    [IntelligenceProviderType.SILICONFLOW]: ['Kwai-Kolors/Kolors'],
  },
  'image.edit': {
    [IntelligenceProviderType.OPENAI]: ['gpt-image-1'],
  },
}

function resolveCapabilityFallbackModels(
  capabilityId: string,
  providerType: IntelligenceProviderType,
): string[] {
  return CAPABILITY_FALLBACK_MODELS[capabilityId]?.[providerType] ?? []
}

function resolveDeclaredModels(
  provider: IntelligenceProviderConfig,
  capabilityId: string,
  defaultModel: string | null,
): string[] {
  const fallbackModels = resolveCapabilityFallbackModels(capabilityId, provider.type)
  if (fallbackModels.length > 0) {
    return fallbackModels
  }

  return [...(provider.models ?? []), defaultModel].filter(Boolean) as string[]
}

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
    if (defaultModel && a === defaultModel)
      return -1
    if (defaultModel && b === defaultModel)
      return 1
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

export function getProviderModelOptions(
  capabilityId = 'text.chat',
): IntelligenceProviderModelOption[] {
  ensureIntelligenceConfigLoaded()

  const capability = intelligenceCapabilityRegistry.get(capabilityId)
  if (!capability) {
    return []
  }

  const options = getCapabilityOptions(capabilityId)
  const allowedProviderIds = new Set(options.allowedProviderIds ?? [])
  const capabilityBindings = getEffectiveCapabilityRoutingConfig(capabilityId)?.providers ?? []

  return getIntelligenceProviderManager()
    .getEnabled()
    .filter(provider =>
      providerSupportsCapability(provider, capabilityId, capability.type, false),
    )
    .map(provider => provider.getConfig())
    .filter(provider => provider.enabled !== false)
    .filter(provider => capability.supportedProviders.includes(provider.type))
    .filter(provider => allowedProviderIds.size === 0 || allowedProviderIds.has(provider.id))
    .map((provider) => {
      const capabilityModels = normalizeStringList(
        capabilityBindings
          .filter(binding => binding.providerId === provider.id && binding.enabled !== false)
          .flatMap(binding => binding.models ?? []),
      )
      const configuredDefaultModel = normalizeString(provider.defaultModel)
      const fallbackModels = normalizeStringList(
        resolveCapabilityFallbackModels(capabilityId, provider.type),
      )
      const defaultModel
        = capabilityModels[0] ?? fallbackModels[0] ?? (configuredDefaultModel || null)
      const models = sortModels(
        normalizeStringList(
          capabilityModels.length > 0
            ? capabilityModels
            : resolveDeclaredModels(provider, capabilityId, defaultModel),
        ),
        defaultModel,
      )
      const available = hasUsableRuntimeCredential(provider) && models.length > 0

      return {
        providerId: provider.id,
        providerName: normalizeString(provider.name) || provider.id,
        providerType: provider.type,
        models,
        defaultModel,
        capabilities: normalizeStringList(provider.capabilities ?? []),
        available,
      }
    })
    .filter(provider => provider.models.length > 0)
    .sort((a, b) => {
      if (a.available !== b.available)
        return a.available ? -1 : 1
      return a.providerName.localeCompare(b.providerName)
    })
}
