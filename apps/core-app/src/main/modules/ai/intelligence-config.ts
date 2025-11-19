import { ai } from './intelligence-sdk'
import type {
  AiCapabilityRoutingConfig,
  AiSDKPersistedConfig
} from '@talex-touch/utils'
import { StorageList } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { storageModule } from '../storage'
import chalk from 'chalk'

const LOG = chalk.hex('#1e88e5').bold('[Intelligence]')
const SUPPORTED_PROVIDER_TYPES = new Set(['openai', 'anthropic', 'deepseek', 'siliconflow', 'local'])

const normalizeStrategyId = (value?: string) => {
  if (!value) return undefined
  if (value === 'priority') return 'rule-based-default'
  if (value === 'adaptive') return 'adaptive-default'
  return value
}

/**
 * 实时从 storage 获取最新配置，不使用内部缓存
 */
function getLatestConfig(): AiSDKPersistedConfig | undefined {
  const stored = storageModule.getConfig(StorageList.IntelligenceConfig) as AiSDKPersistedConfig | undefined
  return stored
}

export function ensureAiConfigLoaded(force = false): void {
  // 每次都实时从 storage 读取最新配置
  const stored = getLatestConfig()

  console.log(LOG, `[DEBUG] ========== ensureAiConfigLoaded START ==========`)
  console.log(LOG, `[DEBUG] force=${force}, stored=${!!stored}`)

  if (!stored || Object.keys(stored).length === 0) {
    console.log(LOG, `[DEBUG] No stored config found or empty config`)
    console.log(LOG, `[DEBUG] ========== ensureAiConfigLoaded END (no config) ==========`)
    return
  }

  console.log(LOG, `[DEBUG] Stored config keys:`, Object.keys(stored))
  console.log(LOG, `[DEBUG] Full stored config:`, JSON.stringify(stored, null, 2))
  console.log(LOG, `[DEBUG] Loading config, providers count: ${stored.providers?.length ?? 0}`)

  if (stored.providers && stored.providers.length > 0) {
    console.log(LOG, `[DEBUG] Stored providers:`)
    stored.providers.forEach((p, idx) => {
      console.log(LOG, `[DEBUG]   [${idx}] id=${p.id}, type=${p.type}, enabled=${p.enabled}, hasApiKey=${!!p.apiKey}`)
    })
  } else {
    console.log(LOG, `[DEBUG] stored.providers is empty or undefined:`, stored.providers)
  }

  const normalizedStrategy =
    normalizeStrategyId(stored.globalConfig?.defaultStrategy) ?? 'adaptive-default'

  const providers = (stored.providers ?? []).filter((provider) => {
    if (!SUPPORTED_PROVIDER_TYPES.has(provider.type)) {
      console.warn(LOG, `Unsupported provider type ${provider.type}, skipping ${provider.id}`)
      return false
    }
    return true
  })

  console.log(LOG, `[DEBUG] After type filter, providers count: ${providers.length}`)
  if (providers.length > 0) {
    console.log(LOG, `[DEBUG] Filtered providers:`)
    providers.forEach((p, idx) => {
      console.log(LOG, `[DEBUG]   [${idx}] id=${p.id}, type=${p.type}, enabled=${p.enabled}`)
    })
  } else {
    console.log(LOG, `[DEBUG] No providers after filtering!`)
  }

  console.log(LOG, `[DEBUG] About to call ai.updateConfig with ${providers.length} providers`)
  console.log(LOG, `[DEBUG] Config to apply:`, {
    providersCount: providers.length,
    defaultStrategy: normalizedStrategy,
    enableAudit: stored.globalConfig?.enableAudit ?? true,
    enableCache: stored.globalConfig?.enableCache ?? false,
    capabilitiesCount: Object.keys(stored.capabilities ?? {}).length
  })

  ai.updateConfig({
    providers,
    defaultStrategy: normalizedStrategy,
    enableAudit: stored.globalConfig?.enableAudit ?? true,
    enableCache: stored.globalConfig?.enableCache ?? false,
    cacheExpiration: stored.globalConfig?.cacheExpiration,
    capabilities: stored.capabilities ?? {}
  })

  console.log(LOG, 'Configuration loaded and applied successfully')
  console.log(LOG, `[DEBUG] ========== ensureAiConfigLoaded END (success) ==========`)
}

export function getCapabilityOptions(
  capabilityId: string
): {
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
    allowedProviderIds: enabledBindings.length ? enabledBindings.map((binding) => binding.providerId) : undefined,
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

export function listCapabilities(): AiCapabilityRoutingConfig[] {
  // 实时从 storage 读取
  const stored = getLatestConfig()
  const capabilityMap = stored?.capabilities ?? {}
  return Object.values(capabilityMap)
}

export function getCapabilitiesMap(): Record<string, AiCapabilityRoutingConfig> {
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
    console.warn(LOG, 'Channel not available, cannot setup config update listener')
    return
  }

  channel.regChannel(ChannelType.MAIN, 'storage:update', ({ data }) => {
    if (data && typeof data === 'object' && 'name' in data && data.name === StorageList.IntelligenceConfig) {
      console.log(LOG, 'Config updated from frontend, reloading...')
      ensureAiConfigLoaded(true)
    }
  })

  console.log(LOG, 'Config update listener registered')
}

/**
 * Save AI SDK config to storage
 */
export function saveAiConfig(config: AiSDKPersistedConfig): void {
  console.log(LOG, `Saving config with ${config.providers?.length ?? 0} providers`)
  storageModule.saveConfig(StorageList.IntelligenceConfig, JSON.stringify(config))
  console.log(LOG, 'Config saved successfully')
}

/**
 * Debug: Print current config file content
 */
export function debugPrintConfig(): void {
  const stored = getLatestConfig()
  console.log(LOG, `[DEBUG] ========== Current Config File Content ==========`)
  if (!stored) {
    console.log(LOG, `[DEBUG] No config file found`)
  } else {
    console.log(LOG, `[DEBUG] Config keys:`, Object.keys(stored))
    console.log(LOG, `[DEBUG] Providers count:`, stored.providers?.length ?? 0)
    console.log(LOG, `[DEBUG] Full config:`)
    console.log(JSON.stringify(stored, null, 2))
  }
  console.log(LOG, `[DEBUG] ========== End Config File Content ==========`)
}
