import type { AISDKGlobalConfig, AISDKStorageData, IntelligenceProviderConfig } from '../../types/intelligence'
import { getLogger } from '../../common/logger'
import { StorageList } from '../../common/storage/constants'
import {

  DEFAULT_CAPABILITIES,

  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS,
  IntelligenceProviderType,
} from '../../types/intelligence'
import { createStorageDataProxy, createStorageProxy, TouchStorage } from './base-storage'

// Re-export types for convenience
export { IntelligenceProviderType }
export type { AISDKGlobalConfig, IntelligenceProviderConfig }

const defaultIntelligenceData: AISDKStorageData = {
  providers: [...DEFAULT_PROVIDERS],
  globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
  capabilities: { ...DEFAULT_CAPABILITIES },
  version: 2,
}

const INTELLIGENCE_STORAGE_KEY = `storage:${StorageList.IntelligenceConfig}`
const intelligenceStorageLog = getLogger('intelligence-storage')

class IntelligenceStorage extends TouchStorage<AISDKStorageData> {
  constructor() {
    super(StorageList.IntelligenceConfig, defaultIntelligenceData)
    this.setAutoSave(true)
  }

  /**
   * 添加新的提供商
   */
  addProvider(provider: IntelligenceProviderConfig): void {
    const currentData = this.get()
    const updatedProviders = [...currentData.providers, provider]
    this.set({
      ...currentData,
      providers: updatedProviders,
    })
  }

  /**
   * 更新提供商配置
   */
  updateProvider(id: string, updatedProvider: Partial<IntelligenceProviderConfig>): void {
    const currentData = this.get()
    const providerIndex = currentData.providers.findIndex(p => p.id === id)

    if (providerIndex !== -1) {
      const updatedProviders = [...currentData.providers]
      const currentProvider = updatedProviders[providerIndex]
      if (!currentProvider)
        return
      updatedProviders[providerIndex] = {
        ...currentProvider,
        ...updatedProvider,
      }

      this.set({
        ...currentData,
        providers: updatedProviders,
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
      providers: updatedProviders,
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
        ...config,
      },
    })
  }

  /**
   * 获取特定类型的提供商
   */
  getProvidersByType(type: IntelligenceProviderType): IntelligenceProviderConfig[] {
    return this.get().providers.filter(p => p.type === type)
  }

  /**
   * 获取启用的提供商
   */
  getEnabledProviders(): IntelligenceProviderConfig[] {
    return this.get().providers.filter(p => p.enabled)
  }

  /**
   * 检查提供商是否已配置
   */
  isProviderConfigured(id: string): boolean {
    const provider = this.get().providers.find(p => p.id === id)
    if (!provider || !provider.enabled)
      return false

    // 检查是否有必要的配置项
    const hasApiKey = provider.type === IntelligenceProviderType.LOCAL || !!provider.apiKey
    const hasModels = !!(provider.models && provider.models.length > 0)

    return hasApiKey && hasModels
  }
}

/**
 * Lazy-initialized Intelligence storage.
 * The actual instance is created only when first accessed AND after initStorageChannel() is called.
 */
export const intelligenceStorage = createStorageProxy<IntelligenceStorage>(
  INTELLIGENCE_STORAGE_KEY,
  () => new IntelligenceStorage(),
)

export const intelligenceData = createStorageDataProxy(intelligenceStorage)

/**
 * Alias for backward compatibility
 * @deprecated Use intelligenceStorage instead
 */
export const aisdkStorage = intelligenceStorage

/**
 * Alias for backward compatibility
 * @deprecated Use intelligenceStorage instead
 */
export const intelligenceSettings = intelligenceStorage

export const aisdkData = intelligenceData
export const intelligenceSettingsData = intelligenceData

export async function migrateIntelligenceSettings(): Promise<void> {
  intelligenceStorageLog.info('Starting migration check...')
  const currentData = intelligenceStorage.data

  // Version 2: Force update capabilities to include all new ones
  if (!currentData.version || currentData.version < 2) {
    intelligenceStorageLog.info('Migrating settings to version 2')

    const migratedProviders = currentData.providers.map(provider => ({
      ...provider,
      enabled: provider.enabled ?? false,
      priority: provider.priority ?? 2,
      timeout: provider.timeout ?? 30000,
      rateLimit: provider.rateLimit ?? {},
      models: provider.models ?? [],
      capabilities: provider.capabilities ?? [],
    }))

    const storedStrategy = currentData.globalConfig?.defaultStrategy
    const normalizedStrategy
      = storedStrategy === 'priority' ? 'rule-based-default' : storedStrategy ?? 'adaptive-default'

    const migratedGlobalConfig: AISDKGlobalConfig = {
      defaultStrategy: normalizedStrategy,
      enableAudit: currentData.globalConfig?.enableAudit ?? false,
      enableCache: currentData.globalConfig?.enableCache ?? true,
      cacheExpiration: currentData.globalConfig?.cacheExpiration ?? 3600,
    }

    // Force update to latest DEFAULT_CAPABILITIES (version 2)
    intelligenceStorageLog.info('Updating capabilities to latest defaults')

    intelligenceStorage.applyData({
      providers: migratedProviders,
      globalConfig: migratedGlobalConfig,
      capabilities: { ...DEFAULT_CAPABILITIES },
      version: 2,
    })

    await intelligenceStorage.saveToRemote({ force: true })

    intelligenceStorageLog.info(`Migration to v2 complete, capabilities count: ${Object.keys(DEFAULT_CAPABILITIES).length}`)
  }
  else {
    intelligenceStorageLog.info(`No migration needed, current version: ${currentData.version}`)
  }

  intelligenceStorageLog.info(`Final providers count: ${intelligenceStorage.data.providers.length}`)
  intelligenceStorageLog.info(`Final capabilities count: ${Object.keys(intelligenceStorage.data.capabilities).length}`)
}

/**
 * @deprecated Use migrateIntelligenceSettings instead
 */
export const migrateAISDKSettings = migrateIntelligenceSettings

export async function resetIntelligenceConfig(): Promise<void> {
  intelligenceStorageLog.info('Resetting to default configuration')

  intelligenceStorage.applyData({
    providers: [...DEFAULT_PROVIDERS],
    globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
    capabilities: { ...DEFAULT_CAPABILITIES },
    version: 2,
  })

  await intelligenceStorage.saveToRemote({ force: true })

  intelligenceStorageLog.info('Reset complete')
}

/**
 * @deprecated Use resetIntelligenceConfig instead
 */
export const resetAISDKConfig = resetIntelligenceConfig
