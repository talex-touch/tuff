import {
  resolveFirstIntelligenceProviderRoute,
  type IntelligenceProviderConfig,
  type IntelligenceProviderRoute
} from '@talex-touch/tuff-intelligence'
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
  loadInstalledModelSync,
  LocalOfflineVoiceProvider,
  resolveModelStoreRoot,
  VoiceProviderError,
  type ResolvedLocalModel,
  type VoiceProviderAdapter
} from '@talex-touch/tuff-voice'
import {
  getVoiceAsrMetadata,
  getVoiceCapabilityRecommendedModels,
  resolveBailianVoiceEndpoints
} from '@talex-touch/utils/intelligence/voice-asr'
import { isNexusManagedProvider } from '@talex-touch/utils/intelligence/nexus-provider'
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  type CatalogStatus,
  type VoiceProviderDescriptorV1,
  type VoiceProviderRegistry
} from '@talex-touch/utils/i18n'
import {
  ensureIntelligenceConfigLoaded,
  getCapabilityOptions,
  getEffectiveCapabilityRoutingConfig
} from '../ai/intelligence-config'
import { getIntelligenceProviderManager, providerSupportsCapability } from '../ai/intelligence-sdk'
import { createBufferedSttVoiceProvider } from './buffered-stt-provider'
import { getAuthToken, getSanitizedAuthSessionState } from '../auth'
import { getCatalogService } from '../catalog'
import { transcribeNexusAudio } from '../nexus/asr-client'
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
  const route = resolveCapabilityProvider(capabilityId, capabilityType, true)
  if (!route) {
    return { ready: false, reason: `${prefix}_CREDENTIAL_UNAVAILABLE` }
  }
  const metadata = getVoiceAsrMetadata(route.provider.metadata)
  if (capabilityType === 'asr' && metadata?.protocol === 'nexus-pack') {
    try {
      resolveNexusPackRoute(route, true)
      return { ready: true, mode: 'buffered' }
    } catch (error) {
      return recognitionFailure(error)
    }
  }
  return { ready: true }
}

type CapabilityRoute = IntelligenceProviderRoute<IntelligenceProviderConfig>

interface ResolvedNexusPackRoute {
  readonly descriptor: VoiceProviderDescriptorV1
  readonly model: string
  readonly packId: string
  readonly version: string
}

function packFailure(code: string): VoiceProviderError {
  return new VoiceProviderError(code, 'The signed voice provider catalog route is unavailable.')
}

function catalogFailure(status: CatalogStatus | null): VoiceProviderError {
  switch (status?.lastErrorCode) {
    case CATALOG_ERROR_CODES.packExpired:
      return packFailure('VOICE_ASR_PACK_EXPIRED')
    case CATALOG_ERROR_CODES.sdkIncompatible:
    case CATALOG_ERROR_CODES.schemaUnsupported:
    case CATALOG_ERROR_CODES.typeUnsupported:
      return packFailure('VOICE_ASR_PACK_UNSUPPORTED')
    case CATALOG_ERROR_CODES.signatureInvalid:
    case CATALOG_ERROR_CODES.hashMismatch:
      return packFailure('VOICE_ASR_PACK_SIGNATURE_INVALID')
    case CATALOG_ERROR_CODES.manifestInvalid:
    case CATALOG_ERROR_CODES.packInvalid:
    case CATALOG_ERROR_CODES.activePackInvalid:
    case CATALOG_ERROR_CODES.payloadEnvelopeInvalid:
    case CATALOG_ERROR_CODES.payloadDecryptFailed:
      return packFailure('VOICE_ASR_PACK_SCHEMA_INVALID')
    default:
      return packFailure('VOICE_ASR_PACK_NOT_CONFIGURED')
  }
}

