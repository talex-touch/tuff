import type { AppSetting, MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITouchEvent } from '@talex-touch/utils/eventbus'
import type {
  DownloadTaskChangedEvent,
  UpdateAvailableEvent
} from '../../core/eventbus/touch-event'
import type { TrayState } from './tray-state-manager'
import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { app, Tray } from 'electron'
import {
  TalexEvents,
  touchEventBus,
  WindowHiddenEvent,
  WindowShownEvent
} from '../../core/eventbus/touch-event'
import { useAliveTarget } from '../../hooks/use-electron-guard'
import { BaseModule } from '../abstract-base-module'
import { getMainConfig } from '../storage'
import { TrayIconProvider } from './tray-icon-provider'
import { TrayMenuBuilder } from './tray-menu-builder'
import { TrayStateManager } from './tray-state-manager'

type TrayTouchAppRuntime = {
  window: { window: Electron.BrowserWindow }
  config: { data?: unknown }
  isQuitting?: boolean
  version?: string
}

const trayManagerLog = getLogger('tray-manager')

export class TrayManager extends BaseModule {
  static key: symbol = Symbol.for('TrayManager')
  name: ModuleKey = TrayManager.key

  private tray: Tray | null = null
  private menuBuilder: TrayMenuBuilder
  private stateManager: TrayStateManager
  private appDisposers: Array<() => void> = []
  private windowDisposers: Array<() => void> = []
  private eventDisposers: Array<() => void> = []
  private touchApp: TrayTouchAppRuntime | null = null

  private readonly appEmitter = app as unknown as {
    on: (eventName: string, handler: (...args: any[]) => void) => void
    removeListener: (eventName: string, handler: (...args: any[]) => void) => void
  }

  constructor() {
    super(TrayManager.key, {
      create: false
    })
    this.menuBuilder = new TrayMenuBuilder()
    this.stateManager = new TrayStateManager()
  }

  async onInit(ctx: ModuleInitContext<any>): Promise<void> {
    this.touchApp = (ctx.runtime?.app ?? ctx.app) as TrayTouchAppRuntime
    this.menuBuilder.setTouchApp(this.touchApp as TrayTouchAppRuntime & { channel: unknown })
    this.syncWindowVisibilityState()

    if (process.platform === 'darwin') {
      this.applyActivationPolicy()
      this.setupDockIcon()
    }

    this.registerWindowEvents()
    this.registerEventListeners()

    if (this.shouldShowTray()) {
      this.initializeTray()
    }

    if (process.platform === 'darwin') {
      this.updateDockVisibility()
    }
  }

  private applyActivationPolicy(): void {
    const hideDock = this.getHideDockConfig()
    const startSilent = this.getStartSilentConfig()
    const shouldUseAccessory =
      this.shouldShowTray() && !this.shouldForceRegularInDev() && (hideDock || startSilent)
    const normalized: 'regular' | 'accessory' = shouldUseAccessory ? 'accessory' : 'regular'

    try {
      app.setActivationPolicy(normalized)
      trayManagerLog.info('Activation policy updated', { meta: { policy: normalized } })
    } catch (error) {
      trayManagerLog.warn('Failed to set activation policy', {
        meta: { policy: normalized, error }
      })
    }
  }

  private initializeTray(): void {
    if (this.tray) return

    try {
      const icon = TrayIconProvider.getIcon()
      if (icon.isEmpty()) {
        trayManagerLog.warn('Tray icon is empty, skip tray initialization')
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
      trayManagerLog.error('Failed to initialize tray', { error })
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
      trayManagerLog.error('Failed to check shouldShowTray', { error })
      return true
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
    const mainWindow = useAliveTarget(this.touchApp?.window.window)
    if (!mainWindow) return

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
      trayManagerLog.error('Failed to update menu', { error })
    }
  }

  private getCurrentWindowVisibleState(): boolean {
    const mainWindow = useAliveTarget(this.touchApp?.window.window)
    if (!mainWindow) {
      return this.stateManager.isWindowVisible()
    }

    return mainWindow.isVisible()
  }

  private syncWindowVisibilityState(): boolean {
    const visible = this.getCurrentWindowVisibleState()
    this.stateManager.setWindowVisible(visible)
    return visible
  }

  private registerAppListener(eventName: string, handler: (...args: any[]) => void): void {
    this.appEmitter.on(eventName, handler)
    this.appDisposers.push(() => {
      this.appEmitter.removeListener(eventName, handler)
    })
  }

  private registerWindowListener(eventName: string, handler: (...args: any[]) => void): void {
    const mainWindow = this.touchApp?.window.window
    if (!mainWindow) {
      return
    }
    const windowEmitter = mainWindow as unknown as {
      on: (eventName: string, listener: (...args: any[]) => void) => void
      removeListener: (eventName: string, listener: (...args: any[]) => void) => void
    }

    windowEmitter.on(eventName, handler)
    this.windowDisposers.push(() => {
      windowEmitter.removeListener(eventName, handler)
    })
  }

  private registerTouchEvent(
    eventName: TalexEvents,
    handler: (event: ITouchEvent<TalexEvents>) => void
  ): void {
    touchEventBus.on(eventName, handler)
    this.eventDisposers.push(() => {
      touchEventBus.off(eventName, handler)
    })
  }

  private registerWindowEvents(): void {
    const mainWindow = this.touchApp?.window.window
    if (!mainWindow) {
      return
    }

    this.registerWindowListener('close', (event: { preventDefault: () => void }) => {
      const safeWindow = useAliveTarget(mainWindow)
      if (!safeWindow) return
      const configData = this.touchApp?.config.data as
        | { window?: { closeToTray?: boolean } }
        | undefined
      const closeToTray = configData?.window?.closeToTray ?? true
      const isQuitting = this.touchApp?.isQuitting || false
      const canCloseToTray = this.shouldShowTray() && this.tray !== null

      if (closeToTray && !isQuitting && canCloseToTray) {
        event.preventDefault()
        safeWindow.hide()
        touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())

        if (process.platform === 'darwin') {
          this.updateDockVisibility()
        }
      }
    })

    this.registerWindowListener('show', () => {
      const safeWindow = useAliveTarget(mainWindow)
      if (!safeWindow) return
      touchEventBus.emit(TalexEvents.WINDOW_SHOWN, new WindowShownEvent())

      if (process.platform === 'darwin') {
        this.updateDockVisibility()
      }
    })

    this.registerWindowListener('hide', () => {
      const safeWindow = useAliveTarget(mainWindow)
      if (!safeWindow) return
      touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())

      if (process.platform === 'darwin') {
        this.updateDockVisibility()
      }
    })

