import type { AppSetting, MaybePromise, ModuleKey } from '@talex-touch/utils'
import type { ITouchEvent } from '@talex-touch/utils/eventbus'
import type {
  DownloadTaskChangedEvent,
  UpdateAvailableEvent
} from '../../core/eventbus/touch-event'
import type { TrayState } from './tray-state-manager'
import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { TrayEvents } from '@talex-touch/utils/transport/events'
import { app, Tray } from 'electron'
import {
  TalexEvents,
  touchEventBus,
  WindowHiddenEvent,
  WindowShownEvent
} from '../../core/eventbus/touch-event'
import { TalexTouch } from '../../types'
import { BaseModule } from '../abstract-base-module'
import { getMainConfig } from '../storage'
import { TrayIconProvider } from './tray-icon-provider'
import { TrayMenuBuilder } from './tray-menu-builder'
import { TrayStateManager } from './tray-state-manager'

const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel

/**
 * Main tray manager
 *
 * Handles tray icon creation, interaction, and menu updates
 */
export class TrayManager extends BaseModule {
  static key: symbol = Symbol.for('TrayManager')
  name: ModuleKey = TrayManager.key

  private tray: Tray | null = null
  private menuBuilder: TrayMenuBuilder
  private stateManager: TrayStateManager
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  constructor() {
    super(TrayManager.key, {
      create: false
    })
    this.menuBuilder = new TrayMenuBuilder()
    this.stateManager = new TrayStateManager()
  }

  async onInit(): Promise<void> {
    if ($app.channel) {
      const keyManager = resolveKeyManager($app.channel)
      this.transport = getTuffTransportMain($app.channel, keyManager)
    }

    const shouldShowTray = this.shouldShowTray()
    this.registerWindowEvents()
    this.registerEventListeners()
    this.setupAutoStart()
    this.setupChannels()

    if (process.platform === 'darwin') {
      this.setupDockIcon()
      this.updateDockVisibility()
    }

    if (shouldShowTray) {
      this.initializeTray()
    }
  }

  private initializeTray(): void {
    try {
      const icon = TrayIconProvider.getIcon()

      if (icon.isEmpty()) {
        console.error('[TrayManager] Icon is empty, cannot create tray')
        this.ensureDockVisibleWhenTrayUnavailable('tray-icon-empty')
        return
      }

      if (process.platform === 'darwin') {
        icon.setTemplateImage(true)
      }

      this.tray = new Tray(icon)

      if (process.platform === 'darwin') {
        icon.setTemplateImage(true)
        this.tray.setImage(icon)
      }

      this.tray.setToolTip('tuff')
      this.bindTrayEvents()
      this.updateMenu()
    } catch (error) {
      console.error('[TrayManager] Failed to initialize tray:', error)
      this.ensureDockVisibleWhenTrayUnavailable('tray-init-failed')
    }
  }

  private destroyTray(): void {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  private shouldShowTray(): boolean {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      const showTray = appConfig?.setup?.showTray

      if (showTray !== undefined) {
        return showTray !== false
      }

      return true
    } catch (error) {
      console.error('[TrayManager] Failed to check shouldShowTray:', error)
      return true
    }
  }

