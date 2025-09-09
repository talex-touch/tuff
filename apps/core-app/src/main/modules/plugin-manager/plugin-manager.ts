import type { ISearchEngine, ISearchProvider } from '../box-tool/search-engine/types'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IManifest, PluginSourceType } from '@talex-touch/utils/plugin'
import { IPluginSource, IResolveManifestOptions } from '@talex-touch/utils/plugin/plugin-source'
import { TpexPluginSource, NpmPluginSource } from './plugin-source'


/**
 * Interface for the Plugin Manager, defining its core functionalities.
 */
export interface IPluginManager {
  /**
   * Loads plugins from a specified directory.
   * @param pluginsDir - The directory to scan for plugins.
   */
  loadPlugins(pluginsDir: string): Promise<void>
  /**
   * Unloads a plugin by its ID.
   * @param pluginId - The unique identifier of the plugin to unload.
   */
  unloadPlugin(pluginId: string): Promise<void>
  /**
   * Retrieves the manifest of a loaded plugin.
   * @param pluginId - The unique identifier of the plugin.
   * @returns The plugin's manifest, or undefined if not found.
   */
  getPluginManifest(pluginId: string): IManifest | undefined
  /**
   * Retrieves a map of all loaded plugins, keyed by their IDs.
   * @returns A Map where keys are plugin IDs and values are ISearchProvider instances.
   */
  getLoadedPlugins(): Map<string, ISearchProvider>
}

/**
 * Manages the loading, unloading, and lifecycle of plugins.
 * It uses various IPluginSource implementations to resolve and load different types of plugins.
 */
export class PluginManager implements IPluginManager {
  private searchEngine: ISearchEngine
  private loadedPlugins: Map<string, { manifest: IManifest; instance: ISearchProvider }> = new Map()
  private pluginSources: Map<PluginSourceType, IPluginSource>

  /**
   * Constructs a new PluginManager instance.
   * @param searchEngine - The search engine instance to register plugin providers with.
   * @param pluginSources - A map of plugin source types to their respective IPluginSource implementations.
   *                        If not provided, default TPEX and NPM sources will be used.
   */
  constructor(searchEngine: ISearchEngine, pluginSources?: Map<PluginSourceType, IPluginSource>) {
    this.searchEngine = searchEngine
    // Initialize with default plugin sources if none are provided
    this.pluginSources = pluginSources || new Map([
      [PluginSourceType.TPEX, new TpexPluginSource()],
      [PluginSourceType.NPM, new NpmPluginSource()]
    ]);
    console.log('[PluginManager] Initialized.')
  }

  /**
   * Scans a directory and attempts to load all valid plugins found within it.
   * This method primarily uses the TPEX plugin source (acting as a file system reader)
   * to resolve manifests for plugins located in the local directory.
   * @param pluginsDir - The directory path where plugins are located.
   */
  public async loadPlugins(pluginsDir: string): Promise<void> {
    console.log(`[PluginManager] Starting to load plugins from: ${pluginsDir}`)
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(pluginsDir, entry.name)
          // For directory scanning, assume a file system based plugin source (e.g., TPEX)
          await this.loadPlugin(pluginPath, PluginSourceType.TPEX)
        }
      }
    } catch (error) {
      console.error(`[PluginManager] Failed to read plugins directory: ${pluginsDir}`, error)
    }
  }

  /**
   * Loads a single plugin from a given path using a specified plugin source type.
   * @param pluginPath - The root directory path or URL of the plugin.
   * @param providerType - The type of plugin source to use for resolving the manifest. Defaults to TPEX.
   * @returns A Promise that resolves when the plugin is loaded, or rejects if loading fails.
   */
  private async loadPlugin(pluginPath: string, providerType: PluginSourceType = PluginSourceType.TPEX): Promise<void> {
    const source = this.pluginSources.get(providerType);
    if (!source) {
      console.error(`[PluginManager] No plugin source registered for type: ${providerType}.`);
      return;
    }

    const resolveOptions: IResolveManifestOptions = {};
    const manifest = await source.resolveManifest(pluginPath, resolveOptions);

    if (!manifest) {
      console.warn(`[PluginManager] No valid plugin manifest found for ${pluginPath} using ${source.getSourceName()}.`)
      return
    }

    try {

      if (!manifest.id || !manifest.main) {
        console.error(`[PluginManager] Invalid manifest in ${pluginPath}: id or main is missing.`)
        return
      }

      if (this.loadedPlugins.has(manifest.id)) {
        console.warn(`[PluginManager] Plugin '${manifest.id}' is already loaded.`)
        return
      }

      const logicPath = path.join(pluginPath, manifest.main)
      const logicPathUrl = 'file://' + logicPath
      const module = await import(logicPathUrl)
      const ProviderClass = module.default

      if (typeof ProviderClass !== 'function') {
        console.error(`[PluginManager] Plugin '${manifest.id}' does not have a default export.`)
        return
      }

      const providerInstance: ISearchProvider = new ProviderClass()
      this.searchEngine.registerProvider(providerInstance)

      this.loadedPlugins.set(manifest.id, { manifest, instance: providerInstance })
      console.log(
        `[PluginManager] Successfully loaded plugin: ${manifest.name} (v${manifest.version}) using ${source.getSourceName()}`
      )
    } catch (error: any) { // 捕获错误并处理
      console.error(`[PluginManager] Failed to load plugin from ${pluginPath} using ${source.getSourceName()}:`, error)
    }
  }

  /**
   * Unloads a plugin by its unique identifier.
   * @param pluginId - The ID of the plugin to unload.
   * @returns A Promise that resolves when the plugin is unloaded.
   */
  public async unloadPlugin(pluginId: string): Promise<void> {
    const pluginData = this.loadedPlugins.get(pluginId)
    if (!pluginData) {
      console.warn(`[PluginManager] Plugin '${pluginId}' is not loaded.`)
      return
    }
    this.searchEngine.unregisterProvider(pluginData.instance.id)
    this.loadedPlugins.delete(pluginId)
    console.log(`[PluginManager] Plugin '${pluginId}' unloaded.`)
  }

  /**
   * Retrieves the manifest of a currently loaded plugin.
   * @param pluginId - The unique identifier of the plugin.
   * @returns The IManifest object if the plugin is loaded, otherwise undefined.
   */
  public getPluginManifest(pluginId: string): IManifest | undefined {
    return this.loadedPlugins.get(pluginId)?.manifest
  }

  /**
   * Returns a map of all currently loaded search provider instances.
   * @returns A Map where keys are plugin IDs and values are the corresponding ISearchProvider instances.
   */
  public getLoadedPlugins(): Map<string, ISearchProvider> {
    const map = new Map<string, ISearchProvider>()
    for (const [id, data] of this.loadedPlugins.entries()) {
      map.set(id, data.instance)
    }
    return map
  }
}

let pluginManager: IPluginManager | null = null

export const PluginManagerModule: TalexTouch.IModule = {
  name: Symbol('PluginManager'),
  filePath: 'plugins',
  init(touchApp) {
    // @ts-ignore
    pluginManager = new PluginManager(touchApp.searchEngine)
  },
  destroy() {
    console.log('PluginManager module destroyed!')
  }
}
