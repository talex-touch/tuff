import type { AppSetting, TuffQuery } from '@talex-touch/utils'
import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { TouchApp } from '../../../core/touch-app'
import type { TouchPlugin } from '../../plugin/plugin'
import type { CoreBoxInputChange } from './input-transport'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { sleep, StorageList } from '@talex-touch/utils'
import { useWindowAnimation } from '@talex-touch/utils/animation/window-node'
import { DataCode } from '@talex-touch/utils/channel'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents, PluginEvents } from '@talex-touch/utils/transport/events'
import chalk from 'chalk'
import { app, nativeTheme, screen, WebContentsView } from 'electron'
import fse from 'fs-extra'
import { BoxWindowOption } from '../../../config/default'
import { genTouchApp } from '../../../core'
import { TouchWindow } from '../../../core/touch-window'
import { TalexTouch } from '../../../types'
import { createLogger } from '../../../utils/logger'
import { pluginModule } from '../../plugin/plugin-module'
import { getMainConfig } from '../../storage'
import { getBoxItemManager } from '../item-sdk'
import { coreBoxManager } from './manager'
import { metaOverlayManager } from './meta-overlay'
import defaultCoreBoxThemeCss from './theme/tuff-element.css?raw'
import { viewCacheManager } from './view-cache'

interface CoreBoxUiResumePayload {
  source: string
  featureId?: string | number
  url: string
}

const coreBoxUiResumeEvent = defineRawEvent<CoreBoxUiResumePayload, void>('core-box:ui-resume')
const coreBoxTriggerEvent = defineRawEvent<
  { id?: number; show?: boolean; [key: string]: unknown },
  void
>('core-box:trigger')

const coreBoxWindowLog = createLogger('CoreBox').child('Window')
const COREBOX_MIN_HEIGHT = 64

const windowAnimation = useWindowAnimation()

const CORE_BOX_THEME_FILE_NAME = 'tuff-element.css'
const CORE_BOX_THEME_SUBDIR = ['core-box', 'theme'] as const

export interface ThemeStyleConfig {
  theme?: {
    style?: {
      dark?: boolean
      auto?: boolean
    }
    palette?: {
      primary?: string
    }
    colors?: {
      primary?: string
    }
    primaryColor?: string
  }
  palette?: {
    primary?: string
  }
  colors?: {
    primary?: string
  }
  primaryColor?: string
}

/**
 * @class WindowManager
 * @description
 * 负责所有与 BrowserWindow 相关的操作。
 */
