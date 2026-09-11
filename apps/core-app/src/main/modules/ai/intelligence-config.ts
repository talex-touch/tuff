import type {
  IntelligenceCapabilityRoutingConfig,
  IntelligencePromptBinding,
  IntelligencePromptRecord,
  IntelligenceProviderConfig,
  IntelligenceSDKPersistedConfig
} from '@talex-touch/tuff-intelligence'
import process from 'node:process'
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS,
  IntelligenceProviderType,
  NEXUS_AUDIO_TRANSCRIBE_MODEL,
  resolveIntelligencePromptTemplate,
  toRuntimeCapabilityId
} from '@talex-touch/tuff-intelligence'
import { StorageList } from '@talex-touch/utils'
import {
  DASHSCOPE_QWEN_ASR_REALTIME_MODELS,
  getVoiceCapabilityRecommendedModels
} from '@talex-touch/utils/intelligence/voice-asr'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'
import { getSanitizedAuthSessionState, subscribeAuthState } from '../auth'
import { tuffIntelligence } from './intelligence-sdk'
import { normalizeProviderForRuntime, TUFF_NEXUS_PROVIDER_ID } from './provider-runtime'
import {
  getResolvedPiExecutable,
  PI_CLI_ORIGIN,
  PI_CLI_PROVIDER_ID
} from './providers/pi-cli-runtime'

const intelligenceConfigLog = getLogger('intelligence-config')

const SUPPORTED_PROVIDER_TYPES = new Set([
  'openai',
  'anthropic',
  'deepseek',
  'siliconflow',
  'local',
  'custom'
])
const INTELLIGENCE_DEFAULT_VERSION = 2
const DEFAULT_PROMPT_VERSION = '1.0.0'

export const INTERNAL_SYSTEM_OCR_PROVIDER_ID = 'local-system-ocr'

const INTERNAL_SYSTEM_OCR_PROVIDER: IntelligenceProviderConfig = {
  id: INTERNAL_SYSTEM_OCR_PROVIDER_ID,
  type: IntelligenceProviderType.LOCAL,
  name: 'System OCR',
  enabled: true,
  priority: 0,
  models: ['system-ocr'],
  timeout: 30000,
  capabilities: ['vision.ocr'],
  metadata: {
    internal: true,
    engine: 'system-ocr'
  }
}

const INTERNAL_SYSTEM_OCR_CAPABILITY_ID = 'vision.ocr'
const INTERNAL_SYSTEM_OCR_MODEL = 'system-ocr'

/**
 * The locally installed `pi` CLI, exposed as a provider so a machine with it needs no API key to
 * chat. Injected at runtime rather than persisted, for the same reason as the OCR provider above:
 * availability is a property of the machine, and a stored `enabled: true` would follow a synced
 * config onto a machine where the binary does not exist.
 *
 * Only `text.chat` is declared. `pi` could serve the other text capabilities through the same chat
 * call, but declaring them would silently re-route surfaces like translation onto a local agent that
 * the user never chose for that job.
 */
/** Below every seeded binding (the default set tops out at 5), so `pi` sorts last in routing. */
const PI_CLI_BINDING_PRIORITY = 99

const PI_CLI_PROVIDER: IntelligenceProviderConfig = {
  id: PI_CLI_PROVIDER_ID,
  type: IntelligenceProviderType.LOCAL,
  name: 'Pi (local CLI)',
  enabled: true,
  priority: 0,
  models: [],
  timeout: 120000,
  capabilities: ['text.chat'],
  metadata: {
    internal: true,
    origin: PI_CLI_ORIGIN
  }
}

let lastAppliedRuntimeConfigSignature: string | null = null
let teardownConfigUpdateListener: (() => void) | null = null
let teardownAuthStateListener: (() => void) | null = null

/**
 * Signed-in value this module last acted on, or `null` before the first observation.
 *
 * Auth notifications also fire for token refreshes and profile updates that leave `isSignedIn`
 * unchanged, so Nexus enablement keys off transitions only: a refresh must never reopen a provider
 * the user just turned off mid-session.
 *
 * Committed only after the reconciliation write landed, so a storage failure leaves it unset and
 * the next notification retries the transition instead of being treated as already applied.
 */
let lastAppliedAuthSignedIn: boolean | null = null

