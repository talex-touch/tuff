import type { ISearchEngine, ISearchProvider } from '../box-tool/search-engine/types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Plugin Metadata Interface
 * Describes the structure of plugin.json
 */
export interface IPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  main: string; // entry file, e.g., "logic.js"
  icon?: string;
  activationKeywords?: string[];
}

/**
 * Plugin Manager Interface
 */
export interface IPluginManager {
  /**
   * Loads all plugins from a specified directory.
   * @param pluginsDir - The directory to scan for plugins.
   */
  loadPlugins(pluginsDir: string): Promise<void>;

  /**
   * Unloads a specific plugin by its ID.
   * @param pluginId - The ID of the plugin to unload.
   */
  unloadPlugin(pluginId: string): Promise<void>;

  /**
   * Gets a loaded plugin's manifest by its ID.
   * @param pluginId - The ID of the plugin.
   */
  getPluginManifest(pluginId: string): IPluginManifest | undefined;
}

/**
 * PluginManager Core Implementation
 */
export class PluginManager implements IPluginManager {
  private searchEngine: ISearchEngine;
  private loadedPlugins: Map<string, IPluginManifest> = new Map();

  constructor(searchEngine: ISearchEngine) {
    this.searchEngine = searchEngine;
    console.log('[PluginManager] Initialized.');
  }

  public async loadPlugins(pluginsDir: string): Promise<void> {
    console.log(`[PluginManager] Starting to load plugins from: ${pluginsDir}`);
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(pluginsDir, entry.name);
          await this.loadPlugin(pluginPath);
        }
      }
    } catch (error) {
      console.error(`[PluginManager] Failed to read plugins directory: ${pluginsDir}`, error);
    }
  }

  private async loadPlugin(pluginPath: string): Promise<void> {
    const manifestPath = path.join(pluginPath, 'plugin.json');
    try {
      // 1. Read and parse manifest
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: IPluginManifest = JSON.parse(manifestContent);

      if (!manifest.id || !manifest.main) {
        console.error(`[PluginManager] Invalid manifest in ${pluginPath}: id or main is missing.`);
        return;
      }

      if (this.loadedPlugins.has(manifest.id)) {
        console.warn(`[PluginManager] Plugin '${manifest.id}' is already loaded.`);
        return;
      }

      // 2. Load plugin logic
      const logicPath = path.join(pluginPath, manifest.main);
      // Ensure the path is treated as a file URL for ESM compatibility
      const logicPathUrl = 'file://' + logicPath;
      const module = await import(logicPathUrl);
      const ProviderClass = module.default;

      if (typeof ProviderClass !== 'function') {
        console.error(`[PluginManager] Plugin '${manifest.id}' does not have a default export.`);
        return;
      }

      // 3. Instantiate and register provider
      const providerInstance: ISearchProvider = new ProviderClass();
      this.searchEngine.registerProvider(providerInstance);

      // 4. Store manifest
      this.loadedPlugins.set(manifest.id, manifest);
      console.log(`[PluginManager] Successfully loaded plugin: ${manifest.name} (v${manifest.version})`);

    } catch (error) {
      console.error(`[PluginManager] Failed to load plugin from ${pluginPath}`, error);
    }
  }

  public async unloadPlugin(pluginId: string): Promise<void> {
    if (!this.loadedPlugins.has(pluginId)) {
      console.warn(`[PluginManager] Plugin '${pluginId}' is not loaded.`);
      return;
    }

    // Unregister from search engine
    this.searchEngine.unregisterProvider(pluginId);

    this.loadedPlugins.delete(pluginId);
    console.log(`[PluginManager] Plugin '${pluginId}' unloaded.`);
    // TODO: Add logic to destroy the sandbox environment.
  }

  public getPluginManifest(pluginId: string): IPluginManifest | undefined {
    return this.loadedPlugins.get(pluginId);
  }
}