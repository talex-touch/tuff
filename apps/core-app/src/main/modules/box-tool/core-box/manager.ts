import type { TuffQuery as TuffQueryBase } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { ProviderDeactivatedEvent } from '../../../core/eventbus/touch-event'
import type { TouchPlugin } from '../../plugin/plugin'
import type { TuffQuery, TuffSearchResult } from '../search-engine/types'
import { TuffSearchResultBuilder } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { maybeGetRegisteredMainRuntime } from '../../../core/runtime-accessor'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import type { OnboardingGateDecision } from '../../storage'
import { OnboardingGateError, onboardingGate } from '../../storage'
import { createLogger } from '../../../utils/logger'
import { SearchEngineCore } from '../search-engine/search-core'
import { searchLogger } from '../search-engine/search-logger'
import type { SearchRequestContext } from '../search-engine/search-session'
import { ipcManager } from './ipc'
import { windowManager } from './window'

const coreBoxManagerLog = createLogger('CoreBox').child('Manager')
const COREBOX_PRESSURE_REASON = 'corebox-active'
const COREBOX_PRESSURE_TTL_MS = 30_000

const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel

const getCoreBoxRuntimeOrNull = () => maybeGetRegisteredMainRuntime('core-box')

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
  /** Hide the CoreBox window synchronously before continuing follow-up work. */
  immediate?: boolean
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
  private readonly pollingService = PollingService.getInstance()

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
          `Provider deactivated: ${deactivationEvent.providerId}, isPluginFeature: ${deactivationEvent.isPluginFeature}, allDeactivated: ${deactivationEvent.allProvidersDeactivated}`
        )
      }

      // If a plugin feature was deactivated or all providers were deactivated, exit UI mode
      if (
        (deactivationEvent.isPluginFeature || deactivationEvent.allProvidersDeactivated) &&
        this.isUIMode
      ) {
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

  public syncVisibility(visible: boolean): void {
    if (this._show === visible) {
      return
    }

    this._show = visible
    if (visible) {
      this.applyActivePressure()
    } else {
      this.pollingService.clearGlobalPressure(COREBOX_PRESSURE_REASON)
    }
  }

  private routeAdmissionFailure(
    decision: Exclude<OnboardingGateDecision, { state: 'allowed' }>
  ): void {
    coreBoxManagerLog.warn('CoreBox activation blocked by onboarding gate', {
      meta: {
        state: decision.state,
        reason: decision.reason,
        recoverable: decision.recoverable
      }
    })

    const mainWindow = getCoreBoxRuntimeOrNull()?.app.window.window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  }

  private buildBlockedSearchResult(query: TuffQuery): TuffSearchResult {
    return new TuffSearchResultBuilder(query).setItems([]).setDuration(0).setSources([]).build()
  }

  /**
   * Toggle CoreBox visibility
   * @param show - Whether to show or hide CoreBox
   * @param options - Trigger options including shortcut flag
   */
  public trigger(show: boolean, options?: TriggerOptions): boolean {
    if (show) {
      const decision = onboardingGate.evaluate()
      if (decision.state !== 'allowed') {
        this.routeAdmissionFailure(decision)
        return false
      }
    }

    const now = Date.now()
    const currentWindow = windowManager.current?.window
    const realVisible =
      currentWindow && !currentWindow.isDestroyed() ? currentWindow.isVisible() : false
    if (now - this.lastTrigger < 200 && this._show === show && realVisible === show) {
      return true
    }
    this.lastTrigger = now

    this._show = show

    if (show) {
      this.applyActivePressure()
      this.applyExpandState()
      windowManager.show(options?.triggeredByShortcut ?? false)
    } else {
      if (!this._isUIMode) {
        this._isCollapsed = true
        this._expandState = {}
      }
      windowManager.hide({ immediate: options?.immediate === true })
      this.pollingService.clearGlobalPressure(COREBOX_PRESSURE_REASON)
    }

    return true
  }

  private applyActivePressure(): void {
    this.pollingService.setGlobalPressure({
      reason: COREBOX_PRESSURE_REASON,
      until: Date.now() + COREBOX_PRESSURE_TTL_MS,
      laneMultipliers: {
        realtime: 2,
        io: 4,
        maintenance: 8,
        serial: 6
      },
      concurrencyCaps: {
        realtime: 1,
        io: 1,
        maintenance: 1,
        serial: 1
      }
    })
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

  /**
   * Mark as expanded without triggering window animation.
   * Used by set-height IPC to avoid double animation.
   */
  public markExpanded(): void {
    this._isCollapsed = false
  }

  public enterUIMode(
    url: string,
    plugin?: TouchPlugin,
    feature?: IPluginFeature,
    query?: TuffQueryBase
  ): void {
    this._isUIMode = true
    this.currentFeature = feature || null
    this.expand({ length: 10 })
    windowManager.attachUIView(url, plugin, query, feature)
    this.trigger(true)
  }

  public exitUIMode(): void {
    const runtime = getCoreBoxRuntimeOrNull()
    if (runtime?.app.isQuitting === true) {
      this._isUIMode = false
      this.currentFeature = null
      return
    }

    if (this._isUIMode) {
      this._isUIMode = false
      this.currentFeature = null
      windowManager.detachUIView()
      this.shrink()

      const coreBoxWindow = windowManager.current?.window
      if (coreBoxWindow && !coreBoxWindow.isDestroyed() && runtime) {
        const keyManager = resolveKeyManager(runtime.channel as { keyManager?: unknown })
        const transport = getTuffTransportMain(runtime.channel, keyManager)
        void transport.sendTo(coreBoxWindow.webContents, CoreBoxEvents.ui.uiModeExited, {
          resetInput: true
        })

        setTimeout(() => {
          if (!coreBoxWindow.isDestroyed()) {
            coreBoxWindow.focus()
          }
        }, 100)
      }
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

  public async search(query: TuffQuery, context?: SearchRequestContext): Promise<TuffSearchResult> {
    const decision = onboardingGate.evaluate()
    if (decision.state !== 'allowed') {
      this.routeAdmissionFailure(decision)
      return this.buildBlockedSearchResult(query)
    }

    try {
      return await this.searchEngine.search(query, context)
    } catch (error) {
      if (error instanceof OnboardingGateError) {
        this.routeAdmissionFailure(error.decision)
        return this.buildBlockedSearchResult(query)
      }
      coreBoxManagerLog.error('Search failed', { error })
      return this.buildBlockedSearchResult(query)
    }
  }
}

export const coreBoxManager = CoreBoxManager.getInstance()