/**
 * Key under the Nexus provider's `metadata` recording that the user switched the route off.
 *
 * The provider's `enabled` flag cannot tell a click on the channels page apart from this module's
 * auth-managed writes: both persist the same boolean, and sign-out writes `false` on its own. The
 * override is stored beside the flag so a restart or a re-login cannot reopen a route the user
 * closed, while a route that was only auth-managed still comes back on the next sign-in.
 */
const NEXUS_ROUTE_USER_DISABLED_KEY = 'nexusRouteUserDisabled'

/**
 * The persisted Nexus `enabled` value this module last knew about: the value it wrote itself, the
 * value it read on the last load, or `null` before the config was read. A move away from it is the
 * user's own decision, because nothing else writes this flag.
 */
let observedNexusEnabled: boolean | null = null

function findNexusProvider(
  config: IntelligenceSDKPersistedConfig
): IntelligenceProviderConfig | undefined {
  return (config.providers ?? []).find((provider) => provider.id === TUFF_NEXUS_PROVIDER_ID)
}

function isNexusRouteDisabledByUser(config: IntelligenceSDKPersistedConfig): boolean {
  return findNexusProvider(config)?.metadata?.[NEXUS_ROUTE_USER_DISABLED_KEY] === true
}

/** Records (or clears) the user's override, returning whether the persisted metadata changed. */
function setNexusRouteDisabledByUser(
  config: IntelligenceSDKPersistedConfig,
  disabled: boolean
): boolean {
  const provider = findNexusProvider(config)
  if (!provider) return false

  const metadata = { ...(provider.metadata ?? {}) }
  if (disabled) {
    if (metadata[NEXUS_ROUTE_USER_DISABLED_KEY] === true) return false
    metadata[NEXUS_ROUTE_USER_DISABLED_KEY] = true
  } else {
    if (!(NEXUS_ROUTE_USER_DISABLED_KEY in metadata)) return false
    delete metadata[NEXUS_ROUTE_USER_DISABLED_KEY]
  }

  provider.metadata = metadata
  return true
}

/**
 * Records the user's decision when the persisted flag moved without this module writing it.
 *
 * Called from the config listener before the reload refreshes `observedNexusEnabled`, so the
 * comparison still sees the value from before the change.
 */
function applyNexusRouteUserPreference(): boolean {
  const stored = getLatestConfig()
  if (!stored) return false

  const provider = findNexusProvider(stored)
  if (!provider) return false

  const enabled = provider.enabled === true
  const previous = observedNexusEnabled
  observedNexusEnabled = enabled
  if (previous === null || previous === enabled) return false

  if (!setNexusRouteDisabledByUser(stored, !enabled)) return false
  saveMainConfig(StorageList.IntelligenceConfig, stored)
  intelligenceConfigLog.info('Nexus route preference recorded', { enabled })
  return true
}

function normalizeStrategyId(value?: string) {
  if (!value) return undefined
  if (value === 'priority') return 'rule-based-default'
  if (value === 'adaptive') return 'adaptive-default'
  return value
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function buildCapabilityPromptId(capabilityId: string): string {
  return `capability.${capabilityId}.default`
}

function normalizePromptBindingCapability(
  capabilityId: string,
  binding: IntelligencePromptBinding
): IntelligencePromptBinding {
  const { capabilityId: _ignored, ...rest } = binding
  return {
    capabilityId,
    ...rest
  }
}

function upsertPromptBinding(
  list: IntelligencePromptBinding[],
  binding: IntelligencePromptBinding
): boolean {
  const idx = list.findIndex(
    (item) =>
      item.capabilityId === binding.capabilityId &&
      (item.providerId ?? null) === (binding.providerId ?? null)
  )
  if (idx >= 0) {
    const current = list[idx]!
    const next = {
      ...current,
      ...binding
    }
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      list[idx] = next
      return true
    }
    return false
  }
  list.push(binding)
  return true
}

