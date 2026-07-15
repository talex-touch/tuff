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
  resolveIntelligencePromptTemplate,
  toRuntimeCapabilityId
} from '@talex-touch/tuff-intelligence'
import { StorageList } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'
import { tuffIntelligence } from './intelligence-sdk'
import { normalizeProviderForRuntime, TUFF_NEXUS_PROVIDER_ID } from './provider-runtime'

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

let lastAppliedRuntimeConfigSignature: string | null = null
let teardownConfigUpdateListener: (() => void) | null = null

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
    const next = {
      ...current,
      ...record
    }
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      list[idx] = next
      return true
    }
    return false
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

export function ensureIntelligenceConfigLoaded(force = false): void {
  // 每次都实时从 storage 读取最新配置
  const stored = getLatestConfig()

  if (!stored) {
    return
  }

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

  const nextRuntimeConfig = {
    providers,
    defaultStrategy: normalizedStrategy,
    enableAudit: stored.globalConfig?.enableAudit ?? true,
    enableCache: stored.globalConfig?.enableCache ?? false,
    enableQuota: stored.globalConfig?.enableQuota ?? true,
    cacheExpiration: stored.globalConfig?.cacheExpiration,
    capabilities: stored.capabilities ?? {},
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
 * Setup storage update listener to reload config when it changes
 */
export function setupConfigUpdateListener(): void {
  if (teardownConfigUpdateListener) {
    return
  }

  teardownConfigUpdateListener = subscribeMainConfig(StorageList.IntelligenceConfig, () => {
    try {
      ensureIntelligenceConfigLoaded()
    } catch {
      // ignore transient storage readiness issues during startup
    }
  })
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
