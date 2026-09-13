import { resolveFirstIntelligenceProviderRoute } from '@talex-touch/tuff-intelligence'
import type {
  VoiceRecognitionStatus,
  VoiceRecognitionStatusSnapshot
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { NEXUS_AUDIO_TRANSCRIBE_MODEL } from '@talex-touch/utils/types/intelligence'
import {
  BailianParaformerVoiceProvider,
  createFetchHttpClient,
  createNodeVoiceSocketFactory,
  DashscopeQwenAsrRealtimeVoiceProvider,
  DoubaoVoiceProvider,
  type VoiceProviderAdapter
} from '@talex-touch/tuff-voice'
import {
  getVoiceAsrMetadata,
  getVoiceCapabilityRecommendedModels,
  resolveBailianVoiceEndpoints
} from '@talex-touch/utils/intelligence/voice-asr'
import { isNexusManagedProvider } from '@talex-touch/utils/intelligence/nexus-provider'
import {
  ensureIntelligenceConfigLoaded,
  getCapabilityOptions,
  getEffectiveCapabilityRoutingConfig
} from '../ai/intelligence-config'
import { getIntelligenceProviderManager, providerSupportsCapability } from '../ai/intelligence-sdk'
import { createBufferedSttVoiceProvider } from './buffered-stt-provider'
import { getAuthToken, getSanitizedAuthSessionState } from '../auth'
import { resolveProviderCredential } from '../ai/provider-credential-runtime'
import { getRuntimeNexusBaseUrl } from '../nexus/runtime-base'

const ASR_CAPABILITY_ID = 'audio.asr'
const STT_CAPABILITY_ID = 'audio.stt'

export interface ConfiguredAsrProvider {
  provider: VoiceProviderAdapter
  model: string
  mode?: 'realtime' | 'buffered'
}

function hasEnabledCapabilityBinding(capabilityId: string): boolean {
  ensureIntelligenceConfigLoaded()
  return Boolean(
    getEffectiveCapabilityRoutingConfig(capabilityId)?.providers?.some(
      (binding) => binding.enabled !== false
    )
  )
}

function resolveCapabilityProvider(
  capabilityId: string,
  capabilityType: 'asr' | 'stt',
  requireCredential = false
) {
  ensureIntelligenceConfigLoaded()
  const capability = getEffectiveCapabilityRoutingConfig(capabilityId)
  const bindings = capability?.providers ?? []
  if (!bindings.some((binding) => binding.enabled !== false)) return null

  const manager = getIntelligenceProviderManager()
  const boundProviderIds = new Set(
    bindings.filter((binding) => binding.enabled !== false).map((binding) => binding.providerId)
  )
  const providers = Array.from(boundProviderIds)
    .map((providerId) => manager.get(providerId))
    .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider))
    .filter((provider) => provider.getConfig().enabled !== false)
    .map((provider) => {
      const config = provider.getConfig()
      const credential = isNexusManagedProvider(config)
        ? (getAuthToken() ?? undefined)
        : resolveProviderCredential(config)
      return { ...config, apiKey: credential, hasApiKey: Boolean(credential) }
    })
  const options = getCapabilityOptions(capabilityId)
  return resolveFirstIntelligenceProviderRoute({
    capabilityId,
    providers,
    capability,
    options,
    requireApiKey: requireCredential,
    isProviderAvailable: (provider) => {
      const adapter = manager.get(provider.id)
      const supportsGenericCapability = Boolean(
        adapter && providerSupportsCapability(adapter, capabilityId, capabilityType, false)
      )
      const supportsVoiceCapability =
        (capabilityType === 'asr' || capabilityType === 'stt') &&
        Boolean(getVoiceAsrMetadata(provider.metadata))
      return supportsGenericCapability || supportsVoiceCapability
    }
  })
}

function capabilityStatus(
  capabilityId: string,
  capabilityType: 'asr' | 'stt',
  prefix: 'VOICE_ASR' | 'VOICE_STT'
): VoiceRecognitionStatus {
  if (!hasEnabledCapabilityBinding(capabilityId)) {
    return { ready: false, reason: `${prefix}_NOT_CONFIGURED` }
  }
  if (!resolveCapabilityProvider(capabilityId, capabilityType)) {
    return { ready: false, reason: `${prefix}_PROVIDER_UNAVAILABLE` }
  }
  if (!resolveCapabilityProvider(capabilityId, capabilityType, true)) {
    return { ready: false, reason: `${prefix}_CREDENTIAL_UNAVAILABLE` }
  }
  return { ready: true }
}