function upsertPromptRecord(
  list: IntelligencePromptRecord[],
  record: IntelligencePromptRecord
): boolean {
  const idx = list.findIndex(
    (item) =>
      item.id === record.id &&
      item.version === record.version &&
      (item.providerId ?? null) === (record.providerId ?? null)
  )
  if (idx >= 0) {
    const current = list[idx]!
    const preservedUpdatedAt = Number.isFinite(current.updatedAt)
      ? current.updatedAt
      : record.updatedAt
    const comparableNext = {
      ...current,
      ...record,
      updatedAt: preservedUpdatedAt
    }
    if (JSON.stringify(current) === JSON.stringify(comparableNext)) {
      return false
    }
    list[idx] = {
      ...comparableNext,
      updatedAt: record.updatedAt
    }
    return true
  }
  list.push(record)
  return true
}

function syncPromptSchema(config: IntelligenceSDKPersistedConfig): boolean {
  let changed = false
  const capabilities = config.capabilities ?? {}
  const promptRegistry = Array.isArray(config.promptRegistry) ? [...config.promptRegistry] : []
  const promptBindings = Array.isArray(config.promptBindings) ? [...config.promptBindings] : []
  const nowTs = Date.now()

  for (const [capabilityId, capabilityConfig] of Object.entries(capabilities)) {
    const promptTemplate =
      typeof capabilityConfig.promptTemplate === 'string'
        ? capabilityConfig.promptTemplate.trim()
        : ''

    const candidateBinding = capabilityConfig.promptBinding
      ? normalizePromptBindingCapability(capabilityId, capabilityConfig.promptBinding)
      : promptBindings.find((item) => item.capabilityId === capabilityId)

    if (!promptTemplate) {
      if (candidateBinding && !capabilityConfig.promptBinding) {
        capabilityConfig.promptBinding = candidateBinding
        changed = true
      }
      continue
    }

    const binding: IntelligencePromptBinding = candidateBinding ?? {
      capabilityId,
      promptId: buildCapabilityPromptId(capabilityId),
      promptVersion: DEFAULT_PROMPT_VERSION,
      channel: 'stable'
    }

    if (!binding.promptVersion) {
      binding.promptVersion = DEFAULT_PROMPT_VERSION
      changed = true
    }

    if (upsertPromptBinding(promptBindings, binding)) {
      changed = true
    }

    if (!capabilityConfig.promptBinding) {
      capabilityConfig.promptBinding = binding
      changed = true
    }

    const record: IntelligencePromptRecord = {
      id: binding.promptId,
      version: binding.promptVersion || DEFAULT_PROMPT_VERSION,
      name: `${capabilityId} prompt`,
      template: promptTemplate,
      scope: 'capability',
      status: 'active',
      capabilityId,
      providerId: binding.providerId,
      channel: binding.channel ?? 'stable',
      updatedAt: nowTs
    }
    if (upsertPromptRecord(promptRegistry, record)) {
      changed = true
    }
  }

  if (!Array.isArray(config.promptRegistry)) {
    changed = true
  }
  if (!Array.isArray(config.promptBindings)) {
    changed = true
  }

  config.promptRegistry = promptRegistry
  config.promptBindings = promptBindings
  return changed
}

function resolveCapabilityPromptTemplate(
  config: IntelligenceSDKPersistedConfig | undefined,
  capabilityId: string
): string | undefined {
  const normalizedCapabilityId = toRuntimeCapabilityId(capabilityId)
  if (!config || !normalizedCapabilityId) {
    return undefined
  }

  return resolveIntelligencePromptTemplate({
    capabilityId: normalizedCapabilityId,
    capability: config.capabilities?.[normalizedCapabilityId],
    promptRegistry: config.promptRegistry,
    promptBindings: config.promptBindings
  })
}

function createDefaultPersistedConfig(): IntelligenceSDKPersistedConfig {
  const config: IntelligenceSDKPersistedConfig = {
    providers: cloneValue(DEFAULT_PROVIDERS),
    globalConfig: {
      defaultStrategy: DEFAULT_GLOBAL_CONFIG.defaultStrategy,
      enableAudit: DEFAULT_GLOBAL_CONFIG.enableAudit,
      enableCache: DEFAULT_GLOBAL_CONFIG.enableCache,
      enableQuota: DEFAULT_GLOBAL_CONFIG.enableQuota ?? true,
      cacheExpiration: DEFAULT_GLOBAL_CONFIG.cacheExpiration
    },
    capabilities: cloneValue(DEFAULT_CAPABILITIES),
    promptRegistry: [],
    promptBindings: [],
    version: INTELLIGENCE_DEFAULT_VERSION
  }
  syncPromptSchema(config)
  return config
}