  private setupAutoStart(): void {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      const autoStart = appConfig?.setup?.autoStart ?? false
      const startSilent = appConfig?.window?.startSilent ?? false

      const options: Electron.Settings = {
        openAtLogin: autoStart,
        openAsHidden: startSilent
      }

      app.setLoginItemSettings(options)
    } catch (error) {
      console.error('[TrayManager] Failed to setup auto-start:', error)
    }
  }

  public updateAutoStart(enabled: boolean): void {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      const startSilent = appConfig?.window?.startSilent ?? false

      const options: Electron.Settings = {
        openAtLogin: enabled,
        openAsHidden: enabled && startSilent
      }

      app.setLoginItemSettings(options)
    } catch (error) {
      console.error('[TrayManager] Failed to update auto-start:', error)
    }
  }

  public getAutoStartStatus(): boolean {
    try {
      const loginItemSettings = app.getLoginItemSettings()
      return loginItemSettings.openAtLogin
    } catch (error) {
      console.error('[TrayManager] Failed to get auto-start status:', error)
      return false
    }
  }

  private bindTrayEvents(): void {
    if (!this.tray) return

    this.tray.on('click', this.handleTrayClick.bind(this))

    if (process.platform !== 'darwin') {
      this.tray.on('right-click', () => {
        this.tray?.popUpContextMenu()
      })
    }
  }

  private handleTrayClick(): void {
    const mainWindow = $app.window.window

    if (mainWindow.isVisible()) {
      if (mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        mainWindow.focus()
      }
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  }

  public updateMenu(state?: Partial<TrayState>): void {
    if (!this.tray) return

    if (state) {
      this.stateManager.updateState(state)
    }

    try {
      const menu = this.menuBuilder.buildMenu(this.stateManager.getState())
      this.tray.setContextMenu(menu)
    } catch (error) {
      console.error('[TrayManager] Failed to update menu:', error)
    }
  }

  private registerWindowEvents(): void {
    const mainWindow = $app.window.window

    mainWindow.on('close', (event) => {
      const configData = $app.config.data as { window?: { closeToTray?: boolean } } | undefined
      const closeToTray = configData?.window?.closeToTray ?? true
      const isQuitting = $app.isQuitting || false

      if (closeToTray && !isQuitting) {
        event.preventDefault()
        mainWindow.hide()
        touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())

        if (process.platform === 'darwin') {
          this.updateDockVisibility()
        }
      }
    })

    mainWindow.on('show', () => {
      touchEventBus.emit(TalexEvents.WINDOW_SHOWN, new WindowShownEvent())

      if (process.platform === 'darwin') {
        this.updateDockVisibility()
      }
    })

    mainWindow.on('hide', () => {
      touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())

      if (process.platform === 'darwin') {
        this.updateDockVisibility()
      }
    })

    if (process.platform === 'darwin') {
      app.on('activate', () => {
        if (!mainWindow.isVisible()) {
          mainWindow.show()
          mainWindow.focus()
        }
      })
    }
  }

  private registerEventListeners(): void {
    touchEventBus.on(TalexEvents.WINDOW_HIDDEN, () => {
      this.updateMenu({ windowVisible: false })
    })

    touchEventBus.on(TalexEvents.WINDOW_SHOWN, () => {
      this.updateMenu({ windowVisible: true })
    })

    touchEventBus.on(TalexEvents.LANGUAGE_CHANGED, () => {
      this.updateMenu()
    })

    touchEventBus.on(TalexEvents.DOWNLOAD_TASK_CHANGED, (event: ITouchEvent<TalexEvents>) => {
      const downloadEvent = event as DownloadTaskChangedEvent
      this.updateMenu({ activeDownloads: downloadEvent.activeCount })
    })

    touchEventBus.on(TalexEvents.UPDATE_AVAILABLE, (event: ITouchEvent<TalexEvents>) => {
      const updateEvent = event as UpdateAvailableEvent
      this.updateMenu({ hasUpdate: true, updateVersion: updateEvent.version })
    })

    this.transport?.on(TrayEvents.autostart.update, (enabled) => {
      if (typeof enabled === 'boolean') {
        this.updateAutoStart(enabled)
        return true
      }
      return false
    })

    this.transport?.on(TrayEvents.autostart.get, () => {
      return this.getAutoStartStatus()
    })
  }

  private getHideDockConfig(): boolean {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      return appConfig?.setup?.hideDock ?? false
    } catch (error) {
      console.error('[TrayManager] Failed to read hideDock config:', error)
      return false
    }
  }

  private ensureDockVisibleWhenTrayUnavailable(reason: string): void {
    if (process.platform !== 'darwin') return
    if (!this.getHideDockConfig()) return
    if (this.tray) return

    console.warn(
      `[TrayManager] Tray unavailable while hideDock is enabled (${reason}), forcing Dock visible`
    )
    app.dock?.show()
  }

  /**
   * Setup Dock icon on macOS
   * 在 macOS 上设置 Dock 图标
   */
  private setupDockIcon(): void {
    if (process.platform !== 'darwin') return

    try {
      const appIconPath = TrayIconProvider.getAppIconPath()

      // Validate icon path before attempting to load
      if (!appIconPath) {
        console.warn('[TrayManager] App icon path is empty, skipping Dock icon setup')
        return
      }

      // Verify file existence
      const fs = require('fs-extra')
      if (!fs.existsSync(appIconPath)) {
        console.warn(`[TrayManager] App icon file does not exist: ${appIconPath}`)
        return
      }

      if (!app.dock) {
        console.warn('[TrayManager] app.dock is not available')
        return
      }

      // Attempt to set Dock icon
      try {
        app.dock.setIcon(appIconPath)
        console.log(`[TrayManager] Successfully set Dock icon: ${appIconPath}`)

        // Set badge for dev version
        if ($app.version === TalexTouch.AppVersion.DEV) {
          app.dock.setBadge($app.version)
        }
      } catch (iconError) {
        console.error(`[TrayManager] Failed to load icon from path: ${appIconPath}`, iconError)
      }
    } catch (error) {
      console.error('[TrayManager] Failed to setup Dock icon:', error)
    }
  }

  public updateDockVisibility(): void {
    if (process.platform !== 'darwin') return

    const mainWindow = $app.window.window
    const hideDock = this.getHideDockConfig()
    const trayAvailable = this.tray !== null

    // Check if there are active DivisionBox sessions
    const hasDivisionBox = this.hasActiveDivisionBox()

    if (hideDock && trayAvailable) {
      // When hideDock is enabled, show dock if:
      // 1. Main window is visible, OR
      // 2. There are active DivisionBox windows
      if (mainWindow.isVisible() || hasDivisionBox) {
        app.dock?.show()
      } else {
        app.dock?.hide()
      }
    } else {
      // Always show dock when hideDock is disabled, or tray is unavailable.
      app.dock?.show()
    }
  }

  /**
   * Check if there are any active DivisionBox sessions
   */
  private hasActiveDivisionBox(): boolean {
    try {
      const { DivisionBoxManager } = require('../division-box/manager')
      const manager = DivisionBoxManager.getInstance()
      return manager.getActiveSessions().length > 0
    } catch {
      return false
    }
  }

  private setupChannels(): void {
    if (!this.transport) return

    this.transport.on(TrayEvents.show.get, () => {
      return this.tray !== null
    })

    this.transport.on(TrayEvents.show.set, (show) => {
      const shouldShow = show === true
      if (shouldShow && !this.tray) {
        this.initializeTray()
        this.updateMenu()
      } else if (!shouldShow && this.tray) {
        this.destroyTray()
      }
      return true
    })

    this.transport.on(TrayEvents.hideDock.set, () => {
      if (process.platform === 'darwin') {
        this.updateDockVisibility()
      }
      return true
    })
  }

  onDestroy(): MaybePromise<void> {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }
}

const trayManagerModule = new TrayManager()

export { trayManagerModule }
