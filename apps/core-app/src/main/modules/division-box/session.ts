/**
 * DivisionBoxSession - Main Process
 * 
 * Manages a single DivisionBox instance lifecycle, state, and resources.
 * Uses TouchWindow + WebContentsView (attached) pattern, similar to CoreBox.
 * Implements a six-state lifecycle: prepare → attach → active → inactive → detach → destroy
 */

import { app, WebContentsView } from 'electron'
import type { WebPreferences } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fse from 'fs-extra'
import {
  DivisionBoxState,
  DivisionBoxError,
  DivisionBoxErrorCode,
  type DivisionBoxConfig,
  type SessionMeta,
  type StateChangeEvent
} from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { TouchWindow } from '../../core/touch-window'
import { genTouchApp } from '../../core'
import type { TouchPlugin } from '../plugin/plugin'
import { pluginModule } from '../plugin/plugin-module'

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
  [DivisionBoxState.ACTIVE]: [DivisionBoxState.INACTIVE, DivisionBoxState.DETACH, DivisionBoxState.DESTROY],
  [DivisionBoxState.INACTIVE]: [DivisionBoxState.ACTIVE, DivisionBoxState.DETACH, DivisionBoxState.DESTROY],
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
  private sessionState: Map<string, any> = new Map()

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
    this.stateChangeListeners.forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('[DivisionBoxSession] Error in state change listener:', error)
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
    console.log(`[DivisionBoxSession] createWindow called: ${this.sessionId}`)
    
    if (this.touchWindow) {
      throw new DivisionBoxError(
        DivisionBoxErrorCode.STATE_ERROR,
        'Window already exists',
        this.sessionId
      )
    }

    try {
      console.log(`[DivisionBoxSession] Acquiring window from pool...`)
      // Acquire window from pool (pre-warmed)
      const { windowPool } = await import('./window-pool')
      console.log(`[DivisionBoxSession] windowPool imported, calling acquire...`)
      this.touchWindow = await windowPool.acquire()
      console.log(`[DivisionBoxSession] Window acquired successfully`)
      
      // Update window title
      this.touchWindow.window.setTitle(`${this.config.title} - Tuff Division`)

      // Notify renderer about DivisionBox trigger via unified channel
      genTouchApp().channel.sendTo(
        this.touchWindow.window,
        ChannelType.MAIN,
        'core-box:trigger',
        {
          type: 'division-box',
          sessionId: this.sessionId,
          config: this.config,
          meta: this.meta
        }
      )

      // Handle window close
      this.touchWindow.window.on('closed', () => {
        console.log(`[DivisionBoxSession] Window closed: ${this.sessionId}`)
        if (this.touchWindow) {
          windowPool.release(this.touchWindow.window)
        }
        this.touchWindow = null
        this.destroy().catch(err => {
          console.error('[DivisionBoxSession] Error in destroy after close:', err)
        })
      })

      // Handle window resize - update UI view bounds
      this.touchWindow.window.on('resize', () => {
        this.updateUIViewBounds()
      })

      // Show window
      this.touchWindow.window.show()

      await this.setState(DivisionBoxState.ATTACH)
      console.log(`[DivisionBoxSession] Window acquired from pool: ${this.sessionId}`)
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
      console.warn('[DivisionBoxSession] UI view already attached, detaching first')
      this.detachUIView()
    }

    const injections = plugin?.__getInjections__()
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
        console.error('[DivisionBoxSession] Failed to create preload:', error)
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
    console.log(`[DivisionBoxSession] UI view attached: ${this.sessionId} | preload=${metrics.preload.toFixed(1)}ms viewCreate=${metrics.viewCreate.toFixed(1)}ms loadUrl=${metrics.loadUrl.toFixed(1)}ms total=${metrics.total.toFixed(1)}ms`)
  }

  /**
   * Generate plugin channel script for preload injection
   */
  private generateChannelScript(uniqueKey: string): string {
    return `
(function() {
  const uniqueKey = "${uniqueKey}";
  window['$tuffInitialData'] = window['$tuffInitialData'] || {};
  const { ipcRenderer } = require('electron');
  const ChannelType = ${JSON.stringify(ChannelType)};
  const DataCode = ${JSON.stringify(DataCode)};
  const CHANNEL_DEFAULT_TIMEOUT = 60000;

  class TouchChannel {
    channelMap = new Map();
    pendingMap = new Map();
    earlyMessageQueue = new Map();

    constructor() {
      ipcRenderer.on('@plugin-process-message', this.__handle_main.bind(this));
    }

    __parse_raw_data(e, arg) {
      if (!arg?.header) return null;
      const { uniqueKey: thisKey } = arg.header;
      if (thisKey && thisKey !== uniqueKey) return null;
      return {
        header: { status: arg.header.status || 'request', type: ChannelType.MAIN, _originData: arg },
        sync: arg.sync, code: arg.code, data: arg.data, plugin: arg.plugin, name: arg.name
      };
    }

    __handle_main(e, arg) {
      const rawData = this.__parse_raw_data(e, arg);
      if (!rawData?.header) return;
      if (rawData.header.status === 'reply' && rawData.sync) {
        return this.pendingMap.get(rawData.sync.id)?.(rawData);
      }
      const listeners = this.channelMap.get(rawData.name);
      if (listeners?.length > 0) {
        this.__dispatch(e, rawData, listeners);
      } else {
        const queue = this.earlyMessageQueue.get(rawData.name) || [];
        queue.push({ e, rawData });
        this.earlyMessageQueue.set(rawData.name, queue);
      }
    }

    __dispatch(e, rawData, listeners) {
      listeners.forEach(func => {
        func({ reply: (code, data) => e.sender.send('@plugin-process-message', {
          code, data, sync: rawData.sync ? { ...rawData.sync, timeStamp: Date.now() } : undefined,
          name: rawData.name, header: { status: 'reply', type: rawData.header.type }
        }), ...rawData });
      });
    }

    regChannel(eventName, callback) {
      const listeners = this.channelMap.get(eventName) || [];
      if (!listeners.includes(callback)) listeners.push(callback);
      this.channelMap.set(eventName, listeners);
      const early = this.earlyMessageQueue.get(eventName);
      if (early?.length) {
        this.earlyMessageQueue.delete(eventName);
        early.forEach(({ e, rawData }) => this.__dispatch(e, rawData, [callback]));
      }
      return () => { const idx = listeners.indexOf(callback); if (idx !== -1) listeners.splice(idx, 1); };
    }

    send(eventName, arg) {
      const uniqueId = Date.now() + '#' + eventName + '@' + Math.random().toString(12);
      const data = { code: DataCode.SUCCESS, data: arg, sync: { timeStamp: Date.now(), timeout: CHANNEL_DEFAULT_TIMEOUT, id: uniqueId },
        name: eventName, header: { uniqueKey, status: 'request', type: ChannelType.PLUGIN }
      };
      return new Promise((resolve, reject) => {
        ipcRenderer.send('@plugin-process-message', data);
        const timeout = setTimeout(() => { this.pendingMap.delete(uniqueId); reject(new Error('Timeout')); }, CHANNEL_DEFAULT_TIMEOUT);
        this.pendingMap.set(uniqueId, res => { clearTimeout(timeout); this.pendingMap.delete(uniqueId); resolve(res.data); });
      });
    }
  }

  window['$channel'] = new TouchChannel();
})();
`
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
      console.warn('[DivisionBoxSession] UI view already attached, detaching first')
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

    // Send trigger to notify renderer about DivisionBox mode
    // This populates windowState.divisionBox in the renderer
    genTouchApp().channel.sendTo(
      this.touchWindow.window,
      ChannelType.MAIN,
      'core-box:trigger',
      {
        type: 'division-box',
        sessionId: this.sessionId,
        config: this.config,
        meta: this.meta
      }
    )

    await this.setState(DivisionBoxState.ACTIVE)

    console.log(`[DivisionBoxSession] Existing UI view attached: ${this.sessionId}`)
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
        console.error('[DivisionBoxSession] Error detaching UI view:', error)
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
        console.error('[DivisionBoxSession] Error destroying window:', error)
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
    
    console.log(`[DivisionBoxSession] Always on top: ${!current}`)
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
    if (this.uiView && !this.uiView.webContents.isDestroyed()) {
      this.uiView.webContents.openDevTools({ mode: 'detach' })
    }
  }

  /**
   * Closes DevTools for the UI view
   */
  closeDevTools(): void {
    if (this.uiView && !this.uiView.webContents.isDestroyed()) {
      this.uiView.webContents.closeDevTools()
    }
  }

  /**
   * Checks if DevTools is open
   */
  isDevToolsOpen(): boolean {
    return this.uiView?.webContents.isDevToolsOpened() ?? false
  }


  /**
   * @deprecated Use getUIView() instead
   */
  getWebContentsView(): WebContentsView | null {
    return this.uiView
  }

  /**
   * Sets a value in the session state
   * 
   * @param key - State key
   * @param value - State value
   */
  setSessionState(key: string, value: any): void {
    this.sessionState.set(key, value)
  }

  /**
   * Gets a value from the session state
   * 
   * @param key - State key
   * @returns State value or undefined
   */
  getSessionState(key: string): any {
    return this.sessionState.get(key)
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