function patchStoredConfigDefaults(config: IntelligenceSDKPersistedConfig): boolean {
  let changed = false

  if (!Array.isArray(config.providers)) {
    config.providers = []
    changed = true
  }

  if (!config.globalConfig || typeof config.globalConfig !== 'object') {
    config.globalConfig = {
      defaultStrategy: DEFAULT_GLOBAL_CONFIG.defaultStrategy,
      enableAudit: DEFAULT_GLOBAL_CONFIG.enableAudit,
      enableCache: DEFAULT_GLOBAL_CONFIG.enableCache,
      enableQuota: DEFAULT_GLOBAL_CONFIG.enableQuota ?? true,
      cacheExpiration: DEFAULT_GLOBAL_CONFIG.cacheExpiration
    }
    changed = true
  }

  if (config.globalConfig.enableQuota === undefined) {
    config.globalConfig.enableQuota = DEFAULT_GLOBAL_CONFIG.enableQuota ?? true
    changed = true
  }

  if (!config.capabilities || typeof config.capabilities !== 'object') {
    config.capabilities = {}
    changed = true
  }

  if (!Number.isFinite(config.version)) {
    config.version = INTELLIGENCE_DEFAULT_VERSION
    changed = true
  }

  const nexusDefault = DEFAULT_PROVIDERS.find((provider) => provider.id === TUFF_NEXUS_PROVIDER_ID)
  if (
    nexusDefault &&
    !config.providers.some((provider) => provider.id === TUFF_NEXUS_PROVIDER_ID)
  ) {
    config.providers.unshift(cloneValue(nexusDefault))
    changed = true
  }

  const nexusProvider = config.providers.find((provider) => provider.id === TUFF_NEXUS_PROVIDER_ID)
  if (nexusProvider) {
    const defaultCapabilities = nexusDefault?.capabilities ?? []
    const capabilities = new Set([...(nexusProvider.capabilities ?? []), ...defaultCapabilities])
    capabilities.delete('audio.tts')
    if (!capabilities.has('image.translate.e2e')) {
      capabilities.add('image.translate.e2e')
    }
    if (JSON.stringify(nexusProvider.capabilities ?? []) !== JSON.stringify([...capabilities])) {
      nexusProvider.capabilities = [...capabilities]
      changed = true
    }
  }

  for (const [capabilityId, defaultCapability] of Object.entries(DEFAULT_CAPABILITIES)) {
    if (!config.capabilities[capabilityId]) {
      config.capabilities[capabilityId] = cloneValue(defaultCapability)
      changed = true
    }
  }
  for (const capabilityId of ['audio.asr', 'audio.stt']) {
    const capability = config.capabilities[capabilityId]
    if (!Array.isArray(capability?.providers)) continue

    for (const binding of capability.providers) {
      if (binding.enabled === false) continue
      const provider = config.providers.find((candidate) => candidate.id === binding.providerId)
      if (!provider) continue
      const currentVoiceProtocol =
        provider.metadata?.voiceAsr &&
        typeof provider.metadata.voiceAsr === 'object' &&
        !Array.isArray(provider.metadata.voiceAsr)
          ? (provider.metadata.voiceAsr as Record<string, unknown>).protocol
          : undefined
      const hasQwenRealtimeModel = (binding.models ?? []).some((model) =>
        DASHSCOPE_QWEN_ASR_REALTIME_MODELS.includes(
          model as (typeof DASHSCOPE_QWEN_ASR_REALTIME_MODELS)[number]
        )
      )
      if (hasQwenRealtimeModel && currentVoiceProtocol !== 'dashscope-qwen-asr-realtime') {
        provider.metadata = {
          ...(provider.metadata ?? {}),
          voiceAsr: { protocol: 'dashscope-qwen-asr-realtime' }
        }
        changed = true
      }
      const recommendations = getVoiceCapabilityRecommendedModels(capabilityId, {
        ...(provider.metadata ?? {}),
        baseUrl: provider.baseUrl
      })
      if (!recommendations.length) continue

      const supportedModels = (binding.models ?? []).filter((model) =>
        recommendations.includes(model)
      )
      const nextModels = supportedModels.length > 0 ? supportedModels : [recommendations[0]]
      if (
        nextModels.length === (binding.models ?? []).length &&
        nextModels.every((model, index) => model === binding.models?.[index])
      ) {
        continue
      }
      binding.models = nextModels
      changed = true
    }
  }

  const ttsCapability = config.capabilities['audio.tts']
  if (Array.isArray(ttsCapability?.providers)) {
    const providers = ttsCapability.providers.filter(
      (binding) => binding.providerId !== TUFF_NEXUS_PROVIDER_ID
    )
    if (providers.length !== ttsCapability.providers.length) {
      ttsCapability.providers = providers
      changed = true
    }
  }

  if (nexusProvider?.enabled !== true) {
    for (const capability of Object.values(config.capabilities)) {
      if (!Array.isArray(capability.providers)) {
        continue
      }

      for (const binding of capability.providers) {
        if (binding.providerId === TUFF_NEXUS_PROVIDER_ID && binding.enabled !== false) {
          binding.enabled = false
          changed = true
        }
      }
    }
  }

  const textChatCapability = config.capabilities['text.chat']
  if (
    Array.isArray(textChatCapability?.providers) &&
    !textChatCapability.providers.some((binding) => binding.providerId === TUFF_NEXUS_PROVIDER_ID)
  ) {
    textChatCapability.providers.unshift({
      providerId: TUFF_NEXUS_PROVIDER_ID,
      priority: 1,
      enabled: false
    })
    changed = true
  }

  const sttCapability = config.capabilities['audio.stt']
  if (sttCapability && !Array.isArray(sttCapability.providers)) {
    sttCapability.providers = []
    changed = true
  }
  if (Array.isArray(sttCapability?.providers)) {
    const nexusBinding = sttCapability.providers.find(
      (binding) => binding.providerId === TUFF_NEXUS_PROVIDER_ID
    )
    if (!nexusBinding) {
      sttCapability.providers.push({
        providerId: TUFF_NEXUS_PROVIDER_ID,
        models: [NEXUS_AUDIO_TRANSCRIBE_MODEL],
        priority: 3,
        enabled: false
      })
      changed = true
    } else if (
      !Array.isArray(nexusBinding.models) ||
      nexusBinding.models.length !== 1 ||
      nexusBinding.models[0] !== NEXUS_AUDIO_TRANSCRIBE_MODEL
    ) {
      nexusBinding.models = [NEXUS_AUDIO_TRANSCRIBE_MODEL]
      changed = true
    }
  }

  if (process.env.TUFF_DISABLE_NATIVE_OCR !== '1') {
    if (!config.capabilities[INTERNAL_SYSTEM_OCR_CAPABILITY_ID]) {
      config.capabilities[INTERNAL_SYSTEM_OCR_CAPABILITY_ID] = cloneValue(
        DEFAULT_CAPABILITIES[INTERNAL_SYSTEM_OCR_CAPABILITY_ID]
      )
      changed = true
    }

    const visionOcrCapability = config.capabilities[INTERNAL_SYSTEM_OCR_CAPABILITY_ID]
    if (visionOcrCapability) {
      if (!Array.isArray(visionOcrCapability.providers)) {
        visionOcrCapability.providers = []
        changed = true
      }

      if (
        !visionOcrCapability.providers.some(
          (binding) => binding.providerId === INTERNAL_SYSTEM_OCR_PROVIDER_ID
        )
      ) {
        visionOcrCapability.providers.unshift({
          providerId: INTERNAL_SYSTEM_OCR_PROVIDER_ID,
          priority: 0,
          enabled: true,
          models: [INTERNAL_SYSTEM_OCR_MODEL]
        })
        changed = true
      }
    }
  }

  if (syncPromptSchema(config)) {
    changed = true
  }

  return changed
}

