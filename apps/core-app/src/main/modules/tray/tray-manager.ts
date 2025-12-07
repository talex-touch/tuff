import type { AppSetting, MaybePromise, ModuleKey } from '@talex-touch/utils'
import type { ITouchEvent } from '@talex-touch/utils/eventbus'
import type {
  DownloadTaskChangedEvent,
  UpdateAvailableEvent,
} from '../../core/eventbus/touch-event'
import type { TrayState } from './tray-state-manager'
import { ChannelType, StorageList } from '@talex-touch/utils'
import { app, Tray } from 'electron'
import { TalexEvents, touchEventBus, WindowHiddenEvent, WindowShownEvent } from '../../core/eventbus/touch-event'
import { TalexTouch } from '../../types'
import { BaseModule } from '../abstract-base-module'
import { getConfig } from '../storage'
import { TrayIconProvider } from './tray-icon-provider'
import { TrayMenuBuilder } from './tray-menu-builder'
import { TrayStateManager } from './tray-state-manager'

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

  constructor() {
    super(TrayManager.key, {
      create: false,
    })
    this.menuBuilder = new TrayMenuBuilder()
    this.stateManager = new TrayStateManager()
  }

  async onInit(): Promise<void> {
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
    }
    catch (error) {
      console.error('[TrayManager] Failed to initialize tray:', error)
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
      const appConfig = getConfig(StorageList.APP_SETTING) as AppSetting
      const showTray = appConfig?.setup?.showTray

      if (showTray !== undefined) {
        return showTray !== false
      }

      return true
    }
    catch (error) {
      console.error('[TrayManager] Failed to check shouldShowTray:', error)
      return true
    }
  }

  private setupAutoStart(): void {
    try {
      const appConfig = getConfig(StorageList.APP_SETTING) as AppSetting
      const autoStart = appConfig?.setup?.autoStart ?? false
      const startSilent = appConfig?.window?.startSilent ?? false

      const options: Electron.Settings = {
        openAtLogin: autoStart,
        openAsHidden: startSilent,
      }

      app.setLoginItemSettings(options)
    }
    catch (error) {
      console.error('[TrayManager] Failed to setup auto-start:', error)
    }
  }

  public updateAutoStart(enabled: boolean): void {
    try {
      const appConfig = getConfig(StorageList.APP_SETTING) as AppSetting
      const startSilent = appConfig?.window?.startSilent ?? false

      const options: Electron.Settings = {
        openAtLogin: enabled,
        openAsHidden: enabled && startSilent,
      }

      app.setLoginItemSettings(options)
    }
    catch (error) {
      console.error('[TrayManager] Failed to update auto-start:', error)
    }
  }

  public getAutoStartStatus(): boolean {
    try {
      const loginItemSettings = app.getLoginItemSettings()
      return loginItemSettings.openAtLogin
    }
    catch (error) {
      console.error('[TrayManager] Failed to get auto-start status:', error)
      return false
    }
  }

  private bindTrayEvents(): void {
    if (!this.tray)
      return

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
      }
      else {
        mainWindow.focus()
      }
    }
    else {
      mainWindow.show()
      mainWindow.focus()
    }
  }

  public updateMenu(state?: Partial<TrayState>): void {
    if (!this.tray)
      return

    if (state) {
      this.stateManager.updateState(state)
    }

    try {
      const menu = this.menuBuilder.buildMenu(this.stateManager.getState())
      this.tray.setContextMenu(menu)
    }
    catch (error) {
      console.error('[TrayManager] Failed to update menu:', error)
    }
  }

  private registerWindowEvents(): void {
    const mainWindow = $app.window.window

    mainWindow.on('close', (event) => {
      const closeToTray = ($app.config.data as any)?.window?.closeToTray ?? true
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

    $app.channel?.regChannel(ChannelType.MAIN, 'tray:autostart:update', ({ data }) => {
      if (typeof data === 'boolean') {
        this.updateAutoStart(data)
        return true
      }
      return false
    })

    $app.channel?.regChannel(ChannelType.MAIN, 'tray:autostart:get', () => {
      return this.getAutoStartStatus()
    })
  }

  private getHideDockConfig(): boolean {
    try {
      const appConfig = getConfig(StorageList.APP_SETTING) as AppSetting
      return appConfig?.setup?.hideDock ?? false
    }
    catch (error) {
      console.error('[TrayManager] Failed to read hideDock config:', error)
      return false
    }
  }

  /**
   * Setup Dock icon on macOS
   * 在 macOS 上设置 Dock 图标
   */
  private setupDockIcon(): void {
    if (process.platform !== 'darwin')
      return

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
      }
      catch (iconError) {
        console.error(`[TrayManager] Failed to load icon from path: ${appIconPath}`, iconError)
      }
    }
    catch (error) {
      console.error('[TrayManager] Failed to setup Dock icon:', error)
    }
  }

  private updateDockVisibility(): void {
    if (process.platform !== 'darwin')
      return

    const mainWindow = $app.window.window
    const hideDock = this.getHideDockConfig()

    if (hideDock) {
      // When hideDock is enabled, show dock only when window is visible
      if (mainWindow.isVisible()) {
        app.dock?.show()
      }
      else {
        app.dock?.hide()
      }
    }
    else {
      // When hideDock is disabled, always show dock
      app.dock?.show()
    }
  }

  private setupChannels(): void {
    if (!$app.channel)
      return

    $app.channel.regChannel(ChannelType.MAIN, 'tray:show:get', () => {
      return this.tray !== null
    })

    $app.channel.regChannel(ChannelType.MAIN, 'tray:show:set', ({ data }) => {
      const show = data === true
      if (show && !this.tray) {
        this.initializeTray()
        this.updateMenu()
      }
      else if (!show && this.tray) {
        this.destroyTray()
      }
      return true
    })

    $app.channel.regChannel(ChannelType.MAIN, 'tray:hidedock:set', () => {
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