export class WindowManager {
  private static instance: WindowManager
  public windows: TouchWindow[] = []
  private _touchApp: TouchApp | null = null
  private uiView: WebContentsView | null = null
  private uiViewFocused = false
  private uiViewThemeCssKey = new WeakMap<WebContentsView, string>()
  private attachedPlugin: TouchPlugin | null = null
  private attachedFeature: IPluginFeature | null = null
  private nativeThemeHandler: (() => void) | null = null
  private currentThemeIsDark = false
  private bundledThemeCss: string | null = null
  private inputAllowed = false
  private clipboardAllowedTypes = 0
  private boundsAnimationTaskId: string | null = null
  private boundsAnimationToken = 0
  private currentAnimationTarget: Electron.Rectangle | null = null
  // Track last set bounds to avoid getBounds() latency issues
  private lastSetBounds: { height: number; y: number } | null = null
  private customTopPercent: number | null = null // Custom position offset (0-1)
  private readonly pollingService = PollingService.getInstance()

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
  }

  private getTransport(): ReturnType<typeof getTuffTransportMain> {
    const channel = this.touchApp.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    return getTuffTransportMain(channel, keyManager)
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
    return this.attachedPlugin
  }

  /**
   * Enable input monitoring for attached UI view
   */
  public enableInputMonitoring(): void {
    this.inputAllowed = true
    coreBoxWindowLog.debug('Input monitoring enabled for UI view')
  }

  /**
   * Enable clipboard monitoring for specified types
   */
  public enableClipboardMonitoring(types: number): void {
    if (this.clipboardAllowedTypes === types) {
      coreBoxWindowLog.debug('Clipboard monitoring already configured, skipping update')
      return
    }

    this.clipboardAllowedTypes = types
    coreBoxWindowLog.debug(`Clipboard monitoring enabled for types: ${types.toString(2)}`)
  }

  /**
   * Check if clipboard change should be forwarded to plugin based on allowed types
   * @param itemType - The type of clipboard item ('text' | 'image' | 'files')
   * @returns true if the plugin should receive this clipboard change
   */
  public shouldForwardClipboardChange(itemType: 'text' | 'image' | 'files'): boolean {
    if (!this.attachedPlugin || this.clipboardAllowedTypes === 0) {
      return false
    }

    // ClipboardType enum values: TEXT = 0b0001, IMAGE = 0b0010, FILE = 0b0100
    const typeMap: Record<string, number> = {
      text: 0b0001,
      image: 0b0010,
      files: 0b0100
    }

    const typeBit = typeMap[itemType] ?? 0
    return (this.clipboardAllowedTypes & typeBit) !== 0
  }

  /**
   * Get current clipboard allowed types
   */
  public getClipboardAllowedTypes(): number {
    return this.clipboardAllowedTypes
  }

  /**
   * Send input change to UI view if allowed
   */
  public forwardInputChange(payload: CoreBoxInputChange & { query: TuffQuery }): void {
    if (!this.inputAllowed || !this.attachedPlugin) return

    this.sendChannelMessageToUIView('core-box:input-change', {
      input: payload.input ?? payload.query.text,
      query: payload.query,
      source: payload.source ?? 'ui-monitor'
    })
  }

  /**
   * 创建并初始化一个新的 CoreBox 窗口。
   */
  public async create(): Promise<TouchWindow> {
    const window = new TouchWindow({ ...BoxWindowOption })

    window.window.setVisibleOnAllWorkspaces(true)
    window.window.setAlwaysOnTop(true, 'floating')

    windowAnimation.changeWindow(window)

    setTimeout(async () => {
      coreBoxWindowLog.debug('NewBox created, injecting development tools')

      try {
        if (app.isPackaged || this.touchApp.version === TalexTouch.AppVersion.RELEASE) {
          const url = path.join(__dirname, '..', 'renderer', 'index.html')

          await window.loadFile(url, {
            devtools: this.touchApp.version === TalexTouch.AppVersion.DEV
          })
        } else {
          const url = process.env.ELECTRON_RENDERER_URL as string

          await window.loadURL(url)

          window.openDevTools({
            mode: 'detach'
          })
        }

        window.window.hide()
      } catch (error) {
        coreBoxWindowLog.error('Failed to load content in new box window', { error })
      }
    }, 200)

    window.window.webContents.on('dom-ready', () => {
      const transport = this.getTransport()
      void transport.sendTo(window.window.webContents, coreBoxTriggerEvent, {
        id: window.window.webContents.id,
        show: window.window.isVisible()
      })
    })

    let wasVisibleBeforeReload = false

    window.window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'r' && (input.control || input.meta)) {
        if (app.isPackaged) {
          event.preventDefault()
          return
        }
        wasVisibleBeforeReload = window.window.isVisible()
        if (this.uiView && !this.uiView.webContents.isDestroyed()) {
          this.uiView.webContents.reload()
        }
      }
    })

    window.window.webContents.on('did-finish-load', () => {
      if (wasVisibleBeforeReload) {
        const transport = this.getTransport()
        void transport.sendTo(window.window.webContents, coreBoxTriggerEvent, {
          id: window.window.webContents.id,
          show: true
        })
        wasVisibleBeforeReload = false
      }
    })

    window.window.addListener('closed', () => {
      this.windows = this.windows.filter((w) => w !== window)
      coreBoxWindowLog.debug('BoxWindow closed')
    })

    window.window.on('blur', async () => {
      const settings = this.getAppSettingConfig()

      if (!settings.tools.autoHide) {
        return
      }

      const isUIMode = coreBoxManager.isUIMode

      if (!isUIMode) {
        coreBoxManager.trigger(false)
        return
      }

      await sleep(17)

      if (!this.uiViewFocused) {
        coreBoxManager.trigger(false)
      }
    })

    window.window.on('resize', () => {
      if (!this.uiView || this.current !== window || window.window.isDestroyed()) {
        return
      }

      try {
        const bounds = window.window.getBounds()
        this.uiView.setBounds({
          x: 0,
          y: 60,
          width: bounds.width,
          height: Math.max(0, bounds.height - 60)
        })
      } catch (error) {
        coreBoxWindowLog.warn('Failed to update UI view bounds on resize', { error })
      }

      // Update MetaOverlay bounds
      metaOverlayManager.updateBounds()
    })

    // Initialize MetaOverlay (persistent mode)
    metaOverlayManager.init(window.window)

    coreBoxWindowLog.debug('NewBox created, WebContents loaded')

    this.windows.push(window)

    return window
  }

  /**
   * Stop current bounds animation
   */
  private stopBoundsAnimation(): void {
    if (this.boundsAnimationTaskId) {
      this.pollingService.unregister(this.boundsAnimationTaskId)
      this.boundsAnimationTaskId = null
    }
    this.currentAnimationTarget = null
    this.boundsAnimationToken += 1
  }

  /**
   * Animate window bounds. New target cancels old animation and starts from current position.
   */
  private animateWindowBounds(
    window: TouchWindow,
    target: Electron.Rectangle,
    options: { minHeight?: number } = {}
  ): void {
    if (window.window.isDestroyed()) return

    const browserWindow = window.window
    const rawBounds = browserWindow.getBounds()

    // Skip if same target as current animation (prevent duplicate animations)
    if (
      this.currentAnimationTarget &&
      Math.abs(this.currentAnimationTarget.height - target.height) < 3
    ) {
      return
    }

    // Use tracked bounds for start position (more accurate than getBounds)
    const startBounds = {
      ...rawBounds,
      height: this.lastSetBounds?.height ?? rawBounds.height,
      y: this.lastSetBounds?.y ?? rawBounds.y
    }

    // Skip if already at target (within tolerance) - but only if no animation is in progress
    if (
      !this.boundsAnimationTaskId &&
      Math.abs(startBounds.height - target.height) < 3 &&
      Math.abs(startBounds.y - target.y) < 3
    ) {
      return
    }

    // Cancel any existing animation and start fresh from current position
    this.stopBoundsAnimation()
    this.currentAnimationTarget = { ...target }

    const token = this.boundsAnimationToken
    const heightDelta = Math.abs(target.height - startBounds.height)
    // Duration: 120-220ms based on distance
    const durationMs = Math.min(220, Math.max(120, 120 + heightDelta * 0.2))
    const startTime = performance.now()

    const lerp = (from: number, to: number, t: number): number => from + (to - from) * t
    const easeOutQuart = (t: number): number => 1 - (1 - t) ** 4

    const taskId = 'core-box.window.bounds-animation'
    this.boundsAnimationTaskId = taskId
    this.pollingService.register(
      taskId,
      () => {
        if (token !== this.boundsAnimationToken || browserWindow.isDestroyed()) {
          this.pollingService.unregister(taskId)
          if (this.boundsAnimationTaskId === taskId) {
            this.boundsAnimationTaskId = null
          }
          return
        }

        const elapsed = performance.now() - startTime
        const progress = Math.min(elapsed / durationMs, 1)
        const eased = easeOutQuart(progress)

        const nextBounds: Electron.Rectangle = {
          x: Math.round(lerp(startBounds.x, target.x, eased)),
          y: Math.round(lerp(startBounds.y, target.y, eased)),
          width: Math.round(lerp(startBounds.width, target.width, eased)),
          height: Math.round(lerp(startBounds.height, target.height, eased))
        }

        try {
          browserWindow.setBounds(nextBounds, false)
          // Track the last set bounds for accurate start position on next animation
          this.lastSetBounds = { height: nextBounds.height, y: nextBounds.y }
        } catch (error) {
          coreBoxWindowLog.warn('Failed to animate window bounds', { error })
          this.pollingService.unregister(taskId)
          if (this.boundsAnimationTaskId === taskId) {
            this.boundsAnimationTaskId = null
          }
          return
        }

        if (progress >= 1) {
          this.pollingService.unregister(taskId)
          if (this.boundsAnimationTaskId === taskId) {
            this.boundsAnimationTaskId = null
          }
          this.currentAnimationTarget = null
          try {
            browserWindow.setBounds(target, false)
            this.lastSetBounds = { height: target.height, y: target.y }
            if (typeof options.minHeight === 'number') {
              browserWindow.setMinimumSize(720, options.minHeight)
            }
          } catch (error) {
            coreBoxWindowLog.warn('Failed to finalize window bounds animation', { error })
          }
        }
      },
      { interval: 16, unit: 'milliseconds' }
    )
    this.pollingService.start()
  }

  private calculateCoreBoxBounds(
    curScreen: Electron.Display,
    size: { width: number; height: number }
  ): Electron.Rectangle | null {
    if (!curScreen?.bounds) {
      coreBoxWindowLog.error('Invalid screen object', { meta: { screenId: curScreen?.id } })
      return null
    }

    const rect = curScreen.workArea ?? curScreen.bounds
    if (
      typeof rect.x !== 'number' ||
      typeof rect.y !== 'number' ||
      typeof rect.width !== 'number' ||
      typeof rect.height !== 'number'
    ) {
      coreBoxWindowLog.error('Invalid screen rect received', {
        meta: {
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y
        }
      })
      return null
    }

    const rawWidth = size.width
    const rawHeight = size.height
    const windowWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 900
    let windowHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : COREBOX_MIN_HEIGHT

    const margin = 12
    const maxAllowedHeight = rect.height - margin * 2
    if (Number.isFinite(maxAllowedHeight) && maxAllowedHeight > 0) {
      windowHeight = Math.min(windowHeight, Math.max(COREBOX_MIN_HEIGHT, maxAllowedHeight))
    }

    const baseLeft = rect.x + (rect.width - windowWidth) / 2

    let top: number

    if (this.customTopPercent !== null) {
      // Use custom position if set
      top = rect.y + Math.round(rect.height * this.customTopPercent) - Math.round(windowHeight / 2)
    } else {
      // Fixed position at 30% from top, window expands downward (no vertical movement)
      top = rect.y + Math.round(rect.height * 0.25)
    }

    let left = Math.round(baseLeft)

    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      left = Math.round(baseLeft)
      top = Math.round(rect.y + (rect.height - windowHeight) / 2)
    }

    const minLeft = rect.x + margin
    const maxLeft = rect.x + rect.width - windowWidth - margin
    if (Number.isFinite(minLeft) && Number.isFinite(maxLeft) && maxLeft >= minLeft) {
      left = Math.min(Math.max(left, minLeft), maxLeft)
    } else if (Number.isFinite(minLeft)) {
      left = minLeft
    }

    const minTop = rect.y + margin
    const maxTop = rect.y + rect.height - windowHeight - margin
    if (Number.isFinite(minTop) && Number.isFinite(maxTop) && maxTop >= minTop) {
      top = Math.min(Math.max(top, minTop), maxTop)
    } else if (Number.isFinite(minTop)) {
      top = minTop
    }

    return {
      x: left,
      y: top,
      width: windowWidth,
      height: windowHeight
    }
  }

  public updatePosition(window: TouchWindow, curScreen?: Electron.Display): void {
    if (!curScreen) {
      curScreen = this.getCurScreen()
    }

    const [rawWindowWidth, rawWindowHeight] = window.window.getSize()
    const bounds = this.calculateCoreBoxBounds(curScreen, {
      width: rawWindowWidth,
      height: rawWindowHeight
    })
    if (!bounds) return

    try {
      this.stopBoundsAnimation()
      window.window.setPosition(bounds.x, bounds.y)
    } catch (error) {
      coreBoxWindowLog.error('Failed to set window position', { error })
    }
  }

  /**
   * Show CoreBox window
   * @param triggeredByShortcut - Whether this show was triggered by keyboard shortcut
   */
  public show(triggeredByShortcut: boolean = false): void {
    const window = this.current
    if (!window) return

    this.stopBoundsAnimation()
    this.updatePosition(window)

    const shouldFocus = triggeredByShortcut || coreBoxManager.isUIMode || !!this.uiView
    if (shouldFocus) {
      window.window.show()
    } else {
      window.window.showInactive()
    }

    const transport = this.getTransport()
    void transport.sendTo(window.window.webContents, coreBoxTriggerEvent, {
      id: window.window.webContents.id,
      show: true
    })

    if (triggeredByShortcut) {
      void transport
        .sendTo(window.window.webContents, CoreBoxEvents.ui.shortcutTriggered, undefined)
        .catch(() => {})
    }

    setTimeout(() => {
      if (window.window.isDestroyed()) return
      window.window.focus()
      if (coreBoxManager.isUIMode && this.uiView && !this.uiView.webContents.isDestroyed()) {
        this.uiView.webContents.focus()
        this.uiViewFocused = true
      }
    }, 100)
  }

  public hide(): void {
    const window = this.current
    if (!window) return

    this.stopBoundsAnimation()
    const transport = this.getTransport()
    void transport.sendTo(window.window.webContents, coreBoxTriggerEvent, {
      id: window.window.webContents.id,
      show: false
    })

    if (process.platform !== 'darwin') {
      window.window.setPosition(-1000000, -1000000)
    }

    setTimeout(() => window.window.hide(), 100)
  }

  public expand(
    options: { length?: number; forceMax?: boolean; height?: number } = {},
    isUIMode: boolean = false
  ): void {
    const { length = 0, forceMax = false, height: customHeight } = options
    const effectiveLength = length > 0 ? length : 1

    // Priority: customHeight > isUIMode > forceMax > calculated from length
    let height: number
    if (typeof customHeight === 'number' && customHeight > 0) {
      height = Math.max(COREBOX_MIN_HEIGHT, Math.min(customHeight, 600))
    } else if (isUIMode) {
      height = 600
    } else if (forceMax) {
      height = 600
    } else {
      height = Math.min(effectiveLength * 48 + 65, 600)
    }

    const currentWindow = this.current
    if (currentWindow) {
      const display = this.getDisplayForWindow(currentWindow)
      const bounds = this.calculateCoreBoxBounds(display, { width: 720, height })
      if (!bounds) return

      const settings = this.getAppSettingConfig()
      const animationEnabled = settings.animation?.coreBoxResize === true

      if (currentWindow.window.isVisible() && animationEnabled) {
        this.animateWindowBounds(currentWindow, bounds, { minHeight: height })
      } else {
        this.stopBoundsAnimation()
        try {
          currentWindow.window.setBounds(bounds, false)
          this.lastSetBounds = { height: bounds.height, y: bounds.y }
          currentWindow.window.setMinimumSize(720, height)
        } catch (error) {
          coreBoxWindowLog.error('Failed to update window bounds', { error })
        }
      }
    } else {
      coreBoxWindowLog.error('No current window available for expansion')
    }

    coreBoxWindowLog.debug('Expanded window constraints updated')
  }

  public shrink(): void {
    if (this.uiView) {
      coreBoxWindowLog.debug('UI view is attached during shrink, detaching before shrinking')
      this.detachUIView()
    }

    const currentWindow = this.current
    if (currentWindow) {
      // Skip if already shrunk or shrinking (within tolerance)
      const currentHeight = this.lastSetBounds?.height ?? currentWindow.window.getBounds().height
      if (Math.abs(currentHeight - COREBOX_MIN_HEIGHT) < 5) {
        return
      }

      const display = this.getDisplayForWindow(currentWindow)
      const bounds = this.calculateCoreBoxBounds(display, {
        width: 720,
        height: COREBOX_MIN_HEIGHT
      })
      if (!bounds) return

      const settings = this.getAppSettingConfig()
      const animationEnabled = settings.animation?.coreBoxResize === true

      if (currentWindow.window.isVisible() && animationEnabled) {
        this.animateWindowBounds(currentWindow, bounds, { minHeight: COREBOX_MIN_HEIGHT })
      } else {
        this.stopBoundsAnimation()
        try {
          currentWindow.window.setBounds(bounds, false)
          this.lastSetBounds = { height: bounds.height, y: bounds.y }
          currentWindow.window.setMinimumSize(720, COREBOX_MIN_HEIGHT)
        } catch (error) {
          coreBoxWindowLog.error('Failed to update window bounds', { error })
        }
      }
    } else {
      coreBoxWindowLog.error('No current window available for shrinking')
    }
    coreBoxWindowLog.debug('Shrunk window to compact mode')
  }

  /**
   * Set CoreBox to a specific height (called from frontend)
   */
  public setHeight(height: number): void {
    const safeHeight = Math.max(COREBOX_MIN_HEIGHT, Math.min(height, 600))

    const currentWindow = this.current
    if (!currentWindow) {
      coreBoxWindowLog.error('No current window available for setHeight')
      return
    }

    // Skip if already at target height (within tolerance)
    const currentHeight = this.lastSetBounds?.height ?? currentWindow.window.getBounds().height
    if (Math.abs(currentHeight - safeHeight) < 3) {
      return
    }

    const display = this.getDisplayForWindow(currentWindow)
    const bounds = this.calculateCoreBoxBounds(display, { width: 720, height: safeHeight })
    if (!bounds) return

    const settings = this.getAppSettingConfig()
    const animationEnabled = settings.animation?.coreBoxResize === true
    const isVisible = currentWindow.window.isVisible()

    if (isVisible && animationEnabled) {
      this.animateWindowBounds(currentWindow, bounds, { minHeight: safeHeight })
    } else {
      this.stopBoundsAnimation()
      try {
        currentWindow.window.setBounds(bounds, false)
        this.lastSetBounds = { height: bounds.height, y: bounds.y }
        currentWindow.window.setMinimumSize(720, safeHeight)
      } catch (error) {
        coreBoxWindowLog.error('Failed to set window height', { error })
      }
    }

    coreBoxWindowLog.debug(`Window height set to ${safeHeight}px`)
  }

  /**
   * Set custom vertical position offset for CoreBox (0-1 = 0%-100% from top)
   */
  public setPositionOffset(topPercent: number): void {
    const safePercent = Math.max(0.1, Math.min(0.9, topPercent))
    this.customTopPercent = safePercent

    // Apply immediately if window is visible
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
    this.customTopPercent = null
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
    } catch (error) {
      coreBoxWindowLog.error('Error getting current screen', { error })

      return screen.getPrimaryDisplay()
    }
  }

  private getDisplayForWindow(window: TouchWindow): Electron.Display {
    try {
      if (!window.window.isDestroyed()) {
        return screen.getDisplayMatching(window.window.getBounds())
      }
    } catch (error) {
      coreBoxWindowLog.warn('Failed to get display for window, falling back to cursor screen', {
        error
      })
    }

    return this.getCurScreen()
  }

  public getAppSettingConfig(): AppSetting {
    return getMainConfig(StorageList.APP_SETTING) as AppSetting
  }

  private syncViewCacheConfig(): void {
    type AppSettingWithViewCache = AppSetting & {
      viewCache?: {
        maxCachedViews?: number
        hotCacheDurationMs?: number
      }
    }
    const settings = this.getAppSettingConfig() as AppSettingWithViewCache
    const cfg = settings.viewCache
    if (cfg && typeof cfg === 'object') {
      const patch: { maxCachedViews?: number; hotCacheDurationMs?: number } = {}
      if (typeof cfg.maxCachedViews === 'number') patch.maxCachedViews = cfg.maxCachedViews
      if (typeof cfg.hotCacheDurationMs === 'number')
        patch.hotCacheDurationMs = cfg.hotCacheDurationMs
      viewCacheManager.updateConfig(patch)
      viewCacheManager.cleanupStale()
    }
  }

  private loadThemeStyleConfig(): ThemeStyleConfig {
    const config = getMainConfig(StorageList.THEME_STYLE) as ThemeStyleConfig | undefined
    if (config && typeof config === 'object') {
      return config
    }
    return {}
  }

  private resolveDarkPreference(themeStyle: ThemeStyleConfig): {
    followSystem: boolean
    dark: boolean
  } {
    const style = themeStyle.theme?.style
    const followSystem = style?.auto ?? true
    const dark = followSystem ? nativeTheme.shouldUseDarkColors : Boolean(style?.dark)
    return { followSystem, dark }
  }

  private resolveThemeStoragePath(): { directory: string; file: string } {
    const userDataDir = app.getPath('userData')
    const directory = path.join(userDataDir, ...CORE_BOX_THEME_SUBDIR)
    const file = path.join(directory, CORE_BOX_THEME_FILE_NAME)
    return { directory, file }
  }

  private getBundledThemeCss(): string {
    if (!this.bundledThemeCss) {
      this.bundledThemeCss = defaultCoreBoxThemeCss
    }
    return this.bundledThemeCss
  }

  private loadInternalThemeCss(): string {
    const defaultCss = this.getBundledThemeCss()
    const { directory, file } = this.resolveThemeStoragePath()

    try {
      fs.mkdirSync(directory, { recursive: true })

      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, defaultCss, 'utf-8')
        return defaultCss
      }

      const content = fs.readFileSync(file, 'utf-8')
      return content.trim().length > 0 ? content : defaultCss
    } catch (error) {
      coreBoxWindowLog.error('Failed to prepare theme stylesheet, falling back to default', {
        error
      })
      return defaultCss
    }
  }

  private applyThemeToUIView(view: WebContentsView): void {
    const themeStyle = this.loadThemeStyleConfig()
    const css = this.loadInternalThemeCss()

    if (!view.webContents.isDestroyed()) {
      const previousKey = this.uiViewThemeCssKey.get(view)
      if (previousKey) {
        void view.webContents.removeInsertedCSS(previousKey).catch(() => {})
        this.uiViewThemeCssKey.delete(view)
      }

      void view.webContents
        .insertCSS(css)
        .then((key) => {
          this.uiViewThemeCssKey.set(view, key)
        })
        .catch((error) => {
          coreBoxWindowLog.error('Failed to inject theme variables into UI view', { error })
        })
    }

    const { followSystem, dark } = this.resolveDarkPreference(themeStyle)
    this.updateUIViewDarkClass(view, dark)
    this.notifyThemeChange(dark)

    if (this.nativeThemeHandler) {
      nativeTheme.removeListener('updated', this.nativeThemeHandler)
      this.nativeThemeHandler = null
    }

    if (followSystem) {
      const handler = () => {
        if (!this.uiView || this.uiView !== view || view.webContents.isDestroyed()) {
          return
        }
        this.updateUIViewDarkClass(view, nativeTheme.shouldUseDarkColors)
        this.notifyThemeChange(nativeTheme.shouldUseDarkColors)
      }
      nativeTheme.on('updated', handler)
      this.nativeThemeHandler = handler
    }
  }

  private updateUIViewDarkClass(view: WebContentsView, isDark: boolean): void {
    if (view.webContents.isDestroyed()) {
      return
    }

    const themeLabel = isDark
      ? chalk.bgHex('#0f172a').white.bold(' DARK ')
      : chalk.bgHex('#f8fafc').black.bold(' LIGHT ')
    coreBoxWindowLog.info(`${chalk.magenta('Apply UI theme')} ${themeLabel}`)

    const script = `
      (() => {
        const root = document.documentElement;
        if (!root) { return; }
        root.classList.${isDark ? 'add' : 'remove'}('dark');
      })();
    `

    void view.webContents.executeJavaScript(script).catch((error) => {
      coreBoxWindowLog.error('Failed to update UI view theme class', { error })
    })
  }

  private notifyThemeChange(isDark: boolean): void {
    this.currentThemeIsDark = isDark
    const themeLabel = isDark
      ? chalk.bgHex('#1f2937').white.bold(' DARK ')
      : chalk.bgHex('#e5e7eb').black.bold(' LIGHT ')
    coreBoxWindowLog.info(`${chalk.cyan('Theme ready')} ${themeLabel}`)

    // Theme change events removed - theme is now passed once during attachUIView
    // No real-time broadcasting to prevent channel timeout issues
  }

  public attachUIView(
    url: string,
    plugin?: TouchPlugin,
    query?: TuffQuery | string,
    feature?: IPluginFeature
  ): void {
    const startTime = performance.now()
    const metrics = { preload: 0, viewCreate: 0, total: 0 }

    const currentWindow = this.current
    if (!currentWindow) {
      coreBoxWindowLog.error('Cannot attach UI view: no window available')
      return
    }

    const transport = this.getTransport()

    coreBoxWindowLog.debug(`AttachUIView - loading ${url}`)

    if (this.uiView) {
      coreBoxWindowLog.warn('UI view already attached, skipping re-attachment')
      return
    }

    this.syncViewCacheConfig()

    if (plugin) {
      const cached = viewCacheManager.get(plugin, feature)
      if (cached) {
        if (feature?.interaction?.type === 'webcontent') {
          this.inputAllowed = feature.interaction.allowInput !== false
        }
        this.uiView = cached.view
        this.attachedPlugin = cached.plugin
        this.attachedFeature = cached.feature ?? null
        this.uiViewFocused = true

        currentWindow.window.contentView.addChildView(this.uiView)
        const bounds = currentWindow.window.getBounds()
        this.uiView.setBounds({
          x: 0,
          y: 60,
          width: bounds.width,
          height: Math.max(0, bounds.height - 60)
        })

        if (!this.uiView.webContents.isDestroyed()) {
          this.applyThemeToUIView(this.uiView)
          this.uiView.webContents.focus()

          if (query) {
            const normalizedQuery: TuffQuery =
              typeof query === 'string' ? { text: query } : { ...query }
            void transport
              .sendToPlugin(plugin.name, CoreBoxEvents.input.change, {
                input: normalizedQuery.text ?? '',
                query: normalizedQuery,
                source: 'initial'
              })
              .catch(() => {})
          }

          void transport
            .sendToPlugin(plugin.name, coreBoxUiResumeEvent, {
              source: 'cache',
              featureId: feature?.id,
              url: cached.url
            })
            .catch(() => {})
        }

        coreBoxWindowLog.info(`AttachUIView cache hit: ${plugin.name}`)
        return
      }
    }

    // Auto-enable input monitoring for webcontent features
    // If feature has interaction.allowInput explicitly set, use that value
    // Otherwise, default to true for webcontent features
    if (feature?.interaction?.type === 'webcontent') {
      const shouldAllowInput = feature.interaction.allowInput !== false
      if (shouldAllowInput) {
        this.inputAllowed = true
        coreBoxWindowLog.debug('Auto-enabled input monitoring for webcontent feature')
      }
    }

    const injections = plugin?.__getInjections__()

    // Create dynamic preload script to inject window.$plugin and window.$channel before page scripts execute
    let preloadPath = injections?._.preload
    if (plugin && injections?.js) {
      const tempPreloadPath = path.resolve(
        os.tmpdir(),
        `talex-plugin-preload-${plugin.name}-${Date.now()}.js`
      )

      let originalPreloadContent = ''
      if (injections._.preload && fse.existsSync(injections._.preload)) {
        try {
          originalPreloadContent = fse.readFileSync(injections._.preload, 'utf-8')
        } catch (error) {
          coreBoxWindowLog.warn(`Failed to read original preload: ${injections._.preload}`, {
            error
          })
        }
      }

      // Pre-compute initial data to inject synchronously
      const initialThemeData = { dark: this.currentThemeIsDark }

      const channelScript = `
(function() {
  const uniqueKey = "${plugin._uniqueChannelKey}";

  // Inject initial data synchronously so it's available immediately
  window['$tuffInitialData'] = ${JSON.stringify({ theme: initialThemeData })};
  const { ipcRenderer } = require('electron')
  const DataCode = ${JSON.stringify(DataCode)};
  const CHANNEL_DEFAULT_TIMEOUT = 60000;

  class TouchChannel {
    channelMap = new Map();
    pendingMap = new Map();
    // Queue for messages received before listeners are registered
    earlyMessageQueue = new Map();

    constructor() {
      ipcRenderer.on('@plugin-process-message', this.__handle_main.bind(this));
    }

    __parse_raw_data(e, arg) {
      if (arg) {
        const { name, header, code, plugin, data, sync } = arg;
        if (header) {
          const { uniqueKey: thisUniqueKey } = header
          if (!thisUniqueKey) {
            console.warn('[CoreBox] Plugin uniqueKey not found in header:', arg)
          } else if (thisUniqueKey !== uniqueKey) {
            console.error("[FatalError] Plugin uniqueKey not match!", e, arg, thisUniqueKey, uniqueKey)
            return null;
          }

          return {
            header: {
              status: header.status || 'request',
              type: 'main',
              _originData: arg,
              event: e || undefined
            },
            sync,
            code,
            data,
            plugin,
            name: name
          };
        }
      }
      console.error(e, arg);
      return null;
    }

    __handle_main(e, arg) {
      const rawData = this.__parse_raw_data(e, arg);
      if (!rawData?.header) {
        console.error('Invalid message: ', arg);
        return;
      }
      if (rawData.header.status === 'reply' && rawData.sync) {
        const { id } = rawData.sync;
        return this.pendingMap.get(id)?.(rawData);
      }
      const listeners = this.channelMap.get(rawData.name);
      if (listeners && listeners.length > 0) {
        this.__dispatch(e, rawData, listeners);
      } else {
        // No listeners yet, queue the message for later replay
        const queue = this.earlyMessageQueue.get(rawData.name) || [];
        queue.push({ e, rawData });
        this.earlyMessageQueue.set(rawData.name, queue);
      }
    }

    __dispatch(e, rawData, listeners) {
      listeners.forEach((func) => {
        const handInData = {
          reply: (code, data) => {
            e.sender.send(
              '@plugin-process-message',
              this.__parse_sender(code, rawData, data, rawData.sync)
            );
          },
          ...rawData
        };
        func(handInData);
        handInData.reply(DataCode.SUCCESS, undefined);
      });
    }

    __parse_sender(code, rawData, data, sync) {
      return {
        code,
        data,
        sync: !sync ? undefined : {
          timeStamp: new Date().getTime(),
          timeout: sync.timeout,
          id: sync.id
        },
        name: rawData.name,
        header: {
          status: 'reply',
          type: rawData.header.type,
          _originData: rawData.header._originData
        }
      };
    }

    formatPayloadPreview(payload) {
      const truncate = (value, maxChars) => {
        if (typeof value !== 'string') return String(value);
        if (!Number.isFinite(maxChars) || maxChars <= 0) return '';
        return value.length > maxChars ? value.slice(0, maxChars) + '…' : value;
      };
      const redactDataUrl = (value) => {
        if (typeof value !== 'string') return value;
        if (!value.startsWith('data:')) return value;
        const base64Index = value.indexOf(';base64,');
        if (base64Index === -1) return value;
        const prefixEnd = base64Index + ';base64,'.length;
        const omitted = Math.max(0, value.length - prefixEnd);
        return truncate(value.slice(0, prefixEnd), 200) + '[base64 omitted ' + omitted + ' chars]';
      };

      if (payload === null || payload === undefined) return String(payload);
      if (typeof payload === 'string') return truncate(redactDataUrl(payload), 800);
      try {
        const json = JSON.stringify(payload, (_key, value) => {
          if (typeof value === 'string') return truncate(redactDataUrl(value), 200);
          if (typeof value === 'bigint') return value.toString() + 'n';
          return value;
        });
        return truncate(json, 800);
      } catch {
        return '[unserializable]';
      }
    }

    regChannel(eventName, callback) {
      const listeners = this.channelMap.get(eventName) || [];
      if (!listeners.includes(callback)) {
        listeners.push(callback);
      } else {
        return () => {};
      }
      this.channelMap.set(eventName, listeners);

      // Replay any early messages that were queued before this listener was registered
      const earlyMessages = this.earlyMessageQueue.get(eventName);
      if (earlyMessages && earlyMessages.length > 0) {
        this.earlyMessageQueue.delete(eventName);
        earlyMessages.forEach(({ e, rawData }) => {
          this.__dispatch(e, rawData, [callback]);
        });
      }

      return () => {
        const index = listeners.indexOf(callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    send(eventName, arg) {
      const uniqueId = Date.now() + '#' + eventName + '@' + Math.random().toString(12);
      const data = {
        code: DataCode.SUCCESS,
        data: arg,
        sync: {
          timeStamp: new Date().getTime(),
          timeout: CHANNEL_DEFAULT_TIMEOUT,
          id: uniqueId
        },
        name: eventName,
        header: {
          uniqueKey,
          status: 'request',
          type: 'plugin'
        }
      };
      const instance = this
      return new Promise((resolve, reject) => {
        try {
          ipcRenderer.send('@plugin-process-message', data);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[CoreBox] Failed to send plugin channel message', {
            eventName,
            error: errorMessage,
            payloadPreview: instance.formatPayloadPreview(arg)
          });
          const sendError = new Error('Failed to send plugin channel message "' + eventName + '": ' + errorMessage);
          sendError.code = 'plugin_channel_send_failed';
          reject(sendError);
          return;
        }

        const timeoutMs = data.sync?.timeout ?? CHANNEL_DEFAULT_TIMEOUT;
        const timeoutHandle = setTimeout(() => {
          if (!instance.pendingMap.has(uniqueId)) return;
          instance.pendingMap.delete(uniqueId);
          const timeoutError = new Error('Plugin channel request "' + eventName + '" timed out after ' + timeoutMs + 'ms');
          timeoutError.code = 'plugin_channel_timeout';
          console.warn(timeoutError.message);
          reject(timeoutError);
        }, timeoutMs);

        instance.pendingMap.set(uniqueId, (res) => {
          clearTimeout(timeoutHandle);
          instance.pendingMap.delete(uniqueId);
          resolve(res.data);
        });
      });
    }

    sendSync(eventName, arg) {
      const data = {
        code: DataCode.SUCCESS,
        data: arg,
        name: eventName,
        header: {
          uniqueKey,
          status: 'request',
          type: 'plugin'
        }
      };
      try {
        const res = this.__parse_raw_data(null, ipcRenderer.sendSync('@plugin-process-message', data));
        if (res?.header?.status === 'reply') return res.data;
        return res;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[CoreBox] Failed to sendSync plugin channel message', {
          eventName,
          error: errorMessage
        });
        throw new Error('Failed to sendSync plugin channel message "' + eventName + '": ' + errorMessage);
      }
    }
  }

  window['$channel'] = new TouchChannel();
  try {
    const { createPluginTuffTransport } = require('@talex-touch/utils/transport');
    window['$transport'] = createPluginTuffTransport(window['$channel']);
  } catch (error) {
    console.error('[CoreBox] Failed to init plugin transport:', error);
  }
})();
`

      const hasOriginalPreload = originalPreloadContent && originalPreloadContent.trim().length > 0
      const pluginInjectionCode = injections.js.trim()

      const combinedPreload = `
// Auto-generated preload script for plugin initialization
(function() {
  try {
    ${pluginInjectionCode};
  } catch (error) {
    console.error('[CoreBox] Failed to inject window.$plugin:', error);
  }

  try {
    ${channelScript}
  } catch (error) {
    console.error('[CoreBox] Failed to inject window.$channel:', error);
  }

  ${
    hasOriginalPreload
      ? `try {
    ${originalPreloadContent};
  } catch (error) {
    console.error('[CoreBox] Failed to execute original preload:', error);
  }`
      : '// No original preload script'
  }
})();
`
      try {
        fse.writeFileSync(tempPreloadPath, combinedPreload, 'utf-8')
        preloadPath = path.resolve(tempPreloadPath)
        coreBoxWindowLog.debug(`Created dynamic preload script: ${preloadPath}`)
      } catch (error) {
        coreBoxWindowLog.error(`Failed to create preload script: ${tempPreloadPath}`, {
          error
        })
        preloadPath = injections._.preload
      }
    }

    metrics.preload = performance.now() - startTime

    const webPreferences: Electron.WebPreferences = {
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
    const view = (this.uiView = new WebContentsView({ webPreferences }))
    metrics.viewCreate = performance.now() - viewCreateStart
    this.attachedPlugin = plugin ?? null
    this.attachedFeature = feature ?? null

    this.uiViewFocused = true
    currentWindow.window.contentView.addChildView(this.uiView)

    metaOverlayManager.ensureOnTop()

    this.uiView.webContents.addListener('blur', () => {
      this.uiViewFocused = false
    })

    this.uiView.webContents.addListener('focus', () => {
      this.uiViewFocused = true
    })

    // Listen for special keys in UI view
    this.uiView.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return

      // ESC: exit UI mode
      if (input.key === 'Escape') {
        coreBoxWindowLog.debug('ESC pressed in UI view, exiting UI mode')
        coreBoxManager.exitUIMode()
        event.preventDefault()
        return
      }

      // Ctrl+R / Cmd+R: disable in production
      if (input.key === 'r' && (input.control || input.meta)) {
        if (app.isPackaged) {
          event.preventDefault()
        }
      }
    })

    // window.$plugin and window.$channel are injected via preload script before page scripts execute
    // Styles will be injected on dom-ready

    this.uiView.webContents.addListener('dom-ready', () => {
      this.applyThemeToUIView(view)

      if (plugin) {
        // Only auto-open DevTools for plugins in dev mode (not based on app.isPackaged)
        if (plugin.dev?.enable) {
          view.webContents.openDevTools({ mode: 'detach' })
          this.uiViewFocused = true
        }

        if (injections?.styles) {
          this.uiView?.webContents.insertCSS(injections.styles)
        }
        if (pluginModule.pluginManager) {
          pluginModule.pluginManager.setActivePlugin(plugin.name)
        } else {
          coreBoxWindowLog.warn('Plugin manager not available, cannot set plugin active')
        }

        this.uiView?.webContents.focus()
      }
    })

    const bounds = currentWindow.window.getBounds()
    this.uiView.setBounds({
      x: 0,
      y: 60,
      width: bounds.width,
      height: bounds.height - 60
    })

    const finalUrl = this.normalizeUIViewUrl(url, plugin)
    coreBoxWindowLog.debug(`AttachUIView - resolved URL ${finalUrl}`)
    this.uiView.webContents.loadURL(finalUrl)

    if (plugin) {
      viewCacheManager.set(plugin, view, finalUrl, feature)
    }

    metrics.total = performance.now() - startTime
    coreBoxWindowLog.info(
      `AttachUIView metrics: preload=${metrics.preload.toFixed(1)}ms viewCreate=${metrics.viewCreate.toFixed(1)}ms total=${metrics.total.toFixed(1)}ms`
    )

    // Initial theme is now injected synchronously via preload ($tuffInitialData.theme)
    // No need to send via channel - data is available immediately when page scripts run

    // Send initial query directly to plugin after dom-ready (bypasses inputAllowed check)
    if (query && plugin) {
      const normalizedQuery: TuffQuery = typeof query === 'string' ? { text: query } : { ...query }

      // Dedupe inputs and extract text content if text is empty
      if (normalizedQuery.inputs && normalizedQuery.inputs.length > 0) {
        const seen = new Set<string>()
        normalizedQuery.inputs = normalizedQuery.inputs.filter((input) => {
          const key = `${input.type}:${input.content?.slice(0, 100)}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        // If text is empty and first input is text-like, move content to text
        if (!normalizedQuery.text && normalizedQuery.inputs.length > 0) {
          const firstInput = normalizedQuery.inputs[0]
          if (firstInput.type === 'text' || firstInput.type === 'html') {
            normalizedQuery.text = firstInput.content
            normalizedQuery.inputs = normalizedQuery.inputs.slice(1)
          }
        }
      }

      this.uiView.webContents.once('dom-ready', () => {
        void transport.sendToPlugin(plugin.name, CoreBoxEvents.input.change, {
          input: normalizedQuery.text ?? '',
          query: normalizedQuery,
          source: 'initial'
        })

        void transport
          .sendToPlugin(plugin.name, coreBoxUiResumeEvent, {
            source: 'attach',
            featureId: feature?.id,
            url: finalUrl
          })
          .catch(() => {})
      })
    }

    if (!query && plugin) {
      this.uiView.webContents.once('dom-ready', () => {
        void transport
          .sendToPlugin(plugin.name, coreBoxUiResumeEvent, {
            source: 'attach',
            featureId: feature?.id,
            url: finalUrl
          })
          .catch(() => {})
      })
    }
  }

  public detachUIView(): void {
    // Reset permissions
    this.inputAllowed = false
    this.clipboardAllowedTypes = 0

    if (this.nativeThemeHandler) {
      nativeTheme.removeListener('updated', this.nativeThemeHandler)
      this.nativeThemeHandler = null
    }

    if (this.uiView) {
      // Handle plugin state transition before detaching
      if (this.attachedPlugin && pluginModule.pluginManager) {
        const plugin = this.attachedPlugin

        // Clear items pushed by this plugin from BoxItemManager
        const boxItemManager = getBoxItemManager()
        boxItemManager.clear(plugin.name)
        coreBoxWindowLog.debug(`Cleared BoxItemManager items for plugin: ${plugin.name}`)

        // Deactivate the plugin: set to ENABLED if still enabled, send INACTIVE event
        if (plugin.status === PluginStatus.ACTIVE) {
          plugin.status = PluginStatus.ENABLED
          const channel = genTouchApp().channel
          const keyManager =
            (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
          const transport = getTuffTransportMain(channel, keyManager)
          transport
            .sendToPlugin(plugin.name, PluginEvents.lifecycleSignal.inactive, undefined)
            .catch(() => {})
        }
      }

      const currentWindow = this.current
      if (currentWindow && !currentWindow.window.isDestroyed()) {
        this.uiView.webContents.closeDevTools()
        try {
          currentWindow.window.contentView.removeChildView(this.uiView)
        } catch (err) {
          coreBoxWindowLog.warn('Failed to remove child view', { error: err })
        }
        currentWindow.window.webContents.focus()
      } else {
        coreBoxWindowLog.warn('Cannot remove child view: current window is null or destroyed')
      }

      type AppSettingWithViewCache = AppSetting & {
        viewCache?: {
          maxCachedViews?: number
        }
      }
      const settings = this.getAppSettingConfig() as AppSettingWithViewCache
      const cacheEnabled = (settings.viewCache?.maxCachedViews ?? 0) > 0

      if (!cacheEnabled || !this.attachedPlugin) {
        try {
          if (!this.uiView.webContents.isDestroyed()) {
            this.uiView.webContents.close()
          }
        } catch (err) {
          coreBoxWindowLog.warn('Failed to close UI view', { error: err })
        }
        if (this.attachedPlugin) {
          viewCacheManager.release(this.attachedPlugin, this.attachedFeature ?? undefined)
        }
      }

      this.uiView = null
      this.attachedPlugin = null
      this.attachedFeature = null
    }
  }

  public sendToUIView(channel: string, ...args: unknown[]): void {
    if (this.uiView) {
      this.uiView.webContents.postMessage(channel, args)
    }
  }

  /**
   * Sends a channel message to the attached plugin UI view.
   *
   * @param eventName - The event name to send
   * @param data - Optional data payload
   */
  public sendChannelMessageToUIView(eventName: string, data?: unknown): void {
    if (!this.attachedPlugin) {
      return
    }
    const transport = this.getTransport()
    const event = defineRawEvent<unknown, unknown>(eventName)
    void transport.sendToPlugin(this.attachedPlugin.name, event, data as unknown).catch(() => {})
  }

  public getUIView(): WebContentsView | undefined {
    if (!this.uiView) {
      return void 0
    }

    return this.uiView
  }

  /**
   * Extracts the UI view from CoreBox without destroying it.
   * Used for transferring the view to a DivisionBox window.
   * @returns The extracted UI view and plugin, or null if no view is attached
   */
  public extractUIView(): { view: WebContentsView; plugin: TouchPlugin } | null {
    if (!this.uiView || !this.attachedPlugin) {
      return null
    }

    const currentWindow = this.current
    if (!currentWindow || currentWindow.window.isDestroyed()) {
      return null
    }

    if (!currentWindow.window.isVisible()) {
      coreBoxWindowLog.warn('Cannot extract UI view: CoreBox window is not visible')
      return null
    }

    // Remove from CoreBox window (but don't destroy)
    try {
      currentWindow.window.contentView.removeChildView(this.uiView)
    } catch (err) {
      coreBoxWindowLog.error('Failed to remove UI view from CoreBox', { error: err })
      return null
    }

    const result = {
      view: this.uiView,
      plugin: this.attachedPlugin
    }

    // Clear references without destroying
    this.uiView = null
    this.attachedPlugin = null
    this.uiViewFocused = false

    coreBoxWindowLog.info('UI view extracted for transfer')
    return result
  }

  /**
   * Restores a previously extracted UI view back into CoreBox.
   * This is used as a rollback path when transferring the view fails.
   */
  public restoreExtractedUIView(view: WebContentsView, plugin: TouchPlugin): boolean {
    const currentWindow = this.current
    if (!currentWindow || currentWindow.window.isDestroyed()) {
      coreBoxWindowLog.warn('Cannot restore UI view: CoreBox window is not available')
      return false
    }

    if (this.uiView) {
      coreBoxWindowLog.warn('Cannot restore UI view: another UI view is already attached')
      return false
    }

    this.uiView = view
    this.attachedPlugin = plugin
    this.attachedFeature = null
    this.uiViewFocused = true

    try {
      currentWindow.window.contentView.addChildView(view)
      const bounds = currentWindow.window.getBounds()
      view.setBounds({
        x: 0,
        y: 60,
        width: bounds.width,
        height: Math.max(0, bounds.height - 60)
      })
    } catch (error) {
      coreBoxWindowLog.error('Failed to restore extracted UI view', { error })
      this.uiView = null
      this.attachedPlugin = null
      this.attachedFeature = null
      this.uiViewFocused = false
      return false
    }

    if (!view.webContents.isDestroyed()) {
      this.applyThemeToUIView(view)
      view.webContents.focus()
    }

    coreBoxWindowLog.info('UI view restored after failed transfer', {
      meta: { plugin: plugin.name }
    })
    return true
  }

  /**
   * Check if UI view is currently active and focused
   */
  public isUIViewActive(): boolean {
    return !!(this.uiView && this.attachedPlugin)
  }

  /**
   * Check if UI view has focus (vs main CoreBox input)
   */
  public isUIViewFocused(): boolean {
    return this.uiViewFocused
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
  public forwardKeyEvent(event: {
    key: string
    code: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    repeat: boolean
  }): void {
    if (!this.uiView) {
      coreBoxWindowLog.debug('Cannot forward key event: no UI view attached')
      return
    }

    const modifiers = this.buildKeyModifiers(event)
    const keyCode = this.mapKeyToElectronKeyCode(event.key)

    coreBoxWindowLog.debug(`Simulating key input: ${event.key}`, {
      meta: { keyCode, modifiers: modifiers.join(',') }
    })

    this.uiView.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode,
      modifiers
    })

    if (event.key.length === 1) {
      this.uiView.webContents.sendInputEvent({
        type: 'char',
        keyCode: event.key,
        modifiers
      })
    }

    this.uiView.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode,
      modifiers
    })
  }

  /**
   * Builds the modifiers array for Electron's sendInputEvent API.
   *
   * @param event - The keyboard event containing modifier key states
   * @returns Array of modifier strings compatible with Electron's input event API
   */
  private buildKeyModifiers(event: {
    shiftKey: boolean
    ctrlKey: boolean
    altKey: boolean
    metaKey: boolean
    repeat: boolean
  }): Array<'shift' | 'control' | 'alt' | 'meta' | 'cmd' | 'iskeypad' | 'isautorepeat'> {
    const modifiers: Array<
      'shift' | 'control' | 'alt' | 'meta' | 'cmd' | 'iskeypad' | 'isautorepeat'
    > = []
    if (event.shiftKey) modifiers.push('shift')
    if (event.ctrlKey) modifiers.push('control')
    if (event.altKey) modifiers.push('alt')
    if (event.metaKey) modifiers.push('meta')
    if (event.repeat) modifiers.push('isautorepeat')
    return modifiers
  }

  /**
   * Maps a DOM key value to Electron's keyCode format for sendInputEvent.
   *
   * @param key - The DOM key value (e.g., 'ArrowUp', 'Enter')
   * @returns The corresponding Electron keyCode (e.g., 'Up', 'Return')
   */
  private mapKeyToElectronKeyCode(key: string): string {
    const keyMap: Record<string, string> = {
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right',
      Enter: 'Return',
      Escape: 'Escape',
      Backspace: 'Backspace',
      Tab: 'Tab',
      Delete: 'Delete',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ' ': 'Space'
    }
    return keyMap[key] || key
  }

  /**
   * Opens DevTools for the plugin's WebContentsView if the specified plugin is currently attached.
   * Allowed for dev plugins, or any plugin when the app runs in DEV mode.
   * @param pluginName - Name of the plugin to open DevTools for
   * @returns true if DevTools was opened, false otherwise
   */
  public openPluginDevTools(pluginName: string): boolean {
    if (!this.attachedPlugin || this.attachedPlugin.name !== pluginName) {
      return false
    }

    const devtoolsAllowed =
      this.attachedPlugin.dev?.enable || this.touchApp.version === TalexTouch.AppVersion.DEV
    if (!devtoolsAllowed) {
      coreBoxWindowLog.warn(`DevTools blocked for non-dev plugin: ${pluginName}`)
      return false
    }

    if (this.uiView && !this.uiView.webContents.isDestroyed()) {
      this.uiView.webContents.openDevTools({ mode: 'detach' })
      return true
    }

    return false
  }

  private normalizeUIViewUrl(url: string, plugin?: TouchPlugin): string {
    const isDevPlugin = Boolean(plugin && plugin.dev && plugin.dev.enable)
    if (!isDevPlugin) {
      return url
    }

    try {
      const parsed = new URL(url)
      if (parsed.hash && parsed.hash.startsWith('#/')) {
        return url
      }

      const pathWithSearch = `${parsed.pathname ?? ''}${parsed.search ?? ''}` || '/'
      const normalizedPath = pathWithSearch.startsWith('/') ? pathWithSearch : `/${pathWithSearch}`
      parsed.pathname = '/'
      parsed.search = ''
      parsed.hash = `#${normalizedPath}`
      return parsed.toString()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      coreBoxWindowLog.warn(
        '[CoreBox] Failed to normalize plugin dev URL for hash routing, falling back.',
        { meta: { url, error: errorMessage } }
      )
      const sanitized = url.replace(/#.*$/, '').replace(/\/+$/, '')
      return `${sanitized}/#/`
    }
  }
}

export const windowManager = WindowManager.getInstance()

export function getCoreBoxWindow(): TouchWindow | undefined {
  return windowManager.current || void 0
}