    if (process.platform === 'darwin') {
      this.registerAppListener('activate', () => {
        const safeWindow = useAliveTarget(mainWindow)
        if (!safeWindow) return
        if (!safeWindow.isVisible()) {
          safeWindow.show()
          safeWindow.focus()
        }
      })
    }
  }

  private registerEventListeners(): void {
    this.registerTouchEvent(TalexEvents.WINDOW_HIDDEN, () => {
      this.updateMenu({ windowVisible: false })
    })

    this.registerTouchEvent(TalexEvents.WINDOW_SHOWN, () => {
      this.updateMenu({ windowVisible: true })
    })

    this.registerTouchEvent(TalexEvents.LANGUAGE_CHANGED, () => {
      this.updateMenu()
    })

    this.registerTouchEvent(
      TalexEvents.DOWNLOAD_TASK_CHANGED,
      (event: ITouchEvent<TalexEvents>) => {
        const downloadEvent = event as DownloadTaskChangedEvent
        this.updateMenu({ activeDownloads: downloadEvent.activeCount })
      }
    )

    this.registerTouchEvent(TalexEvents.UPDATE_AVAILABLE, (event: ITouchEvent<TalexEvents>) => {
      const updateEvent = event as UpdateAvailableEvent
      this.updateMenu({ hasUpdate: true, updateVersion: updateEvent.version })
    })
  }

  private getHideDockConfig(): boolean {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      return appConfig?.setup?.hideDock ?? false
    } catch (error) {
      trayManagerLog.error('Failed to read hideDock config', { error })
      return false
    }
  }

  private getStartSilentConfig(): boolean {
    try {
      const appConfig = getMainConfig(StorageList.APP_SETTING) as AppSetting
      return appConfig?.window?.startSilent ?? false
    } catch (error) {
      trayManagerLog.error('Failed to read startSilent config', { error })
      return false
    }
  }

  private shouldForceRegularInDev(): boolean {
    if (process.platform !== 'darwin') return false
    if (app.isPackaged) return false
    return this.getHideDockConfig() || this.getStartSilentConfig()
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
      if (this.touchApp?.version === 'dev') {
        app.dock.setBadge(this.touchApp.version)
      }
    } catch (error) {
      trayManagerLog.error('Failed to setup Dock icon', { error })
    }
  }

  public updateDockVisibility(): void {
    if (process.platform !== 'darwin') return

    const mainWindow = useAliveTarget(this.touchApp?.window.window)
    if (!mainWindow) return
    const hideDock = this.getHideDockConfig()
    const hasDivisionBox = this.hasActiveDivisionBox()
    const trayAvailable = this.shouldShowTray() && this.tray !== null

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

  public getRuntimeSettingsSnapshot(): {
    showTray: boolean
    hideDock: boolean
    available: boolean
    trayReady: boolean
    windowVisible: boolean
  } {
    const windowVisible = this.syncWindowVisibilityState()
    return {
      showTray: this.shouldShowTray(),
      hideDock: this.getHideDockConfig(),
      available: true,
      trayReady: this.tray !== null,
      windowVisible
    }
  }

  public applyRuntimeSettings(): {
    showTray: boolean
    hideDock: boolean
    available: boolean
    trayReady: boolean
    windowVisible: boolean
  } {
    const shouldShow = this.shouldShowTray()
    this.syncWindowVisibilityState()
    if (shouldShow) {
      if (!this.tray) {
        this.initializeTray()
      }
      this.updateMenu()
    } else if (this.tray) {
      this.destroyTray()
    }

    if (process.platform === 'darwin') {
      this.updateDockVisibility()
    }

    return this.getRuntimeSettingsSnapshot()
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

  onDestroy(): MaybePromise<void> {
    for (const dispose of this.eventDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.eventDisposers = []

    for (const dispose of this.windowDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.windowDisposers = []

    for (const dispose of this.appDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.appDisposers = []

    this.destroyTray()
  }
}

const trayManagerModule = new TrayManager()

export { trayManagerModule }
