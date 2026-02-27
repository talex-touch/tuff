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

export class TrayManager extends BaseModule {
  static key: symbol = Symbol.for('TrayManager')
  name: ModuleKey = TrayManager.key

  private tray: Tray | null = null
  private trayExperimentalEnabled = false
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

    this.trayExperimentalEnabled = this.isTrayExperimentalEnabled()

    if (process.platform === 'darwin') {
      this.applyActivationPolicy()
    }

    this.registerWindowEvents()
    this.registerEventListeners()
    this.setupAutoStart()
    this.setupChannels()

    if (process.platform === 'darwin') {
      this.setupDockIcon()
      this.updateDockVisibility()
    }

    if (!this.trayExperimentalEnabled) {
      console.info('[TrayManager] Tray is experimental and disabled by default.')
      return
    }

    if (this.shouldShowTray()) {
      this.initializeTray()
    }
  }

  private applyActivationPolicy(): void {
    const hideDock = this.getHideDockConfig()
    const startSilent = this.getStartSilentConfig()
    const shouldUseAccessory =
      this.trayExperimentalEnabled &&
      this.shouldShowTray() &&
      !this.shouldForceRegularInDev() &&
      (hideDock || startSilent)
    const normalized: 'regular' | 'accessory' = shouldUseAccessory ? 'accessory' : 'regular'

    try {
      app.setActivationPolicy(normalized)
      console.info('[TrayManager] Activation policy updated', { policy: normalized })
    } catch (error) {
      console.warn('[TrayManager] Failed to set activation policy', { policy: normalized, error })
    }
  }

  private initializeTray(): void {
    if (this.tray) return

    try {
      const icon = TrayIconProvider.getIcon()
      if (icon.isEmpty()) {
        console.warn('[TrayManager] Tray icon is empty, skip tray initialization')
        return
      }

      if (process.platform === 'darwin') {
        icon.setTemplateImage(true)
      }

      this.tray = new Tray(icon)
      this.tray.setToolTip('tuff')
      this.bindTrayEvents()
      this.updateMenu()
    } catch (error) {
      console.error('[TrayManager] Failed to initialize tray:', error)
    }
  }

  private destroyTray(): void {
    if (!this.tray) return
    this.tray.destroy()
    this.tray = null
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
      const canCloseToTray =
        this.trayExperimentalEnabled && this.shouldShowTray() && this.tray !== null

      if (closeToTray && !isQuitting && canCloseToTray) {
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

  private getStartSilentConfig(): boolean {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      return appConfig?.window?.startSilent ?? false
    } catch (error) {
      console.error('[TrayManager] Failed to read startSilent config:', error)
      return false
    }
  }

  private shouldForceRegularInDev(): boolean {
    if (process.platform !== 'darwin') return false
    if (app.isPackaged) return false
    return this.getHideDockConfig() || this.getStartSilentConfig()
  }

  private isTrayExperimentalEnabled(): boolean {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      return appConfig?.setup?.experimentalTray === true
    } catch (error) {
      console.warn('[TrayManager] Failed to read experimental tray switch, fallback disabled', {
        error
      })
      return false
    }
  }

  /**
   * Setup Dock icon on macOS
   * 在 macOS 上设置 Dock 图标
   */
  private setupDockIcon(): void {
    if (process.platform !== 'darwin') return

    try {
      const appIconPath = TrayIconProvider.getAppIconPath()
      if (!appIconPath) return

      const fs = require('fs-extra')
      if (!fs.existsSync(appIconPath)) return
      if (!app.dock) return

      app.dock.setIcon(appIconPath)
      if ($app.version === TalexTouch.AppVersion.DEV) {
        app.dock.setBadge($app.version)
      }
    } catch (error) {
      console.error('[TrayManager] Failed to setup Dock icon:', error)
    }
  }

  public updateDockVisibility(): void {
    if (process.platform !== 'darwin') return

    const mainWindow = $app.window.window
    const hideDock = this.getHideDockConfig()
    const hasDivisionBox = this.hasActiveDivisionBox()
    const trayAvailable =
      this.trayExperimentalEnabled && this.shouldShowTray() && this.tray !== null

    if (this.shouldForceRegularInDev() || !trayAvailable) {
      app.setActivationPolicy('regular')
      app.dock?.show()
      return
    }

    if (hideDock) {
      if (mainWindow.isVisible() || hasDivisionBox) {
        app.dock?.show()
      } else {
        app.dock?.hide()
      }
      return
    }

    app.dock?.show()
  }

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
      return this.trayExperimentalEnabled && this.tray !== null
    })

    this.transport.on(TrayEvents.show.set, (show) => {
      if (!this.trayExperimentalEnabled) {
        console.warn('[TrayManager] Tray is experimental and currently disabled.')
        return false
      }

      const shouldShow = show === true
      if (shouldShow && !this.tray && this.shouldShowTray()) {
        this.initializeTray()
        this.updateMenu()
      } else if (!shouldShow && this.tray) {
        this.destroyTray()
      }
      this.updateDockVisibility()
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
    this.destroyTray()
  }
}

const trayManagerModule = new TrayManager()

export { trayManagerModule }
