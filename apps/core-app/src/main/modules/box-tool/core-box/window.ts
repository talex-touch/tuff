import type { AppSetting, TuffQuery } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { CoreBoxInputChangeRequest } from '@talex-touch/utils/transport/events/types'
import type { WebContentsView } from 'electron'
import type { TouchApp } from '../../../core/touch-app'
import type { TouchPlugin } from '../../plugin/plugin'
import type { CoreBoxKeyEvent } from './key-event'
import path from 'node:path'
import process from 'node:process'
import { sleep, StorageList } from '@talex-touch/utils'
import { useWindowAnimation } from '@talex-touch/utils/animation/window-node'
import {
  CoreBoxEvents,
  CoreBoxRetainedEvents,
} from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { app, screen } from 'electron'
import { BoxWindowOption } from '../../../config/default'
import {
  CoreBoxWindowHiddenEvent,
  CoreBoxWindowShownEvent,
  TalexEvents,
  touchEventBus,
} from '../../../core/eventbus/touch-event'
import { getRegisteredMainRuntime } from '../../../core/runtime-accessor'
import { TouchWindow } from '../../../core/touch-window'
import { TalexTouch } from '../../../types'
import { createLogger } from '../../../utils/logger'

import { getMainConfig, subscribeMainConfig } from '../../storage'
import { WindowBoundsController } from './bounds-controller'
import { CoreBoxFocusPolicy } from './focus-policy'
import {
  isBlockedCoreBoxFunctionKey,
} from './key-event'
import { coreBoxManager } from './manager'
import { metaOverlayManager } from './meta-overlay'
import { PluginViewController } from './plugin-view-controller'
import { CoreBoxThemeController } from './theme-controller'

export type { ThemeStyleConfig } from './theme-controller'

const coreBoxWindowLog = createLogger('CoreBox').child('Window')
export const COREBOX_WIDTH = 720
export const COREBOX_HEADER_HEIGHT = 56
export const COREBOX_MIN_HEIGHT = COREBOX_HEADER_HEIGHT
const COREBOX_HEIGHT_TARGET_TOLERANCE = 4
const COREBOX_ANIMATION_RETARGET_TOLERANCE = 12
const COREBOX_BLUR_HIDE_CONFIRM_MS = 120
const COREBOX_SHORTCUT_FOCUS_GRACE_MS = 1500
const COREBOX_DEFAULT_FOCUS_GRACE_MS = 500

const windowAnimation = useWindowAnimation()

/**
 * @class WindowManager
 * @description
 * 负责所有与 BrowserWindow 相关的操作。
 */
export class WindowManager {
  private static instance: WindowManager
  public windows: TouchWindow[] = []
  private _touchApp: TouchApp | null = null
  private readonly themeController = new CoreBoxThemeController()
  private readonly pluginViewController = new PluginViewController({
    headerHeight: COREBOX_HEADER_HEIGHT,
    getCurrentWindow: () => this.current,
    getTransport: () => this.getTransport(),
    getAppSettingConfig: () => this.getAppSettingConfig(),
    applyThemeToView: view => this.themeController.applyToView(view),
    stopFollowingSystemTheme: () => this.themeController.stopFollowingSystem(),
    isCurrentThemeDark: () => this.themeController.isDark,
    isAppDev: () => this.touchApp.version === TalexTouch.AppVersion.DEV,
  })

  private readonly boundsController = new WindowBoundsController({
    defaultWidth: COREBOX_WIDTH,
    minHeight: COREBOX_MIN_HEIGHT,
    animationRetargetTolerance: COREBOX_ANIMATION_RETARGET_TOLERANCE,
    syncOverlayBounds: () => metaOverlayManager.updateBounds(),
  })

