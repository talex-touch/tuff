/**
 * Composable for managing plugin version status in market context
 *
 * Provides unified logic for checking installed plugins and upgrade availability
 */
import { computed, type ComputedRef } from 'vue'
import { usePluginStore } from '~/stores/plugin'
import { hasUpgradeAvailable } from './useVersionCompare'
import type { MarketPluginListItem } from './useMarketData'

export interface PluginVersionStatus {
  /** Whether the plugin is installed locally */
  isInstalled: boolean
  /** Installed version (if installed) */
  installedVersion: string | undefined
  /** Market version */
  marketVersion: string | undefined
  /** Whether a newer version is available in market */
  hasUpgrade: boolean
}

/**
 * Hook for managing plugin version status across the market
 * Used by both Market list and MarketDetail views
 */
export function usePluginVersionStatus() {
  const pluginStore = usePluginStore()

  /** Set of installed plugin names */
  const installedPluginNames = computed(() => new Set([...pluginStore.plugins.keys()]))

  /** Map of installed plugin names to their versions */
  const installedPluginVersions = computed(() => {
    const map = new Map<string, string>()
    for (const [name, plugin] of pluginStore.plugins) {
      if (plugin.version) {
        map.set(name, plugin.version)
      }
    }
    return map
  })

  /**
   * Check if a plugin is installed by name
   */
  function isPluginInstalled(pluginName: string): boolean {
    return installedPluginNames.value.has(pluginName)
  }

  /**
   * Get installed version for a plugin
   */
  function getInstalledVersion(pluginName: string): string | undefined {
    return installedPluginVersions.value.get(pluginName)
  }

  /**
   * Check if a plugin has an upgrade available
   */
  function checkHasUpgrade(pluginName: string, marketVersion: string | undefined): boolean {
    const installedVersion = getInstalledVersion(pluginName)
    return hasUpgradeAvailable(installedVersion, marketVersion)
  }

  /**
   * Get complete version status for a plugin
   */
  function getPluginVersionStatus(plugin: MarketPluginListItem | null): PluginVersionStatus {
    if (!plugin) {
      return {
        isInstalled: false,
        installedVersion: undefined,
        marketVersion: undefined,
        hasUpgrade: false
      }
    }

    const installedVersion = getInstalledVersion(plugin.name)
    return {
      isInstalled: isPluginInstalled(plugin.name),
      installedVersion,
      marketVersion: plugin.version,
      hasUpgrade: hasUpgradeAvailable(installedVersion, plugin.version)
    }
  }

  /**
   * Create a computed version status for a single plugin (useful for detail views)
   */
  function usePluginStatus(plugin: ComputedRef<MarketPluginListItem | null>): ComputedRef<PluginVersionStatus> {
    return computed(() => getPluginVersionStatus(plugin.value))
  }

  return {
    // Data
    installedPluginNames,
    installedPluginVersions,
    // Methods
    isPluginInstalled,
    getInstalledVersion,
    checkHasUpgrade,
    getPluginVersionStatus,
    usePluginStatus
  }
}
