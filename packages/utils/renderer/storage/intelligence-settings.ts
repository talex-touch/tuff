/**
 * Intelligence Storage for AI Provider Configuration
 * 管理 AI 智能模块的数据存储，包括提供商配置、全局设置等
 */
import { TouchStorage, getOrCreateStorageSingleton } from './base-storage'
import { StorageList } from '../../common/storage/constants'
import { AiProviderType, type AiProviderConfig, type AISDKGlobalConfig } from '../../types/intelligence'

// Re-export types for convenience
export { AiProviderType }
export type { AiProviderConfig, AISDKGlobalConfig }

export interface IntelligenceSetting {
  providers: AiProviderConfig[]
  globalConfig: AISDKGlobalConfig
  version: string
}

// 默认提供商配置
const DEFAULT_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'openai-default',
    type: AiProviderType.OPENAI,
    name: 'OpenAI',
    enabled: false,
    priority: 1,
    models: [],
    timeout: 30000,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 10000
    }
  },
  {
    id: 'anthropic-default',
    type: AiProviderType.ANTHROPIC,
    name: 'Anthropic',
    enabled: false,
    priority: 2,
    models: [],
    timeout: 30000,
    rateLimit: {
      requestsPerMinute: 60,
      tokensPerMinute: 8000
    }
  },
  {
    id: 'deepseek-default',
    type: AiProviderType.DEEPSEEK,
    name: 'DeepSeek',
    enabled: false,
    priority: 3,
    models: [],
    timeout: 30000,
    rateLimit: {
      requestsPerMinute: 100,
      tokensPerMinute: 20000
    }
  }
]

// 默认全局配置
const DEFAULT_GLOBAL_CONFIG: AISDKGlobalConfig = {
  maxRetries: 3,
  defaultTimeout: 30000,
  enableLogging: true,
  logLevel: 'info',
  enableCaching: true,
  cacheSize: 100,
  fallbackStrategy: 'next-available',
  parallelRequests: false,
  defaultStrategy: 'adaptive-default',
  enableAudit: false,
  enableCache: true,
  cacheExpiration: 3600
}

// 默认 Intelligence 配置
export const intelligenceSettingOriginData: IntelligenceSetting = {
  providers: DEFAULT_PROVIDERS,
  globalConfig: DEFAULT_GLOBAL_CONFIG,
  version: '1.0.0'
}

/**
 * Intelligence Settings Storage Class
 */
class IntelligenceSettingsStorage extends TouchStorage<IntelligenceSetting> {
  /**
   * Initializes a new instance of the IntelligenceSettingsStorage class
   */
  constructor() {
    super(StorageList.INTELLIGENCE_SETTING, JSON.parse(JSON.stringify(intelligenceSettingOriginData)))
    this.setAutoSave(true)
  }

  /**
   * 添加新的提供商
   */
  addProvider(provider: AiProviderConfig): void {
    const currentData = this.get()
    const updatedProviders = [...currentData.providers, provider]
    this.set({
      ...currentData,
      providers: updatedProviders
    })
  }

  /**
   * 更新提供商配置
   */
  updateProvider(id: string, updatedProvider: Partial<AiProviderConfig>): void {
    const currentData = this.get()
    const providerIndex = currentData.providers.findIndex(p => p.id === id)

    if (providerIndex !== -1) {
      const updatedProviders = [...currentData.providers]
      updatedProviders[providerIndex] = {
        ...updatedProviders[providerIndex],
        ...updatedProvider
      }

      this.set({
        ...currentData,
        providers: updatedProviders
      })
    }
  }

  /**
   * 删除提供商
   */
  removeProvider(id: string): void {
    const currentData = this.get()
    const updatedProviders = currentData.providers.filter(p => p.id !== id)

    this.set({
      ...currentData,
      providers: updatedProviders
    })
  }

  /**
   * 更新全局配置
   */
  updateGlobalConfig(config: Partial<AISDKGlobalConfig>): void {
    const currentData = this.get()

    this.set({
      ...currentData,
      globalConfig: {
        ...currentData.globalConfig,
        ...config
      }
    })
  }

  /**
   * 获取特定类型的提供商
   */
  getProvidersByType(type: AiProviderType): AiProviderConfig[] {
    return this.get().providers.filter(p => p.type === type)
  }

  /**
   * 获取启用的提供商
   */
  getEnabledProviders(): AiProviderConfig[] {
    return this.get().providers.filter(p => p.enabled)
  }

  /**
   * 检查提供商是否已配置
   */
  isProviderConfigured(id: string): boolean {
    const provider = this.get().providers.find(p => p.id === id)
    if (!provider || !provider.enabled) return false

    // 检查是否有必要的配置项
    const hasApiKey = provider.type === AiProviderType.LOCAL || !!provider.apiKey
    const hasModels = !!(provider.models && provider.models.length > 0)

    return hasApiKey && hasModels
  }
}

const INTELLIGENCE_SETTINGS_KEY = `storage:${StorageList.INTELLIGENCE_SETTING}`

export const intelligenceSettings = getOrCreateStorageSingleton<IntelligenceSettingsStorage>(
  INTELLIGENCE_SETTINGS_KEY,
  () => new IntelligenceSettingsStorage()
)
