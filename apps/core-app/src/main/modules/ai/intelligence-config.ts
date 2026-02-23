import type {
  IntelligenceCapabilityRoutingConfig,
  IntelligenceSDKPersistedConfig,
  IntelligenceProviderConfig
} from '@talex-touch/utils'
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS,
  IntelligenceProviderType,
  StorageList
} from '@talex-touch/utils'

import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import { getAuthToken } from '../auth'
import { getMainConfig, saveMainConfig } from '../storage'
import { tuffIntelligence } from './intelligence-sdk'

const storageUpdateEvent = StorageEvents.legacy.update

const SUPPORTED_PROVIDER_TYPES = new Set([
  'openai',
  'anthropic',
  'deepseek',
  'siliconflow',
  'local',
  'custom'
])
const TUFF_NEXUS_PROVIDER_ID = 'tuff-nexus-default'
const INTELLIGENCE_DEFAULT_VERSION = 2

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

function normalizeStrategyId(value?: string) {
  if (!value) return undefined
  if (value === 'priority') return 'rule-based-default'
  if (value === 'adaptive') return 'adaptive-default'
  return value
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function toNexusApiKey(token: string | null): string | undefined {
  if (!token) return undefined
  const trimmed = token.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/^Bearer\s+/i, '')
}

function createDefaultPersistedConfig(): IntelligenceSDKPersistedConfig {
  return {
    providers: cloneValue(DEFAULT_PROVIDERS),
    globalConfig: {
      defaultStrategy: DEFAULT_GLOBAL_CONFIG.defaultStrategy,
      enableAudit: DEFAULT_GLOBAL_CONFIG.enableAudit,
      enableCache: DEFAULT_GLOBAL_CONFIG.enableCache,
      cacheExpiration: DEFAULT_GLOBAL_CONFIG.cacheExpiration
    },
    capabilities: cloneValue(DEFAULT_CAPABILITIES),
    version: INTELLIGENCE_DEFAULT_VERSION
  }
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
      cacheExpiration: DEFAULT_GLOBAL_CONFIG.cacheExpiration
    }
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

  const enabledProviderCount = config.providers.filter((provider) => provider.enabled).length
  const nexusProvider = config.providers.find((provider) => provider.id === TUFF_NEXUS_PROVIDER_ID)
  if (enabledProviderCount === 0 && nexusProvider && nexusProvider.enabled !== true) {
    nexusProvider.enabled = true
    changed = true
  }

  if (!config.capabilities['text.chat']) {
    config.capabilities['text.chat'] = cloneValue(DEFAULT_CAPABILITIES['text.chat'])
    changed = true
  } else if (
    Array.isArray(config.capabilities['text.chat'].providers) &&
    !config.capabilities['text.chat'].providers.some(
      (binding) => binding.providerId === TUFF_NEXUS_PROVIDER_ID
    )
  ) {
    config.capabilities['text.chat'].providers.unshift({
      providerId: TUFF_NEXUS_PROVIDER_ID,
      priority: 1,
      enabled: true
    })
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

export function ensureIntelligenceConfigLoaded(_force?: boolean): void {
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

  const authToken = toNexusApiKey(getAuthToken())
  const providers = (stored.providers ?? [])
    .filter((provider) => {
      if (!SUPPORTED_PROVIDER_TYPES.has(provider.type)) {
        return false
      }
      return true
    })
    .map((provider) => {
      if (provider.id !== TUFF_NEXUS_PROVIDER_ID) {
        return provider
      }
      return {
        ...provider,
        enabled: true,
        apiKey: authToken || provider.apiKey || 'guest',
        metadata: {
          ...(provider.metadata || {}),
          origin: 'tuff-nexus',
          tokenInjected: Boolean(authToken),
          tokenMode: authToken ? 'auth' : 'guest'
        }
      }
    })

  const nativeOcrDisabledByEnv = process.env.TUFF_DISABLE_NATIVE_OCR === '1'
  const hasInternalProvider = providers.some(
    (provider) => provider.id === INTERNAL_SYSTEM_OCR_PROVIDER_ID
  )
  if (!nativeOcrDisabledByEnv && !hasInternalProvider) {
    providers.unshift({ ...INTERNAL_SYSTEM_OCR_PROVIDER })
  }

  tuffIntelligence.updateConfig({
    providers,
    defaultStrategy: normalizedStrategy,
    enableAudit: stored.globalConfig?.enableAudit ?? true,
    enableCache: stored.globalConfig?.enableCache ?? false,
    cacheExpiration: stored.globalConfig?.cacheExpiration,
    capabilities: stored.capabilities ?? {}
  })
}

export function getCapabilityOptions(capabilityId: string): {
  allowedProviderIds?: string[]
  modelPreference?: string[]
  promptTemplate?: string
} {
  // 实时从 storage 读取
  const stored = getLatestConfig()
  const capabilityMap = stored?.capabilities ?? {}
  const config = capabilityMap[capabilityId]

  if (!config) {
    return {}
  }

  const enabledBindings = config.providers?.filter((binding) => binding.enabled !== false) ?? []
  return {
    allowedProviderIds: enabledBindings.length
      ? enabledBindings.map((binding) => binding.providerId)
      : undefined,
    modelPreference: enabledBindings
      .flatMap((binding) => binding.models ?? [])
      .filter((model): model is string => Boolean(model)),
    promptTemplate: config.promptTemplate
  }
}

export function getCapabilityPrompt(capabilityId: string): string | undefined {
  // 实时从 storage 读取
  const stored = getLatestConfig()
  const capabilityMap = stored?.capabilities ?? {}
  return capabilityMap[capabilityId]?.promptTemplate
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
  const channel = $app.channel
  if (!channel) {
    return
  }

  const keyManager = (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
  const transport = getTuffTransportMain(channel, keyManager)

  transport.on(storageUpdateEvent, (data) => {
    if (
      data &&
      typeof data === 'object' &&
      'name' in data &&
      data.name === StorageList.IntelligenceConfig
    ) {
      ensureIntelligenceConfigLoaded()
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
 * Debug: Print current config file content
 */
export function debugPrintConfig(): void {
  const stored = getLatestConfig()
  if (!stored) {
  }
}
