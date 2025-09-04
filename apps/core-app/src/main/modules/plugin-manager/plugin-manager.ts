import type { ISearchEngine, ISearchProvider } from '../box-tool/search-engine/types'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IManifest } from '@talex-touch/utils/plugin'
import { IPluginSource } from '@talex-touch/utils/plugin/plugin-source'
import { TpexPluginSource, NpmPluginSource } from './plugin-source'


export interface IPluginManager {
  loadPlugins(pluginsDir: string): Promise<void>
  unloadPlugin(pluginId: string): Promise<void>
  getPluginManifest(pluginId: string): IManifest | undefined
  getLoadedPlugins(): Map<string, ISearchProvider>
}

export class PluginManager implements IPluginManager {
  private searchEngine: ISearchEngine
  private loadedPlugins: Map<string, { manifest: IManifest; instance: ISearchProvider }> = new Map()
  private pluginSources: IPluginSource[]

  constructor(searchEngine: ISearchEngine, pluginSources?: IPluginSource[]) {
    this.searchEngine = searchEngine
    this.pluginSources = pluginSources || [new TpexPluginSource(), new NpmPluginSource()]
    console.log('[PluginManager] Initialized.')
  }

  public async loadPlugins(pluginsDir: string): Promise<void> {
    console.log(`[PluginManager] Starting to load plugins from: ${pluginsDir}`)
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginPath = path.join(pluginsDir, entry.name)
          await this.loadPlugin(pluginPath)
        }
      }
    } catch (error) {
      console.error(`[PluginManager] Failed to read plugins directory: ${pluginsDir}`, error)
    }
  }

  private async loadPlugin(pluginPath: string): Promise<void> {
    let manifest: IManifest | undefined

    // 尝试使用不同的插件来源解析器来解析清单
    for (const source of this.pluginSources) {
      manifest = await source.resolveManifest(pluginPath)
      if (manifest) {
        break // 成功解析，跳出循环
      }
    }

    if (!manifest) {
      console.warn(`[PluginManager] No valid plugin manifest found for ${pluginPath} using available sources.`)
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
        `[PluginManager] Successfully loaded plugin: ${manifest.name} (v${manifest.version})`
      )
    } catch (error: any) { // 捕获错误并处理
      console.error(`[PluginManager] Failed to load plugin from ${pluginPath}:`, error)
    }
  }

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

  public getPluginManifest(pluginId: string): IManifest | undefined {
    return this.loadedPlugins.get(pluginId)?.manifest
  }

  public getLoadedPlugins(): Map<string, ISearchProvider> {
    const map = new Map<string, ISearchProvider>()
    for (const [id, data] of this.loadedPlugins.entries()) {
      map.set(id, data.instance)
    }
    return map
  }
}
