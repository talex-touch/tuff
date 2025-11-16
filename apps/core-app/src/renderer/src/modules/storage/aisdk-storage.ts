import { TouchStorage } from '@talex-touch/utils/renderer'
import type { AISDKStorageData, AISDKGlobalConfig } from '~/types/aisdk'
import { DEFAULT_PROVIDERS, DEFAULT_GLOBAL_CONFIG, DEFAULT_CAPABILITIES } from '~/types/aisdk'

/**
 * Default AISDK storage data
 */
const defaultAISDKData: AISDKStorageData = {
  providers: [...DEFAULT_PROVIDERS],
  globalConfig: { ...DEFAULT_GLOBAL_CONFIG },
  capabilities: { ...DEFAULT_CAPABILITIES },
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
  console.log('[AISDK Storage] Starting migration check...')
  const currentData = aisdkStorage.data

  // Check if migration is needed (version 0 or missing version)
  if (!currentData.version || currentData.version < 1) {
    console.log('[AISDK Storage] Migrating settings to version 1')

    // Ensure all providers have required fields
    const migratedProviders = currentData.providers.map((provider) => ({
      ...provider,
      enabled: provider.enabled ?? false,
      priority: provider.priority ?? 2,
      timeout: provider.timeout ?? 30000,
      rateLimit: provider.rateLimit ?? {},
      models: provider.models ?? [],
      capabilities: provider.capabilities ?? []
    }))

    // Ensure global config has all required fields
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

    // Apply migrated data
    aisdkStorage.applyData({
      providers: migratedProviders,
      globalConfig: migratedGlobalConfig,
      capabilities: migratedCapabilities,
      version: 1
    })

    // Force save to persist migration
    await aisdkStorage.saveToRemote({ force: true })

    console.log('[AISDK Storage] Migration complete')
  } else {
    console.log('[AISDK Storage] No migration needed, current version:', currentData.version)
  }

  console.log('[AISDK Storage] Final providers count:', aisdkStorage.data.providers.length)
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
    capabilities: { ...DEFAULT_CAPABILITIES },
    version: 1
  })

  await aisdkStorage.saveToRemote({ force: true })

  console.log('[AISDK Storage] Reset complete')
}
