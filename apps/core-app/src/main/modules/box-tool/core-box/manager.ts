import { SearchEngineCore } from '../search-engine/search-core'
import { TuffItem, TuffQuery, TuffSearchResult } from '../search-engine/types'
import { IProviderActivate } from '@talex-touch/utils'
import { windowManager } from './window'
import { ipcManager } from './ipc'
import { shortcutManager } from './shortcuts'

export class CoreBoxManager {
  searchEngine: SearchEngineCore
  private static instance: CoreBoxManager
  private _show: boolean = false
  private _expand: number = 0
  private lastTrigger: number = -1

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
      if (!this._expand) {
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
