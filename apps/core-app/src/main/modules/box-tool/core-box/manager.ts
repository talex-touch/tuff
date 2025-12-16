import type { TuffQuery as TuffQueryBase } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { ProviderDeactivatedEvent } from '../../../core/eventbus/touch-event'
import type { TouchPlugin } from '../../plugin/plugin'
import type { TuffQuery, TuffSearchResult } from '../search-engine/types'
import { ChannelType } from '@talex-touch/utils/channel'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { genTouchApp } from '../../../core'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import { getConfig } from '../../storage'
import { SearchEngineCore } from '../search-engine/search-core'
import { searchLogger } from '../search-engine/search-logger'
import { ipcManager } from './ipc'
import { windowManager } from './window'

interface ExpandOptions {
  length?: number
  forceMax?: boolean
}

/**
 * Options for triggering CoreBox visibility
 */
interface TriggerOptions {
  /** Whether the trigger was initiated by a keyboard shortcut */
  triggeredByShortcut?: boolean
}

export class CoreBoxManager {
  private _searchEngine: SearchEngineCore | null = null
  private static instance: CoreBoxManager
  private _show: boolean = false
  private _isCollapsed = true
  private _expandState: ExpandOptions = {}
  private lastTrigger: number = -1
  private _isUIMode: boolean = false // Rename to private property
  private currentFeature: IPluginFeature | null = null

  private constructor() {
    // Lazy initialization to avoid circular dependency
    // Set up event listeners
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Listen for provider deactivation events
    touchEventBus.on(TalexEvents.PROVIDER_DEACTIVATED, (event) => {
      const deactivationEvent = event as ProviderDeactivatedEvent

      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase(
          'CoreBoxManager Event',
          `Provider deactivated: ${deactivationEvent.providerId}, isPluginFeature: ${deactivationEvent.isPluginFeature}, allDeactivated: ${deactivationEvent.allProvidersDeactivated}`,
        )
      }

      // If a plugin feature was deactivated or all providers were deactivated, exit UI mode
      if ((deactivationEvent.isPluginFeature || deactivationEvent.allProvidersDeactivated) && this.isUIMode) {
        if (searchLogger.isEnabled()) {
          searchLogger.logSearchPhase('CoreBoxManager Event', 'Exiting UI mode')
        }
        this.exitUIMode()
      }
    })
  }

  public get searchEngine(): SearchEngineCore {
    if (!this._searchEngine) {
      this._searchEngine = SearchEngineCore.getInstance()
    }
    return this._searchEngine
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

  public get isCollapsed(): boolean {
    return this._isCollapsed
  }

  public get isUIMode(): boolean {
    // Public getter for _isUIMode
    return this._isUIMode
  }

  /**
   * Toggle CoreBox visibility
   * @param show - Whether to show or hide CoreBox
   * @param options - Trigger options including shortcut flag
   */
  public trigger(show: boolean, options?: TriggerOptions): void {
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
      }
      catch (error) {
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
      windowManager.show(options?.triggeredByShortcut ?? false)
    }
    else {
      if (!this._isUIMode) {
        this._isCollapsed = true
        this._expandState = {}
      }
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

  public enterUIMode(
    url: string,
    plugin?: TouchPlugin,
    feature?: IPluginFeature,
    query?: TuffQueryBase | string,
  ): void {
    this._isUIMode = true
    this.currentFeature = feature || null
    this.expand({ length: 10 })
    windowManager.attachUIView(url, plugin, query, feature)
    this.trigger(true)
  }

  public exitUIMode(): void {
    if (this._isUIMode) {
      this._isUIMode = false
      this.currentFeature = null
      windowManager.detachUIView()
      this.shrink()

      const coreBoxWindow = windowManager.current?.window
      if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
        genTouchApp().channel.sendTo(
          coreBoxWindow,
          ChannelType.MAIN,
          'core-box:ui-mode-exited',
          { resetInput: true }
        )

        setTimeout(() => {
          if (!coreBoxWindow.isDestroyed()) {
            coreBoxWindow.focus()
          }
        }, 100)
      }
    }
    else {
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
    }
    catch (error) {
      console.error('[CoreBoxManager] Search failed:', error)
      return null
    }
  }
}

export const coreBoxManager = CoreBoxManager.getInstance()