function resolveNexusPackRoute(
  route: CapabilityRoute,
  required: boolean
): ResolvedNexusPackRoute | null {
  let registry: VoiceProviderRegistry | null
  let status: CatalogStatus | null = null
  try {
    const catalog = getCatalogService()
    registry = catalog.getVoiceProviderRegistry()
    status = catalog.getVoiceProviderStatus()
  } catch {
    registry = null
  }
  if (!registry) {
    if (required) throw catalogFailure(status)
    return null
  }
  if (registry.minSdkApi > CATALOG_CLIENT_SDKAPI) {
    throw packFailure('VOICE_ASR_PACK_UNSUPPORTED')
  }
  if (registry.expiry && Date.parse(registry.expiry) <= Date.now()) {
    throw packFailure('VOICE_ASR_PACK_EXPIRED')
  }
  if (!isNexusManagedProvider(route.provider)) {
    throw packFailure('VOICE_ASR_PACK_UNSUPPORTED')
  }

  const descriptor = registry.get(route.provider.id)
  if (!descriptor) throw packFailure('VOICE_ASR_PACK_NOT_CONFIGURED')
  if (
    descriptor.protocol !== 'nexus-pack' ||
    descriptor.transport !== 'http-upload' ||
    descriptor.auth.mode !== 'nexus-session' ||
    descriptor.request.body !== 'raw-bytes' ||
    descriptor.request.contentTypePolicy !== 'audio/*' ||
    !descriptor.request.idempotencyHeader ||
    !descriptor.endpoint.pollPath ||
    descriptor.limits.maxBytes <= 44 ||
    descriptor.limits.maxDurationSec <= 0 ||
    descriptor.limits.timeoutMs < 100
  ) {
    throw packFailure('VOICE_ASR_PACK_UNSUPPORTED')
  }

  try {
    if (new URL(descriptor.endpoint.baseUrl).origin !== new URL(getRuntimeNexusBaseUrl()).origin) {
      throw packFailure('VOICE_ASR_PACK_UNSUPPORTED')
    }
  } catch (error) {
    if (error instanceof VoiceProviderError) throw error
    throw packFailure('VOICE_ASR_PACK_UNSUPPORTED')
  }

  const model = descriptor.models.some((candidate) => candidate.id === route.model)
    ? route.model
    : undefined
  if (!model) throw packFailure('VOICE_ASR_PACK_UNSUPPORTED')
  return { descriptor, model, packId: registry.packId, version: registry.version }
}

function createNexusPackBufferedProvider(
  route: CapabilityRoute,
  resolved: ResolvedNexusPackRoute,
  authorityCheck: () => boolean
): ConfiguredAsrProvider {
  const { descriptor, model, packId, version } = resolved
  return {
    model,
    mode: 'buffered',
    provider: createBufferedSttVoiceProvider({
      providerId: route.provider.id,
      model,
      authorityCheck,
      maxBufferBytes: descriptor.limits.maxBytes - 44,
      maxDurationSec: descriptor.limits.maxDurationSec,
      timeoutMs: descriptor.limits.timeoutMs,
      invoke: async (payload, options) => {
        const startedAt = Date.now()
        const idempotencyKey = options?.metadata?.idempotencyKey
        const result = await transcribeNexusAudio(payload, {
          signal: options?.signal,
          timeout: options?.timeout,
          idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
          route: descriptor
        })
        return {
          result,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model,
          latency: Date.now() - startedAt,
          traceId: result.billing?.requestId ?? `${packId}:${version}`,
          provider: route.provider.id
        }
      }
    })
  }
}

function recognitionFailure(error: unknown): VoiceRecognitionStatus {
  return {
    ready: false,
    reason:
      error instanceof VoiceProviderError && /^VOICE_ASR_[A-Z0-9_:-]{3,120}$/.test(error.code)
        ? error.code
        : 'VOICE_ASR_PROVIDER_UNAVAILABLE'
  }
}

function resolveNexusBufferedSttProvider(): ConfiguredAsrProvider | null {
  const route = resolveCapabilityProvider(STT_CAPABILITY_ID, 'stt', true)
  if (!route?.model || !isNexusManagedProvider(route.provider)) return null
  const expectedUserId = getSanitizedAuthSessionState().user?.id
  if (!expectedUserId) return null
  const expectedBaseUrl = getRuntimeNexusBaseUrl()
  const authorityCheck = () =>
    getSanitizedAuthSessionState().user?.id === expectedUserId &&
    getRuntimeNexusBaseUrl() === expectedBaseUrl
  if (getVoiceAsrMetadata(route.provider.metadata)?.protocol === 'nexus-pack') {
    const resolved = resolveNexusPackRoute(route, false)
    if (resolved) return createNexusPackBufferedProvider(route, resolved, authorityCheck)
  }
  if (route.model !== NEXUS_AUDIO_TRANSCRIBE_MODEL) return null
  return {
    model: route.model,
    mode: 'buffered',
    provider: createBufferedSttVoiceProvider({
      providerId: route.provider.id,
      model: route.model,
      authorityCheck
    })
  }
}

