import { TouchStorage } from '@talex-touch/utils/renderer'
import type { AiProviderConfig, AISDKGlobalConfig } from '~/types/aisdk'
import { DEFAULT_PROVIDERS, DEFAULT_GLOBAL_CONFIG } from '~/types/aisdk'

/**
 * Interface for AISDK storage data structure
 */
export interface AISDKStorageData {
  /** Array of AI provider configurations */
  providers: AiProviderConfig[]
  /** Global AISDK configuration settings */
  globalConfig: AISDKGlobalConfig
  /** Version number for migration purposes */
  version: number
}

/**
 * Default AISDK storage data
 */
const defaultAISDKData: AISDKStorageData = {
  providers: [...DEFAULT_PROVIDERS],
  globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
  version: 1
}

/**
 * Persistent storage for AISDK configuration.
 * Automatically syncs with backend storage and supports auto-save.
 *
 * @example
 * ```ts
 * import { aisdkStorage } from '~/modules/storage/aisdk-storage'
 *
 * // Access providers
 * console.log(aisdkStorage.data.providers)
 *
 * // Update a provider
 * const provider = aisdkStorage.data.providers[0]
 * provider.apiKey = 'sk-...'
 * // Changes are automatically saved when auto-save is enabled
 * ```
 */
export const aisdkStorage = new TouchStorage<AISDKStorageData>(
  'aisdk-config',
  defaultAISDKData
)

// Enable auto-save with debouncing (300ms default from TouchStorage)
aisdkStorage.setAutoSave(true)

/**
 * Migrates old AISDK settings format to new format if needed.
 * This function checks for legacy settings and converts them to the new structure.
 *
 * @returns Promise that resolves when migration is complete
 */
export async function migrateAISDKSettings(): Promise<void> {
  const currentData = aisdkStorage.data

  // Check if migration is needed (version 0 or missing version)
  if (!currentData.version || currentData.version < 1) {
    console.log('[AISDK Storage] Migrating settings to version 1')

    // Ensure all providers have required fields
    const migratedProviders = currentData.providers.map((provider) => ({
      ...provider,
      // Add any missing fields with defaults
      enabled: provider.enabled ?? false,
      priority: provider.priority ?? 2,
      timeout: provider.timeout ?? 30000,
      rateLimit: provider.rateLimit ?? {},
      models: provider.models ?? []
    }))

    // Ensure global config has all required fields
    const migratedGlobalConfig: AISDKGlobalConfig = {
      defaultStrategy: currentData.globalConfig?.defaultStrategy ?? 'priority',
      enableAudit: currentData.globalConfig?.enableAudit ?? false,
      enableCache: currentData.globalConfig?.enableCache ?? true,
      cacheExpiration: currentData.globalConfig?.cacheExpiration ?? 3600
    }

    // Apply migrated data
    aisdkStorage.applyData({
      providers: migratedProviders,
      globalConfig: migratedGlobalConfig,
      version: 1
    })

    // Force save to persist migration
    await aisdkStorage.saveToRemote({ force: true })

    console.log('[AISDK Storage] Migration complete')
  }
}

/**
 * Resets AISDK configuration to default values.
 * Useful for troubleshooting or starting fresh.
 *
 * @returns Promise that resolves when reset is complete
 */
export async function resetAISDKConfig(): Promise<void> {
  console.log('[AISDK Storage] Resetting to default configuration')

  aisdkStorage.applyData({
    providers: [...DEFAULT_PROVIDERS],
    globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
    version: 1
  })

  await aisdkStorage.saveToRemote({ force: true })

  console.log('[AISDK Storage] Reset complete')
}
