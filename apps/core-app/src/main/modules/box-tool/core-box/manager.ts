import { SearchEngineCore } from '../search-engine/search-core'
import { TuffQuery, TuffSearchResult } from '../search-engine/types'
import { windowManager } from './window'
import { IPluginFeature } from '@talex-touch/utils/plugin'
import { ipcManager } from './ipc'
import { TouchPlugin } from '../../plugin/plugin'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { getConfig } from '../../storage'

interface ExpandOptions {
  length?: number
  forceMax?: boolean
}

export class CoreBoxManager {
  searchEngine: SearchEngineCore
  private static instance: CoreBoxManager
  private _show: boolean = false
  private _isCollapsed = true
  private _expandState: ExpandOptions = {}
  private lastTrigger: number = -1
  private _isUIMode: boolean = false // Rename to private property
  private currentFeature: IPluginFeature | null = null

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
  }

  public destroy(): void {
    ipcManager.unregister()
  }

  public get showCoreBox(): boolean {
    return this._show
  }

  public get isUIMode(): boolean {
    // Public getter for _isUIMode
    return this._isUIMode
  }

  public trigger(show: boolean): void {
    // If trying to show, check if initialization is complete
    if (show) {
      try {
        const appSetting = getConfig(StorageList.APP_SETTING) as any
        if (!appSetting?.beginner?.init) {
          console.warn('[CoreBoxManager] Initialization not complete, cannot open CoreBox')
          // Show main window to guide user to complete initialization
          const mainWindow = $app.window.window
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
          }
          return
        }
      } catch (error) {
        console.error('[CoreBoxManager] Failed to check initialization status:', error)
        // If we can't check, allow CoreBox to open (fail-open approach)
      }
    }

    const now = Date.now()
    if (now - this.lastTrigger < 200 && this._show === show) {
      return
    }
    this.lastTrigger = now

    this._show = show

    if (show) {
      this.applyExpandState()
      windowManager.show()
    } else {
      windowManager.hide()
    }
  }

  public expand(options: ExpandOptions = {}): void {
    this._isCollapsed = false
    this._expandState = { ...options }
    windowManager.expand(this._expandState, this.isUIMode)
  }

  public shrink(): void {
    this._isCollapsed = true
    this._expandState = {}
    windowManager.shrink()
  }

  public enterUIMode(url: string, plugin?: TouchPlugin, feature?: IPluginFeature): void {
    this._isUIMode = true // Use private property
    this.currentFeature = feature || null
    this.expand({ length: 10 })
    windowManager.attachUIView(url, plugin)
    this.trigger(true)
  }

  public exitUIMode(): void {
    if (this._isUIMode) {
      this._isUIMode = false // Use private property
      this.currentFeature = null
      windowManager.detachUIView()
      this.shrink()
    } else {
      console.warn('[CoreBoxManager] Not in UI mode, no need to exit.')
    }
  }

  public getCurrentFeature(): IPluginFeature | null {
    return this.currentFeature
  }

  private applyExpandState(): void {
    if (this._isCollapsed) {
      windowManager.shrink()
      return
    }

    windowManager.expand(this._expandState, this.isUIMode)
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
