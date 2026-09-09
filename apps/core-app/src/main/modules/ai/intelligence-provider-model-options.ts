import type {
  IntelligenceProviderConfig,
  IntelligenceProviderModelOption
} from '@talex-touch/tuff-intelligence'
import {
  IntelligenceProviderType,
  NEXUS_AUDIO_TRANSCRIBE_MODEL
} from '@talex-touch/tuff-intelligence'
import { intelligenceCapabilityRegistry } from './intelligence-capability-registry'
import {
  ensureIntelligenceConfigLoaded,
  getCapabilityOptions,
  getEffectiveCapabilityRoutingConfig
} from './intelligence-config'
import { getIntelligenceProviderManager, providerSupportsCapability } from './intelligence-sdk'
import { isNexusManagedProvider } from '@talex-touch/utils/intelligence/nexus-provider'
import {
  getVoiceAsrMetadata,
  getVoiceCapabilityRecommendedModels
} from '@talex-touch/utils/intelligence/voice-asr'
import { getResolvedPiExecutable, isPiCliProviderConfig } from './providers/pi-cli-runtime'
import { listPiCliModels } from './providers/pi-model-catalog'

const CAPABILITY_FALLBACK_MODELS: Record<
  string,
  Partial<Record<IntelligenceProviderType, string[]>>
> = {
  'embedding.generate': {
    [IntelligenceProviderType.OPENAI]: ['text-embedding-3-small', 'text-embedding-3-large'],
    [IntelligenceProviderType.SILICONFLOW]: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3']
  },
  'search.semantic': {
    [IntelligenceProviderType.OPENAI]: ['text-embedding-3-small', 'text-embedding-3-large'],
    [IntelligenceProviderType.SILICONFLOW]: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3']
  },
  'search.rerank': {
    [IntelligenceProviderType.OPENAI]: ['text-embedding-3-small', 'text-embedding-3-large'],
    [IntelligenceProviderType.SILICONFLOW]: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3']
  },
  'audio.tts': {
    [IntelligenceProviderType.OPENAI]: ['tts-1', 'tts-1-hd'],
    [IntelligenceProviderType.SILICONFLOW]: ['fnlp/MOSS-TTSD-v0.5']
  },
  'audio.stt': {
    [IntelligenceProviderType.OPENAI]: ['whisper-1', 'gpt-4o-transcribe'],
    [IntelligenceProviderType.SILICONFLOW]: ['FunAudioLLM/SenseVoiceSmall']
  },
  'audio.asr': {},
  'audio.transcribe': {
    [IntelligenceProviderType.OPENAI]: ['whisper-1', 'gpt-4o-transcribe'],
    [IntelligenceProviderType.SILICONFLOW]: ['FunAudioLLM/SenseVoiceSmall']
  },
  'image.generate': {
    [IntelligenceProviderType.OPENAI]: ['gpt-image-1'],
    [IntelligenceProviderType.SILICONFLOW]: ['Kwai-Kolors/Kolors']
  },
  'image.edit': {
    [IntelligenceProviderType.OPENAI]: ['gpt-image-1']
  }
}

function resolveCapabilityFallbackModels(
  capabilityId: string,
  providerType: IntelligenceProviderType
): string[] {
  return CAPABILITY_FALLBACK_MODELS[capabilityId]?.[providerType] ?? []
}

function resolveDeclaredModels(
  provider: IntelligenceProviderConfig,
  capabilityId: string,
  defaultModel: string | null
): string[] {
  // The auto-registered pi provider declares no models; its list lives in the
  // CLI's own catalogue files. Only a probed-absent executable (`null`) empties
  // the row — an unprobed machine (`undefined`) must not read as one without
  // the CLI, mirroring the config-assembly stance in pi-cli-runtime.
  if (isPiCliProviderConfig(provider)) {
    return getResolvedPiExecutable() === null ? [] : listPiCliModels()
  }

  const fallbackModels = resolveCapabilityFallbackModels(capabilityId, provider.type)
  if (fallbackModels.length > 0) {
    return fallbackModels
  }
  return normalizeStringList([...(provider.models ?? []), defaultModel])
}

function resolveCapabilityModels(
  capabilityId: string,
  provider: IntelligenceProviderConfig,
  capabilityModels: string[],
  defaultModel: string | null
): string[] {
  if (capabilityModels.length > 0) return capabilityModels

  const declaredModels = resolveDeclaredModels(provider, capabilityId, defaultModel)
  const recommendedModels = getVoiceCapabilityRecommendedModels(capabilityId, provider.metadata)
  if (recommendedModels.length === 0) return declaredModels

  const declaredRecommendedModels = declaredModels.filter((model) =>
    recommendedModels.includes(model)
  )
  return declaredRecommendedModels.length > 0 ? declaredRecommendedModels : recommendedModels
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
  const capabilityBindings = getEffectiveCapabilityRoutingConfig(capabilityId)?.providers ?? []

  return getIntelligenceProviderManager()
    .getEnabled()
    .filter((provider) =>
      providerSupportsCapability(provider, capabilityId, capability.type, false)
    )
    .map((provider) => provider.getConfig())
    .filter((provider) => provider.enabled !== false)
    .filter(
      (provider) => capabilityId !== 'audio.asr' || Boolean(getVoiceAsrMetadata(provider.metadata))
    )
    .filter((provider) => capability.supportedProviders.includes(provider.type))
    .filter((provider) => allowedProviderIds.size === 0 || allowedProviderIds.has(provider.id))
    .map((provider) => {
      const capabilityModels = normalizeStringList(
        capabilityBindings
          .filter((binding) => binding.providerId === provider.id && binding.enabled !== false)
          .flatMap((binding) => binding.models ?? [])
      )
      const isNexusStt = capabilityId === 'audio.stt' && isNexusManagedProvider(provider)
      const configuredDefaultModel = normalizeString(provider.defaultModel)
      const fallbackModels = normalizeStringList(
        resolveCapabilityFallbackModels(capabilityId, provider.type)
      )
      const recommendedModels = getVoiceCapabilityRecommendedModels(capabilityId, {
        ...(provider.metadata ?? {}),
        baseUrl: provider.baseUrl
      })
      const defaultModel = isNexusStt
        ? NEXUS_AUDIO_TRANSCRIBE_MODEL
        : (capabilityModels[0] ??
          recommendedModels[0] ??
          fallbackModels[0] ??
          (configuredDefaultModel || null))
      const models = isNexusStt
        ? [NEXUS_AUDIO_TRANSCRIBE_MODEL]
        : sortModels(
            resolveCapabilityModels(capabilityId, provider, capabilityModels, defaultModel),
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
