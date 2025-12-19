import type {
  AiCapabilityRoutingConfig,
  AiSDKPersistedConfig,
} from '@talex-touch/utils'
import { StorageList } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { storageModule } from '../storage'
import { ai } from './intelligence-sdk'

const SUPPORTED_PROVIDER_TYPES = new Set(['openai', 'anthropic', 'deepseek', 'siliconflow', 'local', 'custom'])

function normalizeStrategyId(value?: string) {
  if (!value)
    return undefined
  if (value === 'priority')
    return 'rule-based-default'
  if (value === 'adaptive')
    return 'adaptive-default'
  return value
}

/**
 * 实时从 storage 获取最新配置，不使用内部缓存
 */
function getLatestConfig(): AiSDKPersistedConfig | undefined {
  const stored = storageModule.getConfig(StorageList.IntelligenceConfig) as AiSDKPersistedConfig | undefined
  return stored
}

export function ensureAiConfigLoaded(_force?: boolean): void {
  // 每次都实时从 storage 读取最新配置
  const stored = getLatestConfig()

  if (!stored || Object.keys(stored).length === 0) {
    return
  }

  const normalizedStrategy
    = normalizeStrategyId(stored.globalConfig?.defaultStrategy) ?? 'adaptive-default'

  const providers = (stored.providers ?? []).filter((provider) => {
    if (!SUPPORTED_PROVIDER_TYPES.has(provider.type)) {
      return false
    }
    return true
  })

  ai.updateConfig({
    providers,
    defaultStrategy: normalizedStrategy,
    enableAudit: stored.globalConfig?.enableAudit ?? true,
    enableCache: stored.globalConfig?.enableCache ?? false,
    cacheExpiration: stored.globalConfig?.cacheExpiration,
    capabilities: stored.capabilities ?? {},
  })
}

export function getCapabilityOptions(
  capabilityId: string,
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

  const enabledBindings = config.providers?.filter(binding => binding.enabled !== false) ?? []
  return {
    allowedProviderIds: enabledBindings.length ? enabledBindings.map(binding => binding.providerId) : undefined,
    modelPreference: enabledBindings
      .flatMap(binding => binding.models ?? [])
      .filter((model): model is string => Boolean(model)),
    promptTemplate: config.promptTemplate,
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
    return
  }

  channel.regChannel(ChannelType.MAIN, 'storage:update', ({ data }) => {
    if (data && typeof data === 'object' && 'name' in data && data.name === StorageList.IntelligenceConfig) {
      ensureAiConfigLoaded()
    }
  })
}

/**
 * Save AI SDK config to storage
 */
export function saveAiConfig(config: AiSDKPersistedConfig): void {
  storageModule.saveConfig(StorageList.IntelligenceConfig, JSON.stringify(config))
}

/**
 * Debug: Print current config file content
 */
export function debugPrintConfig(): void {
  const stored = getLatestConfig()
  if (!stored) {

  }
}