/**
 * 实时从 storage 获取最新配置，不使用内部缓存
 */
function getLatestConfig(): IntelligenceSDKPersistedConfig | undefined {
  const stored = getMainConfig(StorageList.IntelligenceConfig) as
    | IntelligenceSDKPersistedConfig
    | undefined
  if (!stored || Object.keys(stored).length === 0) {
    const seeded = createDefaultPersistedConfig()
    saveMainConfig(StorageList.IntelligenceConfig, seeded)
    return seeded
  }
  return stored
}

/**
 * Adds the `pi` binding to `text.chat` routing, returning a copy so the stored config is never
 * mutated by a runtime-only decision.
 *
 * Injecting the provider is not enough on its own: once a capability has any enabled binding,
 * `allowedProviderIds` is narrowed to exactly those provider ids, and an unbound provider is
 * filtered out before the credential check ever runs.
 *
 * The priority is deliberately the lowest of any binding, so `pi` only ever answers when every
 * provider the user configured themselves is unusable — it is a floor, not a preference.
 */
function withPiChatBinding(
  capabilities: Record<string, IntelligenceCapabilityRoutingConfig>,
  piAvailable: boolean
): Record<string, IntelligenceCapabilityRoutingConfig> {
  if (!piAvailable) return capabilities

  const chatRouting = capabilities['text.chat']
  const bindings = chatRouting?.providers ?? []
  if (bindings.some((binding) => binding.providerId === PI_CLI_PROVIDER_ID)) {
    return capabilities
  }

  return {
    ...capabilities,
    'text.chat': {
      ...(chatRouting ?? { id: 'text.chat', providers: [] }),
      providers: [
        ...bindings,
        { providerId: PI_CLI_PROVIDER_ID, priority: PI_CLI_BINDING_PRIORITY, enabled: true }
      ]
    }
  }
}

