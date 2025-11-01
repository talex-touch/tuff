import { Tray, app } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { MaybePromise, ModuleKey, ChannelType } from '@talex-touch/utils'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { TrayIconProvider } from './tray-icon-provider'
import { TrayMenuBuilder } from './tray-menu-builder'
import { TrayStateManager, TrayState } from './tray-state-manager'
import {
  touchEventBus,
  DownloadTaskChangedEvent,
  UpdateAvailableEvent,
  WindowHiddenEvent,
  WindowShownEvent
} from '../../core/eventbus/touch-event'
import type { ITouchEvent } from '@talex-touch/utils/eventbus'

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
      create: false
    })
    this.menuBuilder = new TrayMenuBuilder()
    this.stateManager = new TrayStateManager()
  }

  async onInit(): Promise<void> {
    this.initializeTray()
    this.registerWindowEvents()
    this.registerEventListeners()
    this.setupAutoStart()

    if (process.platform === 'darwin') {
      const mainWindow = $app.window.window
      const startSilent = ($app.config.data as any)?.window?.startSilent ?? false

      if (startSilent && !mainWindow.isVisible()) {
        app.dock?.hide()
        console.log('[TrayManager] Dock icon hidden on init (silent start enabled)')
      }
    }
  }

  private initializeTray(): void {
    try {
      const iconPath = TrayIconProvider.getIconPath()
      const icon = TrayIconProvider.getIcon()

      if (icon.isEmpty()) {
        console.error('[TrayManager] Icon is empty, cannot create tray')
        console.error('[TrayManager] Icon path:', iconPath)
        return
      }

      const size = icon.getSize()
      console.log('[TrayManager] Creating tray with icon, size:', size)
      console.log('[TrayManager] Icon path:', iconPath)

      if (process.platform === 'darwin') {
        try {
          console.log('[TrayManager] Attempting to create tray with file path:', iconPath)
          this.tray = new Tray(iconPath)
          console.log('[TrayManager] Successfully created tray with file path')
        } catch (pathError) {
          console.warn('[TrayManager] Failed to create tray with file path, trying NativeImage:', pathError)

          try {
            this.tray = new Tray(icon)
            console.log('[TrayManager] Successfully created tray with NativeImage')
          } catch (imageError) {
            console.error('[TrayManager] Failed to create tray with NativeImage:', imageError)
            throw imageError
          }
        }
      } else {
        this.tray = new Tray(icon)
      }

      if (!this.tray) {
        console.error('[TrayManager] Failed to create Tray instance')
        return
      }

      if (process.platform === 'darwin') {
        const nativeIcon = TrayIconProvider.getIcon()
        if (!nativeIcon.isEmpty()) {
          nativeIcon.setTemplateImage(true)
          this.tray.setImage(nativeIcon)
          console.log('[TrayManager] Set template image for macOS dark mode support')
        }
      }

      this.tray.setToolTip('Talex Touch')

      this.bindTrayEvents()
      this.updateMenu()

      if (process.platform === 'darwin') {
        const retryDelays = [100, 500, 1000]
        retryDelays.forEach((delay) => {
          setTimeout(() => {
            if (this.tray) {
              const newIcon = TrayIconProvider.getIcon()
              if (!newIcon.isEmpty()) {
                newIcon.setTemplateImage(true)
                this.tray.setImage(newIcon)
                console.log(`[TrayManager] Re-set tray icon after ${delay}ms`)
              }
              this.updateMenu()
            }
          }, delay)
        })

        console.log('[TrayManager] Tray created on macOS, icon should be visible in menu bar')
        console.log('[TrayManager] If icon is not visible, check macOS menu bar settings')
        console.log('[TrayManager] System Preferences > Dock & Menu Bar > Menu Bar')
      }

      ;(global as any).__trayInstance = this.tray
      console.log('[TrayManager] Tray instance saved to global scope for debugging')

      console.log('[TrayManager] Tray initialized successfully')
    } catch (error) {
      console.error('[TrayManager] Failed to initialize tray:', error)
      console.error('[TrayManager] Error details:', error instanceof Error ? error.stack : error)
    }
  }

  /**
   * Setup auto-start on login
   */
  private setupAutoStart(): void {
    try {
      const autoStart = ($app.config.data as any)?.autoStart ?? false

      const options: Electron.Settings = {
        openAtLogin: autoStart,
        openAsHidden: ($app.config.data as any)?.window?.startSilent ?? false
      }

      const wasSet = app.setLoginItemSettings(options)

      console.log('[TrayManager] Auto-start configured:', {
        enabled: autoStart,
        wasSet,
        options
      })

      if (autoStart && !wasSet) {
        console.warn('[TrayManager] Failed to set auto-start, may require user permission')
      }
    } catch (error) {
      console.error('[TrayManager] Failed to setup auto-start:', error)
    }
  }

  /**
   * Update auto-start setting
   * @param enabled - Whether to enable auto-start
   */
  public updateAutoStart(enabled: boolean): void {
    try {
      const startSilent = ($app.config.data as any)?.window?.startSilent ?? false

      const options: Electron.Settings = {
        openAtLogin: enabled,
        openAsHidden: enabled && startSilent
      }

      const wasSet = app.setLoginItemSettings(options)

      console.log('[TrayManager] Auto-start updated:', {
        enabled,
        wasSet,
        options
      })

      if (enabled && !wasSet) {
        console.warn('[TrayManager] Failed to set auto-start, may require user permission')
      }
    } catch (error) {
      console.error('[TrayManager] Failed to update auto-start:', error)
    }
  }

  /**
   * Get current auto-start status
   * @returns Current auto-start status
   */
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

    if (process.platform === 'darwin') {
      this.tray.on('double-click', this.handleTrayDoubleClick.bind(this))
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

  private handleTrayDoubleClick(): void {
    const mainWindow = $app.window.window

    if (!mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    }
  }

  /**
   * Update tray menu
   * @param state - Optional state update
   */
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
      const closeToTray = ($app.config.data as any)?.window?.closeToTray ?? true
      const isQuitting = $app.isQuitting || false

      if (closeToTray && !isQuitting) {
        event.preventDefault()
        mainWindow.hide()
        touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())
        console.log('[TrayManager] Window hidden to tray instead of closing')
      }
    })

    mainWindow.on('show', () => {
      touchEventBus.emit(TalexEvents.WINDOW_SHOWN, new WindowShownEvent())

      if (process.platform === 'darwin') {
        const startSilent = ($app.config.data as any)?.window?.startSilent ?? false
        if (startSilent) {
          app.dock?.show()
          console.log('[TrayManager] Dock icon shown (window visible)')
        }
      }
    })

    mainWindow.on('hide', () => {
      touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())

      if (process.platform === 'darwin') {
        const startSilent = ($app.config.data as any)?.window?.startSilent ?? false
        if (startSilent) {
          app.dock?.hide()
          console.log('[TrayManager] Dock icon hidden (window hidden)')
        }
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

    console.log('[TrayManager] Event listeners registered')
  }

  onDestroy(): MaybePromise<void> {
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
    console.log('[TrayManager] Module destroyed')
  }
}

const trayManagerModule = new TrayManager()

export { trayManagerModule }