  private readonly focusPolicy = new CoreBoxFocusPolicy()
  private appSettingUnsubscribe: (() => void) | null = null

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = getRegisteredMainRuntime<TalexEvents>('core-box').app
    }
    return this._touchApp
  }

  private getTransport(): ReturnType<typeof getTuffTransportMain> {
    const channel = this.touchApp.channel
    const keyManager
      = (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    return getTuffTransportMain(channel, keyManager)
  }

  private scheduleBlurHide(window: TouchWindow): void {
    this.focusPolicy.scheduleBlurHide(async () => {
      if (this.isPinned())
        return
      if (this.focusPolicy.isBlurHideSuppressed())
        return
      if (this.current !== window || window.window.isDestroyed() || !window.window.isVisible()) {
        return
      }
      if (window.window.isFocused())
        return

      if (coreBoxManager.isUIMode) {
        await sleep(17)
        if (
          this.pluginViewController.isUIViewFocused()
          || this.focusPolicy.isBlurHideSuppressed()
          || window.window.isDestroyed()
          || window.window.isFocused()
        ) {
          return
        }
      }

      coreBoxManager.trigger(false)
    }, COREBOX_BLUR_HIDE_CONFIRM_MS)
  }

  public static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager()
    }
    return WindowManager.instance
  }

  public get current(): TouchWindow | undefined {
    return this.windows[this.windows.length - 1]
  }

  public getAttachedPlugin(): TouchPlugin | null {
    return this.pluginViewController.getAttachedPlugin()
  }

  /**
   * Enable input monitoring for attached UI view
   */
  public enableInputMonitoring(): void {
    this.pluginViewController.enableInputMonitoring()
  }

  /**
   * Enable clipboard monitoring for specified types
   */
  public enableClipboardMonitoring(types: number): void {
    this.pluginViewController.enableClipboardMonitoring(types)
  }

  /**
   * Check if clipboard change should be forwarded to plugin based on allowed types
   * @param itemType - The type of clipboard item ('text' | 'image' | 'files')
   * @returns true if the plugin should receive this clipboard change
   */
  public shouldForwardClipboardChange(itemType: 'text' | 'image' | 'files'): boolean {
    return this.pluginViewController.shouldForwardClipboardChange(itemType)
  }

  /**
   * Get current clipboard allowed types
   */
  public getClipboardAllowedTypes(): number {
    return this.pluginViewController.getClipboardAllowedTypes()
  }

  /**
   * Send input change to UI view if allowed
   */
  public forwardInputChange(payload: CoreBoxInputChangeRequest): void {
    this.pluginViewController.forwardInputChange(payload)
  }

  /**
   * 创建并初始化一个新的 CoreBox 窗口。
   */
  public async create(): Promise<TouchWindow> {
    const window = new TouchWindow({ ...BoxWindowOption })

    this.ensureAppSettingSubscription()
    const pinned = this.resolvePinnedFromSettings()
    this.focusPolicy.setPinned(pinned)
    this.applyPinnedStateToWindow(window, pinned)

    windowAnimation.changeWindow(window)

    setTimeout(async () => {
      coreBoxWindowLog.debug('NewBox created, injecting development tools')

      try {
        if (app.isPackaged || this.touchApp.version === TalexTouch.AppVersion.RELEASE) {
          const url = path.join(__dirname, '..', 'renderer', 'index.html')

          await window.loadFile(url, {
            devtools: this.touchApp.version === TalexTouch.AppVersion.DEV,
          })
        }
        else {
          const url = process.env.ELECTRON_RENDERER_URL as string

          await window.loadURL(url)

          window.openDevTools({
            mode: 'detach',
          })
        }

        if (!coreBoxManager.showCoreBox) {
          window.window.hide()
        }
      }
      catch (error) {
        coreBoxWindowLog.error('Failed to load content in new box window', { error })
      }
    }, 200)

    window.window.webContents.on('dom-ready', () => {
      this.getTransport().broadcastToWindow(window.window.id, CoreBoxEvents.ui.trigger, {
        id: window.window.webContents.id,
        show: window.window.isVisible(),
      })
    })

    let wasVisibleBeforeReload = false

    window.window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown')
        return

      if (isBlockedCoreBoxFunctionKey(input.key)) {
        event.preventDefault()
        return
      }

      if (input.key === 'r' && (input.control || input.meta)) {
        if (app.isPackaged) {
          event.preventDefault()
          return
        }
        wasVisibleBeforeReload = window.window.isVisible()
        this.pluginViewController.reloadView()
      }
    })

    window.window.webContents.on('did-finish-load', () => {
      if (wasVisibleBeforeReload) {
        this.getTransport().broadcastToWindow(window.window.id, CoreBoxEvents.ui.trigger, {
          id: window.window.webContents.id,
          show: true,
        })
        wasVisibleBeforeReload = false
      }
    })

    window.window.addListener('closed', () => {
      this.windows = this.windows.filter(w => w !== window)
      metaOverlayManager.destroy()
      coreBoxWindowLog.debug('BoxWindow closed')
    })

    window.window.on('show', () => {
      coreBoxManager.syncVisibility(true)
    })

    window.window.on('hide', () => {
      this.focusPolicy.clearPendingBlurHide()
      coreBoxManager.syncVisibility(false)
    })

    window.window.on('focus', () => {
      this.focusPolicy.clearPendingBlurHide()
    })

    window.window.on('blur', async () => {
      if (this.isPinned()) {
        return
      }

      if (this.focusPolicy.isBlurHideSuppressed()) {
        return
      }

      const isUIMode = coreBoxManager.isUIMode

      if (!isUIMode) {
        this.scheduleBlurHide(window)
        return
      }

      await sleep(17)

      if (!this.pluginViewController.isUIViewFocused() && !this.focusPolicy.isBlurHideSuppressed()) {
        this.scheduleBlurHide(window)
      }
    })

    window.window.on('resize', () => {
      if (!this.pluginViewController.hasView() || this.current !== window || window.window.isDestroyed()) {
        return
      }

      try {
        this.pluginViewController.resizeToWindow(window.window)
      }
      catch (error) {
        coreBoxWindowLog.warn('Failed to update UI view bounds on resize', { error })
      }

      metaOverlayManager.updateBounds()
    })

    // Initialize MetaOverlay (persistent mode)
    metaOverlayManager.init(window.window)

    coreBoxWindowLog.debug('NewBox created, WebContents loaded')

    this.windows.push(window)

    return window
  }

  public updatePosition(window: TouchWindow, curScreen?: Electron.Display): void {
    this.boundsController.updatePosition(window.window, curScreen ?? this.getCurScreen())
  }

  /**
   * Show CoreBox window
   * @param triggeredByShortcut - Whether this show was triggered by keyboard shortcut
   */
  public show(triggeredByShortcut: boolean = false): void {
    const window = this.current
    if (!window)
      return

    this.focusPolicy.clearPendingBlurHide()
    this.boundsController.stopAnimation()
    this.updatePosition(window)

    const shouldFocus = triggeredByShortcut || coreBoxManager.isUIMode || this.pluginViewController.hasView()
    this.focusPolicy.beginFocusGrace(
      triggeredByShortcut ? COREBOX_SHORTCUT_FOCUS_GRACE_MS : COREBOX_DEFAULT_FOCUS_GRACE_MS,
    )
    if (triggeredByShortcut) {
      try {
        app.focus({ steal: true })
      }
      catch {
        app.focus()
      }
    }

    if (shouldFocus) {
      window.window.show()
      if (triggeredByShortcut) {
        ;(window.window as { moveTop?: () => void }).moveTop?.()
        window.window.focus()
      }
    }
    else {
      window.window.showInactive()
    }

    this.getTransport().broadcastToWindow(window.window.id, CoreBoxEvents.ui.trigger, {
      id: window.window.webContents.id,
      show: true,
    })
    touchEventBus.emit(TalexEvents.COREBOX_WINDOW_SHOWN, new CoreBoxWindowShownEvent())

    if (triggeredByShortcut) {
      const transport = this.getTransport()
      void transport
        .sendTo(window.window.webContents, CoreBoxEvents.ui.shortcutTriggered, undefined)
        .catch(() => {})
      void transport
        .sendTo(
          window.window.webContents,
          CoreBoxRetainedEvents.legacy.shortcutTriggered,
          undefined,
        )
        .catch(() => {})
    }

    setTimeout(() => {
      if (window.window.isDestroyed())
        return
      window.window.focus()
      if (coreBoxManager.isUIMode) {
        this.pluginViewController.focusView()
      }
    }, 100)
  }

  public hide(options: { immediate?: boolean } = {}): void {
    const window = this.current
    if (!window)
      return
    if (window.window.isDestroyed())
      return

    this.boundsController.stopAnimation()
    this.getTransport().broadcastToWindow(window.window.id, CoreBoxEvents.ui.trigger, {
      id: window.window.webContents.id,
      show: false,
    })
    touchEventBus.emit(TalexEvents.COREBOX_WINDOW_HIDDEN, new CoreBoxWindowHiddenEvent())

    if (options.immediate === true) {
      window.window.hide()
      return
    }

    if (process.platform !== 'darwin') {
      try {
        window.window.setPosition(-1000000, -1000000)
      }
      catch (error) {
        coreBoxWindowLog.warn('Failed to move window offscreen before hide', { error })
      }
    }

    setTimeout(() => {
      if (window.window.isDestroyed())
        return
      window.window.hide()
    }, 100)
  }

  public expand(
    options: { length?: number, forceMax?: boolean, height?: number } = {},
    isUIMode: boolean = false,
  ): void {
    const { length = 0, forceMax = false, height: customHeight } = options
    const effectiveLength = length > 0 ? length : 1

    // Priority: customHeight > isUIMode > forceMax > calculated from length
    let height: number
    if (typeof customHeight === 'number' && customHeight > 0) {
      height = Math.max(COREBOX_MIN_HEIGHT, Math.min(customHeight, 600))
    }
    else if (isUIMode) {
      height = 600
    }
    else if (forceMax) {
      height = 600
    }
    else {
      height = Math.min(effectiveLength * 48 + 65, 600)
    }

    const currentWindow = this.current
    if (currentWindow) {
      const display = currentWindow.window.isVisible()
        ? this.getDisplayForWindow(currentWindow)
        : this.getCurScreen()
      const bounds = this.boundsController.calculateBounds(display, { width: COREBOX_WIDTH, height })
      if (!bounds)
        return

      const settings = this.getAppSettingConfig()
      const animationEnabled = settings.animation?.coreBoxResize === true

      if (currentWindow.window.isVisible() && animationEnabled) {
        this.boundsController.animate(currentWindow.window, bounds, { minHeight: height })
      }
      else {
        this.boundsController.stopAnimation()
        try {
          this.boundsController.setBounds(currentWindow.window, bounds)
          currentWindow.window.setMinimumSize(COREBOX_WIDTH, height)
        }
        catch (error) {
          coreBoxWindowLog.error('Failed to update window bounds', { error })
        }
      }
    }
    else {
      coreBoxWindowLog.error('No current window available for expansion')
    }

    coreBoxWindowLog.debug('Expanded window constraints updated')
  }

  public shrink(): void {
    if (this.pluginViewController.hasView()) {
      coreBoxWindowLog.debug('UI view is attached during shrink, detaching before shrinking')
      this.detachUIView()
    }

    const currentWindow = this.current
    if (currentWindow) {
      const display = currentWindow.window.isVisible()
        ? this.getDisplayForWindow(currentWindow)
        : this.getCurScreen()
      const bounds = this.boundsController.calculateBounds(display, {
        width: COREBOX_WIDTH,
        height: COREBOX_MIN_HEIGHT,
      })
      if (!bounds)
        return

      const currentBounds = this.boundsController.getCurrentBounds(currentWindow.window)
      if (
        Math.abs(currentBounds.x - bounds.x) < 3
        && Math.abs(currentBounds.y - bounds.y) < 3
        && Math.abs(currentBounds.width - bounds.width) < 3
        && Math.abs(currentBounds.height - bounds.height) < 5
      ) {
        return
      }

      const settings = this.getAppSettingConfig()
      const logVerbose
        = settings.searchEngine?.logsEnabled === true || settings.diagnostics?.verboseLogs === true
      const animationEnabled = settings.animation?.coreBoxResize === true

      if (currentWindow.window.isVisible() && animationEnabled) {
        this.boundsController.animate(currentWindow.window, bounds, { minHeight: COREBOX_MIN_HEIGHT })
      }
      else {
        this.boundsController.stopAnimation()
        const restoreResizable = this.boundsController.prepareTemporaryResize(currentWindow.window)
        try {
          currentWindow.window.setMinimumSize(COREBOX_WIDTH, COREBOX_MIN_HEIGHT)
          this.boundsController.setBounds(currentWindow.window, bounds)
          const [, minHeightAfter] = currentWindow.window.getMinimumSize()
          const finalBounds = currentWindow.window.getBounds()
          const shrinkMeta = {
            targetHeight: bounds.height,
            finalHeight: finalBounds.height,
            minHeightAfter,
            visible: currentWindow.window.isVisible(),
          }
          if (logVerbose) {
            coreBoxWindowLog.info('CoreBox shrink applied', { meta: shrinkMeta })
          }
          else {
            coreBoxWindowLog.debug('CoreBox shrink applied', { meta: shrinkMeta })
          }
        }
        catch (error) {
          coreBoxWindowLog.error('Failed to update window bounds', { error })
        }
        finally {
          restoreResizable()
        }
      }
    }
    else {
      coreBoxWindowLog.error('No current window available for shrinking')
    }
    coreBoxWindowLog.debug('Shrunk window to compact mode')
  }

  /**
   * Set CoreBox to a specific height (called from frontend)
   */
  public setHeight(height: number, targetWindow?: TouchWindow): void {
    const safeHeight = Math.round(Math.max(COREBOX_MIN_HEIGHT, Math.min(height, 600)))

    const currentWindow = targetWindow ?? this.current
    if (!currentWindow) {
      coreBoxWindowLog.error('No current window available for setHeight')
      return
    }

    const isVisible = currentWindow.window.isVisible()
    if (!isVisible) {
      coreBoxWindowLog.debug('Skip setting height for hidden CoreBox window')
      return
    }

    // Skip if already at target height (within tolerance)
    const currentHeight = this.boundsController.getCurrentHeight(currentWindow.window)
    if (Math.abs(currentHeight - safeHeight) < COREBOX_HEIGHT_TARGET_TOLERANCE) {
      return
    }

    const display = this.getDisplayForWindow(currentWindow)
    const bounds = this.boundsController.calculateBounds(display, {
      width: COREBOX_WIDTH,
      height: safeHeight,
    })
    if (!bounds)
      return

    const settings = this.getAppSettingConfig()
    const logVerbose
      = settings.searchEngine?.logsEnabled === true || settings.diagnostics?.verboseLogs === true
    const animationEnabled = settings.animation?.coreBoxResize === true

    if (isVisible && animationEnabled) {
      this.boundsController.animate(currentWindow.window, bounds, { minHeight: safeHeight })
    }
    else {
      this.boundsController.stopAnimation()
      const restoreResizable = this.boundsController.prepareTemporaryResize(currentWindow.window)
      try {
        currentWindow.window.setMinimumSize(COREBOX_WIDTH, safeHeight)
        this.boundsController.setBounds(currentWindow.window, bounds)
        const [, minHeightAfter] = currentWindow.window.getMinimumSize()
        const finalBounds = currentWindow.window.getBounds()
        const setHeightMeta = {
          targetHeight: safeHeight,
          finalHeight: finalBounds.height,
          minHeightAfter,
          visible: currentWindow.window.isVisible(),
        }
        if (logVerbose) {
          coreBoxWindowLog.info('CoreBox setHeight applied', { meta: setHeightMeta })
        }
        else {
          coreBoxWindowLog.debug('CoreBox setHeight applied', { meta: setHeightMeta })
        }
      }
      catch (error) {
        coreBoxWindowLog.error('Failed to set window height', { error })
      }
      finally {
        restoreResizable()
      }
    }

    coreBoxWindowLog.debug(`Window height set to ${safeHeight}px`)
  }

  /**
   * Set custom vertical position offset for CoreBox (0-1 = 0%-100% from top)
   */
  public setPositionOffset(topPercent: number): void {
    const safePercent = this.boundsController.setPositionOffset(topPercent)

    const currentWindow = this.current
    if (currentWindow && currentWindow.window.isVisible()) {
      this.updatePosition(currentWindow)
    }

    coreBoxWindowLog.debug(`Position offset set to ${Math.round(safePercent * 100)}% from top`)
  }

  /**
   * Reset position offset to default (35% for collapsed)
   */
  public resetPositionOffset(): void {
    this.boundsController.resetPositionOffset()
    coreBoxWindowLog.debug('Position offset reset to default')
  }

  public getCurScreen(): Electron.Display {
    try {
      const cursorPoint = screen.getCursorScreenPoint()
      const curScreen = screen.getDisplayNearestPoint(cursorPoint)

      if (!curScreen) {
        coreBoxWindowLog.warn('No screen found for cursor point, using primary display')
        return screen.getPrimaryDisplay()
      }

      return curScreen
    }
    catch (error) {
      coreBoxWindowLog.error('Error getting current screen', { error })

      return screen.getPrimaryDisplay()
    }
  }

  private getDisplayForWindow(window: TouchWindow): Electron.Display {
    try {
      if (!window.window.isDestroyed()) {
        return screen.getDisplayMatching(window.window.getBounds())
      }
    }
    catch (error) {
      coreBoxWindowLog.warn('Failed to get display for window, falling back to cursor screen', {
        error,
      })
    }

    return this.getCurScreen()
  }

  public getAppSettingConfig(): AppSetting {
    return getMainConfig(StorageList.APP_SETTING) as AppSetting
  }

  private ensureAppSettingSubscription(): void {
    if (this.appSettingUnsubscribe) {
      return
    }

    this.appSettingUnsubscribe = subscribeMainConfig(StorageList.APP_SETTING, (settings) => {
      this.setPinned(settings.tools?.autoHide === false)
    })
  }

  public stopAppSettingSubscription(): void {
    if (!this.appSettingUnsubscribe) {
      return
    }

    this.appSettingUnsubscribe()
    this.appSettingUnsubscribe = null
  }

  private resolvePinnedFromSettings(): boolean {
    const settings = this.getAppSettingConfig()
    return settings?.tools?.autoHide === false
  }

  /**
   * Pin the CoreBox popup across all macOS Spaces.
   *
   * When pinned: the search window is always-on-top across every Space so
   * the user can invoke CoreBox from anywhere without switching.
   * When unpinned: window follows its parent Space (default macOS behavior).
   */
  private applyPinnedStateToWindow(window: TouchWindow, pinned: boolean): void {
    if (window.window.isDestroyed())
      return

    window.window.setVisibleOnAllWorkspaces(pinned)
    if (pinned) {
      window.window.setAlwaysOnTop(true, 'floating')
      return
    }

    window.window.setAlwaysOnTop(false)
  }

  public setPinned(pinned: boolean): void {
    this.focusPolicy.setPinned(pinned)

    for (const window of this.windows) {
      this.applyPinnedStateToWindow(window, pinned)
    }
  }

  public isPinned(): boolean {
    return this.focusPolicy.isPinned()
  }

  public async attachUIView(
    url: string,
    plugin?: TouchPlugin,
    query?: TuffQuery,
    feature?: IPluginFeature,
  ): Promise<void> {
    await this.pluginViewController.attach(url, plugin, query, feature)
  }

  public detachUIView(): void {
    this.pluginViewController.detach()
  }

  public sendToUIView(channel: string, ...args: unknown[]): void {
    this.pluginViewController.sendToUIView(channel, ...args)
  }

  /**
   * Sends a channel message to the attached plugin UI view.
   *
   * @param eventName - The event name to send
   * @param data - Optional data payload
   */
  public sendChannelMessageToUIView(eventName: string, data?: unknown): void {
    this.pluginViewController.sendChannelMessageToUIView(eventName, data)
  }

  public getUIView(): WebContentsView | undefined {
    return this.pluginViewController.getUIView()
  }

  /**
   * Extracts the UI view from CoreBox without destroying it.
   * Used for transferring the view to a DivisionBox window.
   * @returns The extracted UI view and plugin, or null if no view is attached
   */
  public extractUIView(): { view: WebContentsView, plugin: TouchPlugin } | null {
    return this.pluginViewController.extractUIView()
  }

  /**
   * Restores a previously extracted UI view back into CoreBox.
   * This is used as a rollback path when transferring the view fails.
   */
  public restoreExtractedUIView(view: WebContentsView, plugin: TouchPlugin): boolean {
    return this.pluginViewController.restoreExtractedUIView(view, plugin)
  }

  /**
   * Check if UI view is currently active and focused
   */
  public isUIViewActive(): boolean {
    return this.pluginViewController.isUIViewActive()
  }

  /**
   * Check if UI view has focus (vs main CoreBox input)
   */
  public isUIViewFocused(): boolean {
    return this.pluginViewController.isUIViewFocused()
  }

  /**
   * Forwards a keyboard event to the attached plugin UI view by simulating native input.
   *
   * This method uses Electron's `sendInputEvent` API to simulate real keyboard input,
   * allowing the plugin page to receive standard DOM keyboard events without any adaptation.
   *
   * @param event - The serialized keyboard event data to forward
   * @param event.key - The key value (e.g., 'ArrowUp', 'Enter', 'a')
   * @param event.code - The physical key code (e.g., 'ArrowUp', 'Enter', 'KeyA')
   * @param event.metaKey - Whether the Meta (Cmd on macOS) key is pressed
   * @param event.ctrlKey - Whether the Ctrl key is pressed
   * @param event.altKey - Whether the Alt key is pressed
   * @param event.shiftKey - Whether the Shift key is pressed
   * @param event.repeat - Whether this is a repeat event from holding the key
   */
  public forwardKeyEvent(event: CoreBoxKeyEvent): void {
    this.pluginViewController.forwardKeyEvent(event)
  }

  /**
   * Opens DevTools for the plugin's WebContentsView if the specified plugin is currently attached.
   * Allowed for dev plugins, or any plugin when the app runs in DEV mode.
   * @param pluginName - Name of the plugin to open DevTools for
   * @returns true if DevTools was opened, false otherwise
   */
  public openPluginDevTools(pluginName: string): boolean {
    return this.pluginViewController.openPluginDevTools(pluginName)
  }
}

export const windowManager = WindowManager.getInstance()

export function getCoreBoxWindow(): TouchWindow | undefined {
  return windowManager.current || void 0
}
