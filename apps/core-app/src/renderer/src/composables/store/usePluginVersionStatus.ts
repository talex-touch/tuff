import type { ComputedRef } from 'vue'
import type { StorePluginListItem } from './useStoreData'
/**
 * Composable for managing plugin version status in store context
 *
 * Provides unified logic for checking installed plugins and upgrade availability
 */
import {
  checkSdkCompatibility,
  inferPluginNameFromNpmPackage,
  isValidNpmPackageName,
  parseNpmPluginSource
} from '@talex-touch/utils/plugin'
import { computed } from 'vue'
import { PRIVILEGED_PLUGIN_NAMES } from '../../../../shared/privileged-plugins'
import { getPluginCompositeKey } from '~/modules/install/install-manager'
import { usePluginStore } from '~/stores/plugin'
import { hasUpgradeAvailable } from './useVersionCompare'

interface PluginInstallSourceMetadata {
  providerId?: string
  officialId?: string
  pluginId?: string
  packageName?: string
  npmPackageName?: string
}

interface PluginInstallSourceClientMetadata {
  providerId?: string
  pluginId?: string
  pluginName?: string
  packageName?: string
}

interface PluginInstallSourceProviderMetadata {
  packageName?: string
  npmPackageName?: string
  resolvedVersion?: string
  registry?: string
  distTag?: string
}

interface PluginInstallSource {
  source?: string | null
  provider?: string | null
  metadata?: PluginInstallSourceMetadata | null
  clientMetadata?: PluginInstallSourceClientMetadata | null
  providerMetadata?: PluginInstallSourceProviderMetadata | null
}

interface PluginStoreEntry {
  id?: string
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
  /** Whether installation and upgrades are owned by the bundled client runtime. */
  isBundledManaged: boolean
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

  function extractNpmPackageName(
    value: unknown,
    allowAnyBarePackageName = false
  ): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (allowAnyBarePackageName && isValidNpmPackageName(trimmed)) {
      return trimmed
    }
    const parsed = parseNpmPluginSource(trimmed, { allowAnyBarePackageName })
    return parsed?.packageName
  }

  function addNpmPackageAliases(
    keys: Set<string>,
    value: unknown,
    providerId?: unknown,
    options: { allowAnyBarePackageName?: boolean; includeInferredName?: boolean } = {}
  ): void {
    const packageName = extractNpmPackageName(value, options.allowAnyBarePackageName ?? true)
    if (!packageName) return

    const prefixed = `npm:${packageName}`
    addLookupKey(keys, packageName)
    addLookupKey(keys, prefixed)
    addCompositeLookupKey(keys, packageName, providerId)
    addCompositeLookupKey(keys, prefixed, providerId)

    if (options.includeInferredName) {
      const inferredName = inferPluginNameFromNpmPackage(packageName)
      if (inferredName) {
        addLookupKey(keys, inferredName)
        addCompositeLookupKey(keys, inferredName, providerId)
      }
    }
  }

  function buildStoreLookupKeys(plugin: StorePluginListItem): string[] {
    const keys = new Set<string>()
    const identities = [plugin.id, plugin.name, plugin.manifest?.id, plugin.manifest?.name]

    for (const identity of identities) {
      addLookupKey(keys, identity)
      addCompositeLookupKey(keys, identity, plugin.providerId)
    }

    const metadataNpm =
      plugin.metadata?.npm && typeof plugin.metadata.npm === 'object'
        ? (plugin.metadata.npm as { packageName?: unknown })
        : undefined
    const npmPackageCandidates: unknown[] = [
      plugin.install?.type === 'npm' ? plugin.install.packageName : undefined,
      plugin.metadata?.packageName,
      plugin.metadata?.npmPackageName,
      metadataNpm?.packageName
    ]
    if (typeof plugin.id === 'string' && plugin.id.trim().startsWith('npm:')) {
      npmPackageCandidates.push(plugin.id)
    }

    for (const candidate of npmPackageCandidates) {
      addNpmPackageAliases(keys, candidate, plugin.providerId, {
        allowAnyBarePackageName: true,
        includeInferredName: true
      })
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
      addLookupKey(aliases, pluginEntry.id)

      const installSource = pluginEntry.installSource
      const metadata = installSource?.metadata
      const clientMetadata = installSource?.clientMetadata
      const providerMetadata = installSource?.providerMetadata
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

      const npmPackageCandidates = [
        providerMetadata?.packageName,
        providerMetadata?.npmPackageName,
        metadata?.packageName,
        metadata?.npmPackageName,
        clientMetadata?.packageName
      ]
      for (const candidate of npmPackageCandidates) {
        addNpmPackageAliases(aliases, candidate, providerId, {
          allowAnyBarePackageName: true,
          includeInferredName: false
        })
      }

      if (installSource?.source) {
        addNpmPackageAliases(aliases, installSource.source, providerId, {
          allowAnyBarePackageName: installSource.provider === 'npm',
          includeInferredName: false
        })
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
        isBundledManaged: false,
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
      isBundledManaged: PRIVILEGED_PLUGIN_NAMES.includes(plugin.manifest?.name || plugin.name),
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