export function ensureIntelligenceConfigLoaded(force = false): void {
  // 每次都实时从 storage 读取最新配置
  const stored = getLatestConfig()

  if (!stored) {
    return
  }

  // Refresh the baseline the user-preference check compares against. The listener calls that check
  // before this reload precisely because this line moves it.
  observedNexusEnabled = findNexusProvider(stored)?.enabled === true

  const patched = patchStoredConfigDefaults(stored)
  if (patched) {
    saveMainConfig(StorageList.IntelligenceConfig, stored)
  }

  const normalizedStrategy =
    normalizeStrategyId(stored.globalConfig?.defaultStrategy) ?? 'adaptive-default'

  const providers = (stored.providers ?? [])
    .filter((provider) => {
      if (!SUPPORTED_PROVIDER_TYPES.has(provider.type)) {
        return false
      }
      return true
    })
    .map(normalizeProviderForRuntime)

  const nativeOcrDisabledByEnv = process.env.TUFF_DISABLE_NATIVE_OCR === '1'
  const hasInternalProvider = providers.some(
    (provider) => provider.id === INTERNAL_SYSTEM_OCR_PROVIDER_ID
  )
  if (!nativeOcrDisabledByEnv && !hasInternalProvider) {
    providers.unshift({ ...INTERNAL_SYSTEM_OCR_PROVIDER })
  }

  const piAvailable = Boolean(getResolvedPiExecutable())
  const hasPiProvider = providers.some((provider) => provider.id === PI_CLI_PROVIDER_ID)
  if (piAvailable && !hasPiProvider) {
    providers.push({ ...PI_CLI_PROVIDER })
  }

  const nextRuntimeConfig = {
    providers,
    defaultStrategy: normalizedStrategy,
    enableAudit: stored.globalConfig?.enableAudit ?? true,
    enableCache: stored.globalConfig?.enableCache ?? false,
    enableQuota: stored.globalConfig?.enableQuota ?? true,
    cacheExpiration: stored.globalConfig?.cacheExpiration,
    capabilities: withPiChatBinding(stored.capabilities ?? {}, piAvailable),
    promptRegistry: stored.promptRegistry ?? [],
    promptBindings: stored.promptBindings ?? []
  }

  const signature = safeJsonStringify(nextRuntimeConfig)
  if (!force && signature === lastAppliedRuntimeConfigSignature) {
    return
  }

  lastAppliedRuntimeConfigSignature = signature
  tuffIntelligence.updateConfig(nextRuntimeConfig)
}

function resolveEffectiveCapabilityRoutingConfig(
  capabilityMap: Record<string, IntelligenceCapabilityRoutingConfig>,
  capabilityId: string
): IntelligenceCapabilityRoutingConfig | undefined {
  const capabilityRouting = capabilityMap[capabilityId]
  const fallbackCapabilityId =
    capabilityId === 'search.semantic' || capabilityId === 'search.rerank'
      ? 'embedding.generate'
      : capabilityId === 'workflow.execute' || capabilityId === 'agent.run'
        ? 'text.chat'
        : undefined

  if (!fallbackCapabilityId) {
    return capabilityRouting
  }

  const hasEnabledCapabilityBinding = capabilityRouting?.providers?.some(
    (binding) => binding.enabled !== false
  )
  return hasEnabledCapabilityBinding
    ? capabilityRouting
    : (capabilityMap[fallbackCapabilityId] ?? capabilityRouting)
}