/** Read-only projection for the voice UI; Intelligence capability bindings remain the route owner. */
export function getRecognitionStatus(): VoiceRecognitionStatusSnapshot {
  const asr = capabilityStatus(ASR_CAPABILITY_ID, 'asr', 'VOICE_ASR')
  if (asr.reason === 'VOICE_ASR_NOT_CONFIGURED') {
    try {
      const buffered = resolveNexusBufferedSttProvider()
      if (buffered) {
        return {
          asr: { ready: true, mode: 'buffered' },
          stt: capabilityStatus(STT_CAPABILITY_ID, 'stt', 'VOICE_STT')
        }
      }
    } catch (error) {
      return {
        asr: recognitionFailure(error),
        stt: capabilityStatus(STT_CAPABILITY_ID, 'stt', 'VOICE_STT')
      }
    }
  }
  return { asr, stt: capabilityStatus(STT_CAPABILITY_ID, 'stt', 'VOICE_STT') }
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

  /*
   * Local inference settles before the credential gate rather than after it. The weights are
   * on this machine and no service is contacted, so demanding an API key would make the one
   * provider that needs no key the one that cannot be selected. Here the route's `model`
   * names an installed catalog bundle, and "is it installed?" is the only availability
   * question that applies: the install tool already verified the digest, and re-hashing a
   * 78 MB file on this path would stall startup to learn nothing new.
   *
   * `buffered` is the honest mode. Every decode is a whole-file decode of the audio captured
   * so far, which can run past the 30 s streaming allowance on a long recording, and the
   * request id is per-attempt rather than session-scoped.
   */
  if (metadata.protocol === 'local-offline') {
    let installed: ResolvedLocalModel
    try {
      installed = loadInstalledModelSync(resolveModelStoreRoot(), model)
    } catch (error) {
      throw new Error('VOICE_ASR_PROVIDER_UNAVAILABLE', { cause: error })
    }
    return {
      model: `${installed.descriptor.id}@${installed.descriptor.version}`,
      mode: 'buffered',
      provider: new LocalOfflineVoiceProvider({ model: installed })
    }
  }

  const credential = isNexusManagedProvider(route.provider)
    ? getAuthToken()
    : resolveProviderCredential(route.provider)
  if (!credential) throw new Error('VOICE_ASR_CREDENTIAL_UNAVAILABLE')
  switch (metadata.protocol) {
    case 'nexus-pack': {
      const resolved = resolveNexusPackRoute(route, true)
      if (!resolved) throw packFailure('VOICE_ASR_PACK_NOT_CONFIGURED')
      const expectedUserId = getSanitizedAuthSessionState().user?.id
      if (!expectedUserId) throw new Error('VOICE_ASR_CREDENTIAL_UNAVAILABLE')
      const expectedBaseUrl = getRuntimeNexusBaseUrl()
      return createNexusPackBufferedProvider(
        route,
        resolved,
        () =>
          getSanitizedAuthSessionState().user?.id === expectedUserId &&
          getRuntimeNexusBaseUrl() === expectedBaseUrl
      )
    }
    case 'bailian-paraformer': {
      const endpoints = resolveBailianVoiceEndpoints(route.provider.baseUrl)
      return {
        model,
        mode: 'realtime',
        provider: new BailianParaformerVoiceProvider({
          credentials: { apiKey: credential, workspaceId: endpoints.workspaceId },
          socketFactory: createNodeVoiceSocketFactory(),
          httpClient: createFetchHttpClient(),
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
          socketFactory: createNodeVoiceSocketFactory(),
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
          socketFactory: createNodeVoiceSocketFactory(),
          httpClient: createFetchHttpClient(),
          streamOptions: { model }
        })
      }
  }
}
