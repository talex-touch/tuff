import type { ComputedRef } from 'vue'
import type { StorePluginListItem } from './useStoreData'
/**
 * Composable for managing plugin version status in store context
 *
 * Provides unified logic for checking installed plugins and upgrade availability
 */
import { computed } from 'vue'
import { getPluginCompositeKey } from '~/modules/install/install-manager'
import { usePluginStore } from '~/stores/plugin'
import { hasUpgradeAvailable } from './useVersionCompare'

interface PluginInstallSourceMetadata {
  providerId?: string
  officialId?: string
}

interface PluginInstallSource {
  metadata?: PluginInstallSourceMetadata | null
}

interface PluginStoreEntry {
  version?: string
  installSource?: PluginInstallSource | null
}

export interface PluginVersionStatus {
  /** Whether the plugin is installed locally */
  isInstalled: boolean
  /** Installed version (if installed) */
  installedVersion: string | undefined
  /** Store version */
  storeVersion: string | undefined
  /** Whether a newer version is available in store */
  hasUpgrade: boolean
}

/**
 * Hook for managing plugin version status across the store
 * Used by both Store list and StoreDetail views
 */
export function usePluginVersionStatus() {
  const pluginStore = usePluginStore()

  function normalizeLookupKey(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : undefined
  }

  function buildStoreLookupKeys(plugin: StorePluginListItem): string[] {
    const keys = new Set<string>()

    const id = normalizeLookupKey(plugin.id)
    const name = normalizeLookupKey(plugin.name)
    const providerId = normalizeLookupKey(plugin.providerId)

    if (id && providerId) {
      keys.add(getPluginCompositeKey(id, providerId))
    }
    if (id) {
      keys.add(id)
    }
    if (name) {
      keys.add(name)
    }

    return [...keys]
  }

  /** Map of installed plugin aliases to their versions */
  const installedPluginVersions = computed(() => {
    const map = new Map<string, string>()
    for (const [name, plugin] of pluginStore.plugins) {
      const pluginEntry = plugin as unknown as PluginStoreEntry
      const version = pluginEntry.version
      if (!version) {
        continue
      }

      const aliases = new Set<string>()
      const normalizedName = normalizeLookupKey(name)
      if (normalizedName) {
        aliases.add(normalizedName)
      }

      const metadata = pluginEntry.installSource?.metadata
      const officialId = normalizeLookupKey(metadata?.officialId)
      const providerId = normalizeLookupKey(metadata?.providerId)

      if (officialId) {
        aliases.add(officialId)
        if (providerId) {
          aliases.add(getPluginCompositeKey(officialId, providerId))
        }
      }

      for (const alias of aliases) {
        if (!map.has(alias)) {
          map.set(alias, version)
        }
      }
    }
    return map
  })

  /** Set of installed plugin aliases */
  const installedPluginNames = computed(() => new Set(installedPluginVersions.value.keys()))

  /**
   * Check if a plugin is installed by alias
   */
  function isPluginInstalled(pluginName: string): boolean {
    const key = normalizeLookupKey(pluginName)
    return key ? installedPluginNames.value.has(key) : false
  }

  /**
   * Get installed version by alias
   */
  function getInstalledVersion(pluginName: string): string | undefined {
    const key = normalizeLookupKey(pluginName)
    return key ? installedPluginVersions.value.get(key) : undefined
  }

  /**
   * Get installed version for a store item by composite keys
   */
  function getInstalledVersionForStore(plugin: StorePluginListItem | null): string | undefined {
    if (!plugin) {
      return undefined
    }

    const keys = buildStoreLookupKeys(plugin)
    for (const key of keys) {
      const version = installedPluginVersions.value.get(key)
      if (version) {
        return version
      }
    }

    return undefined
  }

  /**
   * Check if a plugin has an upgrade available
   */
  function checkHasUpgrade(pluginName: string, storeVersion: string | undefined): boolean {
    const installedVersion = getInstalledVersion(pluginName)
    return hasUpgradeAvailable(installedVersion, storeVersion)
  }

  /**
   * Get complete version status for a plugin
   */
  function getPluginVersionStatus(plugin: StorePluginListItem | null): PluginVersionStatus {
    if (!plugin) {
      return {
        isInstalled: false,
        installedVersion: undefined,
        storeVersion: undefined,
        hasUpgrade: false
      }
    }

    const installedVersion = getInstalledVersionForStore(plugin)
    return {
      isInstalled: Boolean(installedVersion),
      installedVersion,
      storeVersion: plugin.version,
      hasUpgrade: hasUpgradeAvailable(installedVersion, plugin.version)
    }
  }

  /**
   * Create a computed version status for a single plugin (useful for detail views)
   */
  function usePluginStatus(
    plugin: ComputedRef<StorePluginListItem | null>
  ): ComputedRef<PluginVersionStatus> {
    return computed(() => getPluginVersionStatus(plugin.value))
  }

  return {
    // Data
    installedPluginNames,
    installedPluginVersions,
    // Methods
    isPluginInstalled,
    getInstalledVersion,
    getInstalledVersionForStore,
    checkHasUpgrade,
    getPluginVersionStatus,
    usePluginStatus
  }
}