export function getEffectiveCapabilityRoutingConfig(
  capabilityId: string
): IntelligenceCapabilityRoutingConfig | undefined {
  const normalizedCapabilityId = toRuntimeCapabilityId(capabilityId)
  if (!normalizedCapabilityId) {
    return undefined
  }
  return resolveEffectiveCapabilityRoutingConfig(
    getLatestConfig()?.capabilities ?? {},
    normalizedCapabilityId
  )
}

export function getCapabilityOptions(capabilityId: string): {
  allowedProviderIds?: string[]
  modelPreference?: string[]
  promptTemplate?: string
} {
  // 实时从 storage 读取
  const stored = getLatestConfig()
  const normalizedCapabilityId = toRuntimeCapabilityId(capabilityId)
  const capabilityMap = stored?.capabilities ?? {}
  const config = normalizedCapabilityId
    ? resolveEffectiveCapabilityRoutingConfig(capabilityMap, normalizedCapabilityId)
    : undefined

  if (!config) {
    return {}
  }

  const enabledProviderIds = new Set(
    (stored?.providers ?? [])
      .filter((provider) => provider.enabled !== false)
      .map((provider) => provider.id)
  )
  if (
    normalizedCapabilityId === INTERNAL_SYSTEM_OCR_CAPABILITY_ID &&
    process.env.TUFF_DISABLE_NATIVE_OCR !== '1'
  ) {
    enabledProviderIds.add(INTERNAL_SYSTEM_OCR_PROVIDER_ID)
  }
  const enabledBindings =
    config.providers?.filter(
      (binding) => binding.enabled !== false && enabledProviderIds.has(binding.providerId)
    ) ?? []
  return {
    allowedProviderIds: enabledBindings.length
      ? enabledBindings.map((binding) => binding.providerId)
      : undefined,
    modelPreference: enabledBindings
      .flatMap((binding) => binding.models ?? [])
      .filter((model): model is string => Boolean(model)),
    promptTemplate: resolveCapabilityPromptTemplate(stored, normalizedCapabilityId)
  }
}

export function getCapabilityPrompt(capabilityId: string): string | undefined {
  // 实时从 storage 读取
  const stored = getLatestConfig()
  return resolveCapabilityPromptTemplate(stored, toRuntimeCapabilityId(capabilityId))
}

export function listCapabilities(): IntelligenceCapabilityRoutingConfig[] {
  // 实时从 storage 读取
  const stored = getLatestConfig()
  const capabilityMap = stored?.capabilities ?? {}
  return Object.values(capabilityMap)
}

export function getCapabilitiesMap(): Record<string, IntelligenceCapabilityRoutingConfig> {
  // 实时从 storage 读取
  const stored = getLatestConfig()
  return stored?.capabilities ?? {}
}

/**
 * Mirrors a sign-in transition onto the Nexus provider flag.
 *
 * Signing in is what makes the injected access token usable, so the provider the user never
 * explicitly trusted gets enabled for them. Signing out takes it back off, which is also why the
 * seeded default stays `enabled: false`: a guest machine must not advertise a Nexus route.
 *
 * Only the Nexus provider is touched. Bindings for other providers keep their flags and priorities,
 * so Nexus (already priority 1 in `text.chat`) simply becomes the preferred route whenever nothing
 * else the user configured is enabled.
 */
