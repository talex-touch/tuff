import { TouchStorage, createStorageProxy } from './base-storage'
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS,
  type AISDKGlobalConfig,
  type AISDKStorageData
} from '../../types/intelligence'

const defaultAISDKData: AISDKStorageData = {
  providers: [...DEFAULT_PROVIDERS],
  globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
  capabilities: { ...DEFAULT_CAPABILITIES },
  version: 1
}

const AISDK_STORAGE_KEY = 'storage:aisdk-config'

class AISDKStorage extends TouchStorage<AISDKStorageData> {
  constructor() {
    super('aisdk-config', defaultAISDKData)
    this.setAutoSave(true)
  }
}

/**
 * Lazy-initialized AISDK storage.
 * The actual instance is created only when first accessed AND after initStorageChannel() is called.
 */
export const aisdkStorage = createStorageProxy<TouchStorage<AISDKStorageData>>(
  AISDK_STORAGE_KEY,
  () => new AISDKStorage()
);

export async function migrateAISDKSettings(): Promise<void> {
  console.log('[AISDK Storage] Starting migration check...')
  const currentData = aisdkStorage.data

  if (!currentData.version || currentData.version < 1) {
    console.log('[AISDK Storage] Migrating settings to version 1')

    const migratedProviders = currentData.providers.map((provider) => ({
      ...provider,
      enabled: provider.enabled ?? false,
      priority: provider.priority ?? 2,
      timeout: provider.timeout ?? 30000,
      rateLimit: provider.rateLimit ?? {},
      models: provider.models ?? [],
      capabilities: provider.capabilities ?? []
    }))

    const storedStrategy = currentData.globalConfig?.defaultStrategy
    const normalizedStrategy =
      storedStrategy === 'priority' ? 'rule-based-default' : storedStrategy ?? 'adaptive-default'

    const migratedGlobalConfig: AISDKGlobalConfig = {
      defaultStrategy: normalizedStrategy,
      enableAudit: currentData.globalConfig?.enableAudit ?? false,
      enableCache: currentData.globalConfig?.enableCache ?? true,
      cacheExpiration: currentData.globalConfig?.cacheExpiration ?? 3600
    }

    const migratedCapabilities = currentData.capabilities ?? { ...DEFAULT_CAPABILITIES }

    aisdkStorage.applyData({
      providers: migratedProviders,
      globalConfig: migratedGlobalConfig,
      capabilities: migratedCapabilities,
      version: 1
    })

    await aisdkStorage.saveToRemote({ force: true })

    console.log('[AISDK Storage] Migration complete')
  } else {
    console.log('[AISDK Storage] No migration needed, current version:', currentData.version)
  }

  console.log('[AISDK Storage] Final providers count:', aisdkStorage.data.providers.length)
}

export async function resetAISDKConfig(): Promise<void> {
  console.log('[AISDK Storage] Resetting to default configuration')

  aisdkStorage.applyData({
    providers: [...DEFAULT_PROVIDERS],
    globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
    capabilities: { ...DEFAULT_CAPABILITIES },
    version: 1
  })

  await aisdkStorage.saveToRemote({ force: true })

  console.log('[AISDK Storage] Reset complete')
}
