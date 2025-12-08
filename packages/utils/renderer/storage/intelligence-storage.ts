import type { IntelligenceProviderConfig, AISDKGlobalConfig, AISDKStorageData } from '../../types/intelligence'
import { StorageList } from '../../common/storage/constants'
import {

  IntelligenceProviderType,

  DEFAULT_CAPABILITIES,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS,
} from '../../types/intelligence'
import { createStorageProxy, TouchStorage } from './base-storage'

// Re-export types for convenience
export { IntelligenceProviderType }
export type { IntelligenceProviderConfig, AISDKGlobalConfig }

const defaultIntelligenceData: AISDKStorageData = {
  providers: [...DEFAULT_PROVIDERS],
  globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
  capabilities: { ...DEFAULT_CAPABILITIES },
  version: 2,
}

const INTELLIGENCE_STORAGE_KEY = `storage:${StorageList.IntelligenceConfig}`

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
      updatedProviders[providerIndex] = {
        ...updatedProviders[providerIndex],
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

export async function migrateIntelligenceSettings(): Promise<void> {
  console.log('[Intelligence Storage] Starting migration check...')
  const currentData = intelligenceStorage.data

  // Version 2: Force update capabilities to include all new ones
  if (!currentData.version || currentData.version < 2) {
    console.log('[Intelligence Storage] Migrating settings to version 2')

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
    console.log('[Intelligence Storage] Updating capabilities to latest defaults')
    
    intelligenceStorage.applyData({
      providers: migratedProviders,
      globalConfig: migratedGlobalConfig,
      capabilities: { ...DEFAULT_CAPABILITIES },
      version: 2,
    })

    await intelligenceStorage.saveToRemote({ force: true })

    console.log('[Intelligence Storage] Migration to v2 complete, capabilities count:', Object.keys(DEFAULT_CAPABILITIES).length)
  }
  else {
    console.log('[Intelligence Storage] No migration needed, current version:', currentData.version)
  }

  console.log('[Intelligence Storage] Final providers count:', intelligenceStorage.data.providers.length)
  console.log('[Intelligence Storage] Final capabilities count:', Object.keys(intelligenceStorage.data.capabilities).length)
}

/**
 * @deprecated Use migrateIntelligenceSettings instead
 */
export const migrateAISDKSettings = migrateIntelligenceSettings

export async function resetIntelligenceConfig(): Promise<void> {
  console.log('[Intelligence Storage] Resetting to default configuration')

  intelligenceStorage.applyData({
    providers: [...DEFAULT_PROVIDERS],
    globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
    capabilities: { ...DEFAULT_CAPABILITIES },
    version: 2,
  })

  await intelligenceStorage.saveToRemote({ force: true })

  console.log('[Intelligence Storage] Reset complete')
}

/**
 * @deprecated Use resetIntelligenceConfig instead
 */
export const resetAISDKConfig = resetIntelligenceConfig
