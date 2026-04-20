/**
 * DivisionBoxSession - Main Process
 *
 * Manages a single DivisionBox instance lifecycle, state, and resources.
 * Uses TouchWindow + WebContentsView (attached) pattern, similar to CoreBox.
 * Implements a six-state lifecycle: prepare → attach → active → inactive → detach → destroy
 */

import type { DivisionBoxConfig, SessionMeta, StateChangeEvent } from '@talex-touch/utils'
import type { WebPreferences } from 'electron'
import type { TouchWindow } from '../../core/touch-window'
import type { TouchPlugin } from '../plugin/plugin'
import os from 'node:os'
import path from 'node:path'
import { DivisionBoxError, DivisionBoxErrorCode, DivisionBoxState } from '@talex-touch/utils'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { getPluginChannelPreludeCode } from '@talex-touch/utils/transport/prelude'
import { app, WebContentsView } from 'electron'
import fse from 'fs-extra'
import { getRegisteredMainRuntime } from '../../core/runtime-accessor'
import { useAliveWebContents } from '../../hooks/use-electron-guard'
import { createLogger } from '../../utils/logger'
import { pluginModule } from '../plugin/plugin-module'
import { usePluginInjections } from '../plugin/runtime/plugin-injections'

const divisionBoxSessionLog = createLogger('DivisionBoxSession')

/**
 * Type for state change listener callback
 */
type StateChangeListener = (event: StateChangeEvent) => void

/**
 * Valid state transitions in the lifecycle state machine
 */
const VALID_TRANSITIONS: Record<DivisionBoxState, DivisionBoxState[]> = {
  [DivisionBoxState.PREPARE]: [DivisionBoxState.ATTACH, DivisionBoxState.DESTROY],
  [DivisionBoxState.ATTACH]: [DivisionBoxState.ACTIVE, DivisionBoxState.DESTROY],
  [DivisionBoxState.ACTIVE]: [
    DivisionBoxState.INACTIVE,
    DivisionBoxState.DETACH,
    DivisionBoxState.DESTROY
  ],
  [DivisionBoxState.INACTIVE]: [
    DivisionBoxState.ACTIVE,
    DivisionBoxState.DETACH,
    DivisionBoxState.DESTROY
  ],
  [DivisionBoxState.DETACH]: [DivisionBoxState.DESTROY],
  [DivisionBoxState.DESTROY]: []
}

/**
 * DivisionBoxSession class
 *
 * Manages the lifecycle, state, and resources of a single DivisionBox instance.
 * Creates a TouchWindow and attaches a WebContentsView for plugin UI.
 */
export class DivisionBoxSession {
  readonly sessionId: string

  /** TouchWindow instance for this DivisionBox */
  private touchWindow: TouchWindow | null = null

  /** WebContentsView for plugin UI (attached to touchWindow) */
  private uiView: WebContentsView | null = null

  /** Current lifecycle state */
  private state: DivisionBoxState = DivisionBoxState.PREPARE

  /** Session-level state storage (key-value pairs) */
  private sessionState: Map<string, unknown> = new Map()

  /** Session metadata */
  readonly meta: SessionMeta

  /** KeepAlive timer for inactive state */
  private keepAliveTimer: NodeJS.Timeout | null = null

  /** State change event listeners */
  private stateChangeListeners: Set<StateChangeListener> = new Set()

  /** Configuration used to create this session */
  readonly config: DivisionBoxConfig

  /** Attached plugin reference */
  private attachedPlugin: TouchPlugin | null = null

  constructor(sessionId: string, config: DivisionBoxConfig) {
    this.sessionId = sessionId
    this.config = config

    const now = Date.now()
    this.meta = {
      pluginId: config.pluginId,
      title: config.title,
      icon: config.icon,
      size: config.size || 'medium',
      keepAlive: config.keepAlive || false,
      createdAt: now,
      lastAccessedAt: now
    }
  }

  /**
   * Gets the current lifecycle state
   *
   * @returns Current state
   */
  getState(): DivisionBoxState {
    return this.state
  }

