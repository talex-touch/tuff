import { SearchEngineCore } from '../search-engine/search-core'
import { TuffItem, TuffQuery, TuffSearchResult } from '../search-engine/types'
import { IProviderActivate } from '@talex-touch/utils'
import { windowManager } from './window'
import { genPluginManager } from '../../../plugins'
import { IPluginFeature } from '@talex-touch/utils/plugin'
import path from 'path'
import { ipcManager } from './ipc'
import { shortcutManager } from './shortcuts'

export class CoreBoxManager {
  searchEngine: SearchEngineCore
  private static instance: CoreBoxManager
  private _show: boolean = false
  private _expand: number = 0
  private lastTrigger: number = -1
  private isUIMode: boolean = false
  private uiViewUrl: string | null = null

  private constructor() {
    this.searchEngine = SearchEngineCore.getInstance()
  }

  public static getInstance(): CoreBoxManager {
    if (!CoreBoxManager.instance) {
      CoreBoxManager.instance = new CoreBoxManager()
    }
    return CoreBoxManager.instance
  }

  public init(): void {
    windowManager.create()
    ipcManager.register()
    shortcutManager.register()
  }

  public destroy(): void {
    ipcManager.unregister()
    shortcutManager.unregister()
  }

  public get showCoreBox(): boolean {
    return this._show
  }

  public trigger(show: boolean): void {
    if (Date.now() - this.lastTrigger < 200) return
    this.lastTrigger = Date.now()

    this._show = show

    if (show) {
      if (this.isUIMode && this.uiViewUrl) {
        windowManager.attachUIView(this.uiViewUrl)
        windowManager.expand(0, true)
      } else if (!this._expand) {
        windowManager.shrink()
      } else {
        windowManager.expand(this._expand)
      }
      windowManager.show()
    } else {
      windowManager.hide()
    }
  }

  public expand(length: number): void {
    this._expand = length
    windowManager.expand(length)
  }

  public shrink(): void {
    this._expand = 0
    windowManager.shrink()
  }

  public enterUIMode(url: string): void {
    this.isUIMode = true
    this.uiViewUrl = url
    this.trigger(true)
  }

  public exitUIMode(): void {
    this.isUIMode = false
    this.uiViewUrl = null
    windowManager.detachUIView()
    this.shrink()
  }

  public async search(query: TuffQuery): Promise<TuffSearchResult | null> {
    try {
      return await this.searchEngine.search(query)
    } catch (error) {
      console.error('[CoreBoxManager] Search failed:', error)
      return null
    }
  }

  public async execute(
    item: TuffItem,
    searchResult: TuffSearchResult
  ): Promise<IProviderActivate[] | null> {
    const providerId = item.source.id
    const provider = this.searchEngine.getProvidersByIds([providerId])[0]

    if (!provider) {
      console.warn(
        `[CoreBoxManager] No provider found for item with source ID: ${providerId}`,
        item
      )
      return null
    }

    // Handle UI Mode Feature
    if (item.source.from === 'plugin-features') {
      const pluginName = item.meta.pluginName
      const featureId = item.id
      const plugin = genPluginManager().getPluginByName(pluginName)
      if (!plugin) {
        console.error(`[CoreBoxManager] Could not find plugin: ${pluginName}`)
        return null
      }
      const feature = plugin.getFeature(featureId)
      if (!feature?.interaction || feature.interaction.type !== 'view') {
        // This case should ideally not happen if the item is well-formed
        // but it's good practice to check.
        // We proceed to the default provider execution below.
      } else {
        const interactionPath = feature.interaction.path
        let viewUrl: string

        if (plugin.dev.enable && plugin.dev.source) {
          // Dev source mode: load from remote dev server
          viewUrl = new URL(interactionPath, plugin.dev.address).toString()
        } else {
          // Production or local dev mode: load from local file system
          if (interactionPath.includes('..')) {
            console.error(
              `[CoreBoxManager] Security Alert: Aborted loading view with invalid path: ${interactionPath}`
            )
            plugin.issues.push({
              type: 'error',
              code: 'INVALID_VIEW_PATH',
              message: `Interaction path cannot contain '..'.`,
              source: `feature:${feature.id}`,
              timestamp: Date.now()
            })
            return null
          }
          const viewPath = path.join(plugin.pluginPath, interactionPath)
          viewUrl = 'file://' + viewPath
        }

        this.enterUIMode(viewUrl)
        return null // Stop further execution
      }
    }

    if (!provider.onExecute) {
      console.warn(`[CoreBoxManager] No onExecute method found for provider: ${provider.id}`)
      return null
    }

    // Record the execution before potentially changing the state
    if (searchResult.sessionId) {
      this.searchEngine.recordExecute(searchResult.sessionId, item)
    }

    const activation = await provider.onExecute({ item, searchResult })

    if (activation) {
      this.searchEngine.activateProviders([activation])
      return this.searchEngine.getActivationState()
    }

    // If not activating, we still need to clear the search box, but no state change occurs.
    // The frontend will handle clearing the input.
    return null
  }

  public deactivateProvider(id: string): IProviderActivate[] | null {
    this.searchEngine.deactivateProvider(id)
    return this.searchEngine.getActivationState()
  }
}

export const coreBoxManager = CoreBoxManager.getInstance()
