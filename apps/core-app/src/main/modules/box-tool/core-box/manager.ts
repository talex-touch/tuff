import { SearchEngineCore } from '../search-engine/search-core'
import { TuffQuery, TuffSearchResult } from '../search-engine/types'
import { windowManager } from './window'
import { ITouchPlugin } from '@talex-touch/utils/plugin'
import { ipcManager } from './ipc'
import { shortcutManager } from './shortcuts'

export class CoreBoxManager {
  searchEngine: SearchEngineCore
  private static instance: CoreBoxManager
  private _show: boolean = false
  private _expand: number = 0
  private lastTrigger: number = -1
  private _isUIMode: boolean = false // Rename to private property

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

  public get isUIMode(): boolean { // Public getter for _isUIMode
    return this._isUIMode;
  }

  public trigger(show: boolean): void {
    if (Date.now() - this.lastTrigger < 200) return
    this.lastTrigger = Date.now()

    this._show = show

    if (show) {
      if (!this._expand) {
        this.shrink()
      } else {
        this.expand(this._expand)
      }
      windowManager.show()
    } else {
      windowManager.hide()
    }
  }

  public expand(length: number): void {
    this._expand = length
    windowManager.expand(length, this.isUIMode)
  }

  public shrink(): void {
    this._expand = 0
    windowManager.shrink()
  }

  public enterUIMode(url: string, plugin?: ITouchPlugin): void {
    this._isUIMode = true // Use private property
    this.expand(10)
    windowManager.attachUIView(url, plugin)
    this.trigger(true)
  }

  public exitUIMode(): void {
    this._isUIMode = false // Use private property
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
}

export const coreBoxManager = CoreBoxManager.getInstance()
