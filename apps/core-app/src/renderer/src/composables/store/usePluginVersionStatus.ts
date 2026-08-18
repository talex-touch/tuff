import type { ComputedRef } from 'vue'
import type { StorePluginListItem } from './useStoreData'
/**
 * Composable for managing plugin version status in store context
 *
 * Provides unified logic for checking installed plugins and upgrade availability
 */
import { checkSdkCompatibility } from '@talex-touch/utils/plugin'
import { computed } from 'vue'
import { getPluginCompositeKey } from '~/modules/install/install-manager'
import { usePluginStore } from '~/stores/plugin'
import { hasUpgradeAvailable } from './useVersionCompare'

interface PluginInstallSourceMetadata {
  providerId?: string
  officialId?: string
  pluginId?: string
}

interface PluginInstallSourceClientMetadata {
  providerId?: string
  pluginId?: string
  pluginName?: string
}

interface PluginInstallSource {
  metadata?: PluginInstallSourceMetadata | null
  clientMetadata?: PluginInstallSourceClientMetadata | null
}

interface PluginStoreEntry {
  name?: string
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
  /** SDK marker declared by the store manifest. */
  sdkapi: number | undefined
  /** Whether this catalog version can run on the current host SDK. */
  isCompatible: boolean
  /** Host-owned explanation for an incompatible SDK marker. */
  compatibilityWarning: string | undefined
}

/**
 * Hook for managing plugin version status across the store.
 * Installed identity, version comparison and SDK compatibility are owned here so list/detail views
 * cannot drift into different labels for the same plugin.
 */
export function usePluginVersionStatus() {
  const pluginStore = usePluginStore()

  function normalizeLookupKey(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 ? normalized : undefined
  }

  function addLookupKey(keys: Set<string>, value: unknown): void {
    const normalized = normalizeLookupKey(value)
    if (normalized) keys.add(normalized)
  }

  function addCompositeLookupKey(keys: Set<string>, id: unknown, providerId: unknown): void {
    const normalizedId = normalizeLookupKey(id)
    const normalizedProviderId = normalizeLookupKey(providerId)
    if (!normalizedId || !normalizedProviderId) return
    addLookupKey(keys, getPluginCompositeKey(normalizedId, normalizedProviderId))
  }

  function buildStoreLookupKeys(plugin: StorePluginListItem): string[] {
    const keys = new Set<string>()
    const identities = [plugin.id, plugin.name, plugin.manifest?.id, plugin.manifest?.name]

    for (const identity of identities) {
      addLookupKey(keys, identity)
      addCompositeLookupKey(keys, identity, plugin.providerId)
    }

    return [...keys]
  }

  /** Map of every installed plugin identity alias to its version. */
  const installedPluginVersions = computed(() => {
    const map = new Map<string, string>()
    for (const [name, plugin] of pluginStore.plugins) {
      const pluginEntry = plugin as unknown as PluginStoreEntry
      const version = pluginEntry.version
      if (!version) continue

      const aliases = new Set<string>()
      addLookupKey(aliases, name)
      addLookupKey(aliases, pluginEntry.name)

      const metadata = pluginEntry.installSource?.metadata
      const clientMetadata = pluginEntry.installSource?.clientMetadata
      const providerId = metadata?.providerId ?? clientMetadata?.providerId
      const identities = [
        metadata?.officialId,
        metadata?.pluginId,
        clientMetadata?.pluginId,
        clientMetadata?.pluginName
      ]

      for (const identity of identities) {
        addLookupKey(aliases, identity)
        addCompositeLookupKey(aliases, identity, providerId)
      }

      for (const alias of aliases) {
        if (!map.has(alias)) map.set(alias, version)
      }
    }
    return map
  })

  const installedPluginNames = computed(() => new Set(installedPluginVersions.value.keys()))

  function isPluginInstalled(pluginName: string): boolean {
    const key = normalizeLookupKey(pluginName)
    return key ? installedPluginNames.value.has(key) : false
  }

  function getInstalledVersion(pluginName: string): string | undefined {
    const key = normalizeLookupKey(pluginName)
    return key ? installedPluginVersions.value.get(key) : undefined
  }

  function getInstalledVersionForStore(plugin: StorePluginListItem | null): string | undefined {
    if (!plugin) return undefined

    for (const key of buildStoreLookupKeys(plugin)) {
      const version = installedPluginVersions.value.get(key)
      if (version) return version
    }
    return undefined
  }

  function checkHasUpgrade(pluginName: string, storeVersion: string | undefined): boolean {
    return hasUpgradeAvailable(getInstalledVersion(pluginName), storeVersion)
  }

  function getPluginVersionStatus(plugin: StorePluginListItem | null): PluginVersionStatus {
    if (!plugin) {
      return {
        isInstalled: false,
        installedVersion: undefined,
        storeVersion: undefined,
        hasUpgrade: false,
        sdkapi: undefined,
        isCompatible: false,
        compatibilityWarning: undefined
      }
    }

    const installedVersion = getInstalledVersionForStore(plugin)
    const sdkapi = plugin.manifest?.sdkapi
    const compatibility =
      sdkapi === undefined && plugin.providerType !== 'tpexApi'
        ? { compatible: true, enforcePermissions: false }
        : checkSdkCompatibility(sdkapi, plugin.manifest?.name || plugin.name || plugin.id)

    return {
      isInstalled: Boolean(installedVersion),
      installedVersion,
      storeVersion: plugin.version,
      hasUpgrade: hasUpgradeAvailable(installedVersion, plugin.version),
      sdkapi,
      isCompatible: compatibility.compatible,
      compatibilityWarning: compatibility.warning
    }
  }

  function usePluginStatus(
    plugin: ComputedRef<StorePluginListItem | null>
  ): ComputedRef<PluginVersionStatus> {
    return computed(() => getPluginVersionStatus(plugin.value))
  }

  return {
    installedPluginNames,
    installedPluginVersions,
    isPluginInstalled,
    getInstalledVersion,
    getInstalledVersionForStore,
    checkHasUpgrade,
    getPluginVersionStatus,
    usePluginStatus
  }
}