function resolveNexusBufferedSttProvider(): ConfiguredAsrProvider | null {
  const route = resolveCapabilityProvider(STT_CAPABILITY_ID, 'stt', true)
  if (route?.model !== NEXUS_AUDIO_TRANSCRIBE_MODEL || !isNexusManagedProvider(route.provider))
    return null
  const expectedUserId = getSanitizedAuthSessionState().user?.id
  if (!expectedUserId) return null
  const expectedBaseUrl = getRuntimeNexusBaseUrl()
  return {
    model: route.model,
    mode: 'buffered',
    provider: createBufferedSttVoiceProvider({
      providerId: route.provider.id,
      model: route.model,
      authorityCheck: () =>
        getSanitizedAuthSessionState().user?.id === expectedUserId &&
        getRuntimeNexusBaseUrl() === expectedBaseUrl
    })
  }
}

/** Read-only projection for the voice UI; Intelligence capability bindings remain the route owner. */
export function getRecognitionStatus(): VoiceRecognitionStatusSnapshot {
  const asr = capabilityStatus(ASR_CAPABILITY_ID, 'asr', 'VOICE_ASR')
  const buffered =
    asr.reason === 'VOICE_ASR_NOT_CONFIGURED' ? resolveNexusBufferedSttProvider() : null
  return {
    asr: buffered ? { ready: true, mode: 'buffered' } : asr,
    stt: capabilityStatus(STT_CAPABILITY_ID, 'stt', 'VOICE_STT')
  }
}

/** Resolves and freezes the shared route resolver's live-ASR adapter before microphone capture. */
export function getConfiguredAsrProvider(): ConfiguredAsrProvider {
  if (!hasEnabledCapabilityBinding(ASR_CAPABILITY_ID)) {
    const buffered = resolveNexusBufferedSttProvider()
    if (buffered) return buffered
    throw new Error('VOICE_ASR_NOT_CONFIGURED')
  }
  const route = resolveCapabilityProvider(ASR_CAPABILITY_ID, 'asr', true)
  if (!route?.model) {
    throw new Error(
      resolveCapabilityProvider(ASR_CAPABILITY_ID, 'asr')
        ? 'VOICE_ASR_CREDENTIAL_UNAVAILABLE'
        : 'VOICE_ASR_PROVIDER_UNAVAILABLE'
    )
  }
  const credential = isNexusManagedProvider(route.provider)
    ? getAuthToken()
    : resolveProviderCredential(route.provider)
  if (!credential) throw new Error('VOICE_ASR_CREDENTIAL_UNAVAILABLE')
  const metadata = getVoiceAsrMetadata(route.provider.metadata)
  if (!metadata) throw new Error('VOICE_ASR_PROVIDER_UNAVAILABLE')
  const recommendedModels = getVoiceCapabilityRecommendedModels(ASR_CAPABILITY_ID, {
    ...(route.provider.metadata ?? {}),
    baseUrl: route.provider.baseUrl
  })
  const model = recommendedModels.length
    ? recommendedModels.find((candidate) => route.bindingModels.includes(candidate))
    : route.model
  if (!model) throw new Error('VOICE_ASR_MODEL_UNSUPPORTED')
  const socketFactory = createNodeVoiceSocketFactory()
  const httpClient = createFetchHttpClient()
  switch (metadata.protocol) {
    case 'bailian-paraformer': {
      const endpoints = resolveBailianVoiceEndpoints(route.provider.baseUrl)
      return {
        model,
        mode: 'realtime',
        provider: new BailianParaformerVoiceProvider({
          credentials: { apiKey: credential, workspaceId: endpoints.workspaceId },
          socketFactory,
          httpClient,
          streamOptions: { model }
        })
      }
    }
    case 'dashscope-qwen-asr-realtime': {
      const endpoints = resolveBailianVoiceEndpoints(route.provider.baseUrl)
      return {
        model,
        mode: 'realtime',
        provider: new DashscopeQwenAsrRealtimeVoiceProvider({
          credentials: { apiKey: credential, workspaceId: endpoints.workspaceId },
          socketFactory,
          streamOptions: { model }
        })
      }
    }
    case 'doubao':
      return {
        model,
        mode: 'realtime',
        provider: new DoubaoVoiceProvider({
          credentials: { apiKey: credential, resourceId: metadata.resourceId! },
          socketFactory,
          httpClient,
          streamOptions: { model }
        })
      }
  }
}