function applyNexusProviderAuthState(signedIn: boolean): boolean {
  const stored = getLatestConfig()
  if (!stored) return false

  const provider = findNexusProvider(stored)
  if (!provider) return false

  if (!signedIn) {
    const providerChanged = provider.enabled !== false
    provider.enabled = false
    // Disabling Nexus is mirrored onto every Nexus binding by the patch pass, so the per-binding
    // flags stay owned by one place instead of being flipped twice.
    const changed = patchStoredConfigDefaults(stored) || providerChanged
    if (!changed) {
      observedNexusEnabled = false
      return false
    }
    saveMainConfig(StorageList.IntelligenceConfig, stored)
    observedNexusEnabled = false
    return true
  }

  // A route the user closed stays closed. Signing in is what makes the injected token usable, not
  // a reason to overrule the channels page; only an explicit re-enable clears the override, and
  // the config listener records that.
  const userDisabled = isNexusRouteDisabledByUser(stored)
  let changed = false
  if (userDisabled && provider.enabled !== false) {
    provider.enabled = false
    changed = true
  }

  // Patch before enabling: the patch pass seeds the `text.chat` / `audio.stt` Nexus bindings with
  // `enabled: false`, which would otherwise undo the enablement below on the next reload.
  if (patchStoredConfigDefaults(stored)) changed = true

  if (!userDisabled) {
    if (provider.enabled !== true) {
      provider.enabled = true
      changed = true
    }

    for (const capability of Object.values(stored.capabilities ?? {})) {
      for (const binding of capability.providers ?? []) {
        if (binding.providerId === TUFF_NEXUS_PROVIDER_ID && binding.enabled === false) {
          binding.enabled = true
          changed = true
        }
      }
    }
  }

  if (!changed) {
    observedNexusEnabled = provider.enabled === true
    return false
  }

  saveMainConfig(StorageList.IntelligenceConfig, stored)
  observedNexusEnabled = provider.enabled === true
  return true
}

/**
 * Applies a sign-in state change once, recording it so repeat notifications stay inert.
 *
 * Cold start can finish auth initialization before this listener exists, so the caller also feeds
 * the startup session state through here rather than waiting for the next transition.
 */
function applyAuthSignedInTransition(signedIn: boolean): void {
  if (lastAppliedAuthSignedIn === signedIn) return

  const persisted = applyNexusProviderAuthState(signedIn)
  lastAppliedAuthSignedIn = signedIn
  intelligenceConfigLog.info('Nexus provider auth transition applied', {
    enabled: signedIn,
    persisted
  })
}

/**
 * Setup storage update listener to reload config when it changes
 */
export function setupConfigUpdateListener(): void {
  if (!teardownConfigUpdateListener) {
    teardownConfigUpdateListener = subscribeMainConfig(StorageList.IntelligenceConfig, () => {
      try {
        // Before the reload refreshes the observed value: this is what tells the user's own
        // on/off click apart from a config write of ours.
        applyNexusRouteUserPreference()
        ensureIntelligenceConfigLoaded()
      } catch {
        // ignore transient storage readiness issues during startup
      }
    })
  }

  if (!teardownAuthStateListener) {
    // Subscribe before reconciling. The startup reconciliation below writes config, and with the
    // subscription last a storage failure left this module without a listener, so every later
    // transition went unnoticed until the next restart.
    teardownAuthStateListener = subscribeAuthState((state) => {
      try {
        applyAuthSignedInTransition(state.isSignedIn === true)
        ensureIntelligenceConfigLoaded()
      } catch {
        // ignore transient storage readiness issues during auth transitions
      }
    })

    // Auth initialization is fire-and-forget, so its first notification can land before this
    // listener is registered. Adopt the session state already in place as the baseline. A failure
    // here is not fatal: `lastAppliedAuthSignedIn` stays unset, so the next notification retries.
    try {
      applyAuthSignedInTransition(getSanitizedAuthSessionState().isSignedIn)
    } catch (error) {
      intelligenceConfigLog.warn('Nexus auth reconciliation deferred', { error })
    }
  }
}

/**
 * Save Intelligence SDK config to storage
 */
export function saveIntelligenceConfig(config: IntelligenceSDKPersistedConfig): void {
  saveMainConfig(StorageList.IntelligenceConfig, config)
}
/**
 * Log non-sensitive persisted config metadata for startup diagnostics.
 */
export function debugPrintConfig(): void {
  const stored = getLatestConfig()
  if (!stored) {
    intelligenceConfigLog.debug('No persisted intelligence config found')
    return
  }

  intelligenceConfigLog.debug('Persisted intelligence config loaded', {
    version: stored.version,
    providerCount: stored.providers.length,
    capabilityCount: Object.keys(stored.capabilities ?? {}).length,
    promptCount: stored.promptRegistry?.length ?? 0,
    promptBindingCount: stored.promptBindings?.length ?? 0
  })
}