  /**
   * Sets the lifecycle state with validation
   *
   * Validates the state transition against the state machine rules.
   * Triggers state change listeners on successful transition.
   *
   * @param newState - Target state to transition to
   * @throws {DivisionBoxError} If the transition is invalid
   */
  async setState(newState: DivisionBoxState): Promise<void> {
    const oldState = this.state

    // Check if already in target state
    if (oldState === newState) {
      return
    }

    // Validate state transition
    if (!this.isValidTransition(oldState, newState)) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.INVALID_TRANSITION,
        `Invalid state transition: ${oldState} -> ${newState}`,
        this.sessionId
      )
    }

    // Update state
    this.state = newState

    // Update last accessed timestamp
    this.meta.lastAccessedAt = Date.now()

    // Emit state change event
    const event: StateChangeEvent = {
      sessionId: this.sessionId,
      oldState,
      newState,
      timestamp: Date.now()
    }

    this.notifyStateChange(event)
  }

  /**
   * Checks if a state transition is valid according to the state machine
   *
   * @param from - Current state
   * @param to - Target state
   * @returns True if transition is valid
   */
  private isValidTransition(from: DivisionBoxState, to: DivisionBoxState): boolean {
    const validTargets = VALID_TRANSITIONS[from]
    return validTargets.includes(to)
  }

  /**
   * Notifies all registered state change listeners
   *
   * @param event - State change event data
   */
  private notifyStateChange(event: StateChangeEvent): void {
    this.stateChangeListeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        divisionBoxSessionLog.error('Error in state change listener', { error })
      }
    })
  }

  /**
   * Registers a state change listener
   *
   * @param listener - Callback to invoke on state changes
   */
  onStateChange(listener: StateChangeListener): void {
    this.stateChangeListeners.add(listener)
  }

  /**
   * Removes a state change listener
   *
   * @param listener - Callback to remove
   */
  removeStateChangeListener(listener: StateChangeListener): void {
    this.stateChangeListeners.delete(listener)
  }

  /**
   * Creates and initializes the DivisionBox window
   * Uses window pool for faster acquisition
   */
  async createWindow(): Promise<void> {
    divisionBoxSessionLog.debug(`createWindow called: ${this.sessionId}`)

    if (this.touchWindow) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.STATE_ERROR,
        'Window already exists',
        this.sessionId
      )
    }

    try {
      divisionBoxSessionLog.debug(`Acquiring window from pool: ${this.sessionId}`)
      // Acquire window from pool (pre-warmed)
      const { windowPool } = await import('./window-pool')
      divisionBoxSessionLog.debug(`windowPool imported: ${this.sessionId}`)
      this.touchWindow = await windowPool.acquire()
      divisionBoxSessionLog.debug(`Window acquired successfully: ${this.sessionId}`)

      const ensureVisible = (): void => {
        if (!this.touchWindow) return
        const win = this.touchWindow.window
        if (win.isDestroyed()) return
        if (!win.isVisible()) win.show()
        if (!win.isFocused()) win.focus()
      }

      // Update window title with unique identifier for Windows taskbar grouping
      this.touchWindow.window.setTitle(`${this.config.title} - Tuff Division`)

      // Windows-specific: Set unique AppUserModelId to ensure separate taskbar entries
      if (process.platform === 'win32') {
        try {
          // Each DivisionBox gets unique AppUserModelId based on sessionId/pluginId
          const appUserModelId = `TalexTouch.Tuff.DivisionBox.${this.config.pluginId || this.sessionId}`
          this.touchWindow.window.setAppDetails({
            appId: appUserModelId,
            appIconPath: process.execPath,
            appIconIndex: 0,
            relaunchCommand: '',
            relaunchDisplayName: this.config.title
          })
          divisionBoxSessionLog.debug(`Set AppUserModelId: ${appUserModelId}`)
        } catch (error) {
          divisionBoxSessionLog.warn('Failed to set AppDetails for DivisionBox window', { error })
        }
      }

      getRegisteredMainRuntime('division-box').transport.broadcastToWindow(
        this.touchWindow.window.id,
        CoreBoxEvents.ui.trigger,
        {
          type: 'division-box',
          sessionId: this.sessionId,
          config: this.config,
          meta: this.meta
        }
      )

      // Handle window close
      this.touchWindow.window.on('closed', () => {
        divisionBoxSessionLog.debug(`Window closed: ${this.sessionId}`)
        if (this.touchWindow) {
          windowPool.release(this.touchWindow.window)
        }
        this.touchWindow = null
        this.destroy().catch((err) => {
          divisionBoxSessionLog.error('Error in destroy after close', { error: err })
        })
      })

      // Handle window resize - update UI view bounds
      this.touchWindow.window.on('resize', () => {
        this.updateUIViewBounds()
      })

      // Show window
      this.touchWindow.window.once('ready-to-show', () => {
        ensureVisible()
      })
      ensureVisible()

      await this.setState(DivisionBoxState.ATTACH)
      divisionBoxSessionLog.debug(`Window acquired from pool: ${this.sessionId}`)
    } catch (error) {
      this.destroyWindow()
      throw new DivisionBoxError(
        DivisionBoxErrorCode.RESOURCE_ERROR,
        `Failed to create window: ${error}`,
        this.sessionId
      )
    }
  }

  /**
   * Updates UI view bounds to match window size
   */
  private updateUIViewBounds(): void {
    if (!this.touchWindow || !this.uiView) return

    const bounds = this.touchWindow.window.getBounds()
    const headerHeight = 64 // Match .CoreBox height in CoreBox.vue
    this.uiView.setBounds({
      x: 0,
      y: headerHeight,
      width: bounds.width,
      height: bounds.height - headerHeight
    })
  }

  /**
   * Attaches a WebContentsView for plugin UI
   * @param url - Plugin UI URL to load
   * @param plugin - Optional plugin reference for injection
   */
  async attachUIView(url: string, plugin?: TouchPlugin): Promise<void> {
    const startTime = performance.now()
    const metrics = { preload: 0, viewCreate: 0, loadUrl: 0, total: 0 }

    if (!this.touchWindow) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.STATE_ERROR,
        'Window must be created before attaching UI view',
        this.sessionId
      )
    }

    if (this.uiView) {
      divisionBoxSessionLog.warn('UI view already attached, detaching first')
      this.detachUIView()
    }

    const injections = usePluginInjections(plugin, 'division-box:attachUIView')
    let preloadPath = injections?._.preload

    // Create dynamic preload for plugin channel if available
    if (plugin && injections?.js) {
      const tempPreloadPath = path.resolve(
        os.tmpdir(),
        `tuff-division-preload-${plugin.name}-${Date.now()}.js`
      )

      const channelScript = this.generateChannelScript(plugin._uniqueChannelKey)
      const pluginInjectionCode = injections.js.trim()

      const combinedPreload = `
// DivisionBox preload for ${plugin.name}
(function() {
  try { ${pluginInjectionCode}; } catch(e) { console.error('[DivisionBox] Plugin inject failed:', e); }
  try { ${channelScript} } catch(e) { console.error('[DivisionBox] Channel inject failed:', e); }
})();
`
      try {
        fse.writeFileSync(tempPreloadPath, combinedPreload, 'utf-8')
        preloadPath = tempPreloadPath
      } catch (error) {
        divisionBoxSessionLog.error('Failed to create DivisionBox preload', { error })
      }
    }

    metrics.preload = performance.now() - startTime

    const webPreferences: WebPreferences = {
      preload: preloadPath || undefined,
      webSecurity: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true,
      scrollBounce: true,
      transparent: true
    }

    const viewCreateStart = performance.now()
    this.uiView = new WebContentsView({ webPreferences })
    metrics.viewCreate = performance.now() - viewCreateStart
    this.attachedPlugin = plugin ?? null

    // Attach to window
    this.touchWindow.window.contentView.addChildView(this.uiView)

    // Set bounds (below header area)
    const bounds = this.touchWindow.window.getBounds()
    const headerHeight = 60
    this.uiView.setBounds({
      x: 0,
      y: headerHeight,
      width: bounds.width,
      height: bounds.height - headerHeight
    })

    // Handle dom-ready
    this.uiView.webContents.once('dom-ready', () => {
      if (plugin) {
        if (!app.isPackaged || plugin.dev.enable) {
          this.uiView?.webContents.openDevTools({ mode: 'detach' })
        }
        if (injections?.styles) {
          this.uiView?.webContents.insertCSS(injections.styles)
        }
        if (pluginModule.pluginManager) {
          pluginModule.pluginManager.setActivePlugin(plugin.name)
        }
      }
    })

    const loadUrlStart = performance.now()
    await this.uiView.webContents.loadURL(url)
    metrics.loadUrl = performance.now() - loadUrlStart
    metrics.total = performance.now() - startTime

    await this.setState(DivisionBoxState.ACTIVE)

    // Log metrics for performance tracking
    divisionBoxSessionLog.debug(
      `UI view attached: ${this.sessionId} | preload=${metrics.preload.toFixed(1)}ms viewCreate=${metrics.viewCreate.toFixed(1)}ms loadUrl=${metrics.loadUrl.toFixed(1)}ms total=${metrics.total.toFixed(1)}ms`
    )
  }

  /**
   * Generate plugin channel script for preload injection
   */
  private generateChannelScript(uniqueKey: string): string {
    return getPluginChannelPreludeCode({ uniqueKey, initialData: {} })
  }

  /**
   * Attaches an existing WebContentsView (transferred from CoreBox)
   * @param view - The existing WebContentsView to attach
   * @param plugin - The plugin reference
   */
  async attachExistingUIView(view: WebContentsView, plugin: TouchPlugin): Promise<void> {
    if (!this.touchWindow) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.STATE_ERROR,
        'Window must be created before attaching UI view',
        this.sessionId
      )
    }

    if (this.uiView) {
      divisionBoxSessionLog.warn('UI view already attached, detaching first')
      this.detachUIView()
    }

    this.uiView = view
    this.attachedPlugin = plugin

    // Attach to DivisionBox window
    this.touchWindow.window.contentView.addChildView(view)

    // Update bounds for the new window
    this.updateUIViewBounds()

    // Set active plugin
    if (pluginModule.pluginManager) {
      pluginModule.pluginManager.setActivePlugin(plugin.name)
    }

    getRegisteredMainRuntime('division-box').transport.broadcastToWindow(
      this.touchWindow.window.id,
      CoreBoxEvents.ui.trigger,
      {
        type: 'division-box',
        sessionId: this.sessionId,
        config: this.config,
        meta: this.meta
      }
    )

    await this.setState(DivisionBoxState.ACTIVE)

    divisionBoxSessionLog.debug(`Existing UI view attached: ${this.sessionId}`)
  }

  /**
   * Detaches the UI view from the window
   */
  detachUIView(): void {
    if (this.uiView) {
      try {
        this.touchWindow?.window.contentView.removeChildView(this.uiView)
        this.uiView.webContents.close()
      } catch (error) {
        divisionBoxSessionLog.error('Error detaching UI view', { error })
      }
      this.uiView = null
      this.attachedPlugin = null
    }
  }

  /**
   * Destroys the window and cleans up resources
   */
  destroyWindow(): void {
    this.detachUIView()

    if (this.touchWindow) {
      try {
        this.touchWindow.window.destroy()
      } catch (error) {
        divisionBoxSessionLog.error('Error destroying DivisionBox window', { error })
      }
      this.touchWindow = null
    }
  }

  /**
   * Gets the TouchWindow instance
   */
  getWindow(): TouchWindow | null {
    return this.touchWindow
  }

  /**
   * Gets the UI WebContentsView
   */
  getUIView(): WebContentsView | null {
    return this.uiView
  }

  /**
   * Gets the attached plugin reference
   */
  getAttachedPlugin(): TouchPlugin | null {
    return this.attachedPlugin
  }

  // ==================== Window Control Methods ====================

  /**
   * Toggles always-on-top state for this window
   */
  toggleAlwaysOnTop(): boolean {
    if (!this.touchWindow) return false

    const current = this.touchWindow.window.isAlwaysOnTop()
    this.touchWindow.window.setAlwaysOnTop(!current)

    divisionBoxSessionLog.debug(`Always on top: ${!current}`)
    return !current
  }

  /**
   * Gets always-on-top state
   */
  isAlwaysOnTop(): boolean {
    return this.touchWindow?.window.isAlwaysOnTop() ?? false
  }

  /**
   * Sets window opacity (0.0 - 1.0)
   */
  setOpacity(opacity: number): void {
    if (!this.touchWindow) return

    const clampedOpacity = Math.max(0.1, Math.min(1.0, opacity))
    this.touchWindow.window.setOpacity(clampedOpacity)
  }

  /**
   * Gets window opacity
   */
  getOpacity(): number {
    return this.touchWindow?.window.getOpacity() ?? 1.0
  }

  /**
   * Opens DevTools for the UI view
   */
  openDevTools(): void {
    const webContents = useAliveWebContents(this.uiView)
    if (!webContents) return
    webContents.openDevTools({ mode: 'detach' })
  }

  /**
   * Closes DevTools for the UI view
   */
  closeDevTools(): void {
    const webContents = useAliveWebContents(this.uiView)
    if (!webContents) return
    webContents.closeDevTools()
  }

  /**
   * Checks if DevTools is open
   */
  isDevToolsOpen(): boolean {
    return useAliveWebContents(this.uiView)?.isDevToolsOpened() ?? false
  }

  /**
   * Sets a value in the session state
   *
   * @param key - State key
   * @param value - State value
   */
  setSessionState(key: string, value: unknown): void {
    this.sessionState.set(key, value)
  }

  /**
   * Gets a value from the session state
   *
   * @param key - State key
   * @returns State value or undefined
   */
  getSessionState<T = unknown>(key: string): T | undefined {
    return this.sessionState.get(key) as T | undefined
  }

  /**
   * Clears all session state data
   */
  clearSessionState(): void {
    this.sessionState.clear()
  }

  /**
   * Starts the keepAlive timer
   *
   * Used in INACTIVE state to maintain the view for quick recovery.
   */
  startKeepAliveTimer(): void {
    // Clear existing timer if any
    this.stopKeepAliveTimer()

    // Note: The actual timer logic would depend on LRU cache management
    // For now, we just mark that keepAlive is active
    // The timer would be managed by the DivisionBoxManager
  }

  /**
   * Stops the keepAlive timer
   */
  stopKeepAliveTimer(): void {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  /**
   * Destroys the session and cleans up all resources
   */
  async destroy(): Promise<void> {
    this.stopKeepAliveTimer()
    this.destroyWindow()
    this.clearSessionState()
    this.stateChangeListeners.clear()

    const oldState = this.state
    this.state = DivisionBoxState.DESTROY

    const event: StateChangeEvent = {
      sessionId: this.sessionId,
      oldState,
      newState: DivisionBoxState.DESTROY,
      timestamp: Date.now()
    }

    this.notifyStateChange(event)
  }
}
