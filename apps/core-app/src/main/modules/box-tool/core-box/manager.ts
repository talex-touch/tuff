import { SearchEngineCore } from '../search-engine/search-core'
import { TuffItem, TuffQuery } from '../search-engine/types'
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

  public trigger(show: boolean) {
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

  public expand(length: number) {
    this._expand = length
    windowManager.expand(length)
  }

  public shrink() {
    this._expand = 0
    windowManager.shrink()
  }

  public async startSearch(query: TuffQuery, searchId: string) {
    try {
      await this.searchEngine.search(query, (items) => {
        ipcManager.pushItems(searchId, items)
      })
    } catch (error) {
      console.error('[CoreBoxManager] Search failed:', error)
    } finally {
      ipcManager.notifySearchEnd(searchId)
    }
  }

  public async search(query: TuffQuery) {
    try {
      return await this.searchEngine.search(query)
    } catch (error) {
      console.error('[CoreBoxManager] Search failed:', error)
      return null
    }
  }

  public async execute(item: TuffItem) {
    const provider = this.searchEngine.getActiveProviders().find((p) => p.id === item.from)
    if (!provider) {
      console.warn(
        `[CoreBoxManager] No provider found for item: ${item.from}`,
        item,
        this.searchEngine.getActiveProviders()
      )
      return null
    }

    if (!provider.onExecute) {
      console.warn(`[CoreBoxManager] No execute method found for provider`, provider)
      return null
    }

    return provider.onExecute(item)
  }
}

export const coreBoxManager = CoreBoxManager.getInstance()
