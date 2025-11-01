import { Tray, app } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { MaybePromise, ModuleKey } from '@talex-touch/utils'
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
 * TrayManager - Main tray manager
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

    // macOS: 如果启用了静默启动且窗口是隐藏的，隐藏 Dock 图标
    if (process.platform === 'darwin') {
      const mainWindow = $app.window.window
      const startSilent = ($app.config.data as any)?.window?.startSilent ?? false

      if (startSilent && !mainWindow.isVisible()) {
        app.dock?.hide()
        console.log('[TrayManager] Dock icon hidden on init (silent start enabled)')
      }
    }
  }

  /**
   * 初始化托盘图标
   */
  private initializeTray(): void {
    try {
      // 方法1: 尝试直接使用文件路径（Electron 也支持这种方式）
      const iconPath = TrayIconProvider.getIconPath()
      const icon = TrayIconProvider.getIcon()

      // 验证图标是否为空
      if (icon.isEmpty()) {
        console.error('[TrayManager] Icon is empty, cannot create tray')
        console.error('[TrayManager] Icon path:', iconPath)
        return
      }

      // 检查图标尺寸
      const size = icon.getSize()
      console.log('[TrayManager] Creating tray with icon, size:', size)
      console.log('[TrayManager] Icon path:', iconPath)

      // macOS: 尝试两种方式创建托盘
      if (process.platform === 'darwin') {
        // 方法1: 使用文件路径直接创建（类似旧版本的方式）
        try {
          console.log('[TrayManager] Attempting to create tray with file path:', iconPath)
          this.tray = new Tray(iconPath)
          console.log('[TrayManager] Successfully created tray with file path')
        } catch (pathError) {
          console.warn('[TrayManager] Failed to create tray with file path, trying NativeImage:', pathError)

          // 方法2: 使用 NativeImage，但不设置模板图像（先试试不设置模板）
          try {
            this.tray = new Tray(icon)
            console.log('[TrayManager] Successfully created tray with NativeImage (no template)')
          } catch (imageError) {
            console.error('[TrayManager] Failed to create tray with NativeImage:', imageError)
            throw imageError
          }
        }
      } else {
        // 非 macOS 平台直接使用 NativeImage
        this.tray = new Tray(icon)
      }

      // 验证托盘是否创建成功
      if (!this.tray) {
        console.error('[TrayManager] Failed to create Tray instance')
        return
      }

      // macOS: 如果使用 NativeImage，尝试设置模板图像
      if (process.platform === 'darwin' && iconPath) {
        // 如果文件路径方式失败，使用 NativeImage 方式并设置模板
        const nativeIcon = TrayIconProvider.getIcon()
        if (!nativeIcon.isEmpty()) {
          nativeIcon.setTemplateImage(true)
          this.tray.setImage(nativeIcon)
          console.log('[TrayManager] Set template image for macOS')
        }
      }

      // 设置 Tooltip
      this.tray.setToolTip('Talex Touch') // TODO: 使用 i18n

      // 绑定点击事件
      this.bindTrayEvents()

      // 构建菜单（macOS 上必须设置菜单才能显示托盘图标）
      this.updateMenu()

      // macOS: 确保托盘图标可见 - 尝试多次设置以确保显示
      if (process.platform === 'darwin') {
        // 延迟多次尝试设置以确保显示
        [100, 500, 1000].forEach((delay) => {
          setTimeout(() => {
            if (this.tray) {
              // 重新设置图标
              const newIcon = TrayIconProvider.getIcon()
              if (!newIcon.isEmpty()) {
                newIcon.setTemplateImage(true)
                this.tray.setImage(newIcon)
                console.log(`[TrayManager] Re-set tray icon after ${delay}ms`)
              }

              // 重新设置菜单
              this.updateMenu()
            }
          }, delay)
        })

        console.log('[TrayManager] Tray created on macOS, icon should be visible in menu bar')
        console.log('[TrayManager] If icon is not visible, check macOS menu bar settings')
      }

      // 确保托盘实例不会被垃圾回收 - 导出到全局作用域用于调试
      ;(global as any).__trayInstance = this.tray
      console.log('[TrayManager] Tray instance saved to global scope for debugging')

      console.log('[TrayManager] Tray initialized successfully')
    } catch (error) {
      console.error('[TrayManager] Failed to initialize tray:', error)
      console.error('[TrayManager] Error details:', error instanceof Error ? error.stack : error)
    }
  }

  /**
   * 绑定托盘事件
   */
  private bindTrayEvents(): void {
    if (!this.tray) return

    // 左键单击
    this.tray.on('click', this.handleTrayClick.bind(this))

    // 双击（仅 macOS）
    if (process.platform === 'darwin') {
      this.tray.on('double-click', this.handleTrayDoubleClick.bind(this))
    }
  }

  /**
   * 处理托盘图标左键单击
   */
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

  /**
   * 处理托盘图标双击（仅 macOS）
   */
  private handleTrayDoubleClick(): void {
    const mainWindow = $app.window.window

    if (!mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    }
  }

  /**
   * 更新托盘菜单
   * @param state 可选的状态更新
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

  /**
   * 注册窗口事件监听器
   */
  private registerWindowEvents(): void {
    const mainWindow = $app.window.window

    // 窗口关闭事件处理 - 根据设置决定是否最小化到托盘
    mainWindow.on('close', (event) => {
      // 从存储读取用户设置
      const closeToTray = ($app.config.data as any)?.window?.closeToTray ?? true

      // 检查是否正在退出应用
      const isQuitting = $app.isQuitting || false

      if (closeToTray && !isQuitting) {
        // 阻止默认关闭行为
        event.preventDefault()

        // 隐藏窗口到托盘
        mainWindow.hide()

        // 触发窗口隐藏事件
        touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())

        console.log('[TrayManager] Window hidden to tray instead of closing')
      }
    })

    // 窗口显示事件
    mainWindow.on('show', () => {
      touchEventBus.emit(TalexEvents.WINDOW_SHOWN, new WindowShownEvent())

      // macOS: 如果启用了静默启动，显示 Dock 图标
      if (process.platform === 'darwin') {
        const startSilent = ($app.config.data as any)?.window?.startSilent ?? false
        if (startSilent) {
          const { app } = require('electron')
          app.dock?.show()
          console.log('[TrayManager] Dock icon shown (window visible)')
        }
      }
    })

    // 窗口隐藏事件
    mainWindow.on('hide', () => {
      touchEventBus.emit(TalexEvents.WINDOW_HIDDEN, new WindowHiddenEvent())

      // macOS: 如果启用了静默启动，隐藏 Dock 图标
      if (process.platform === 'darwin') {
        const startSilent = ($app.config.data as any)?.window?.startSilent ?? false
        if (startSilent) {
          const { app } = require('electron')
          app.dock?.hide()
          console.log('[TrayManager] Dock icon hidden (window hidden)')
        }
      }
    })

    // macOS: 处理 Dock 图标点击
    if (process.platform === 'darwin') {
      const { app } = require('electron')
      app.on('activate', () => {
        if (!mainWindow.isVisible()) {
          mainWindow.show()
          mainWindow.focus()
        }
      })
    }
  }

  /**
   * 注册应用事件监听器
   */
  private registerEventListeners(): void {
    // 窗口显示/隐藏事件
    touchEventBus.on(TalexEvents.WINDOW_HIDDEN, () => {
      this.updateMenu({ windowVisible: false })
    })

    touchEventBus.on(TalexEvents.WINDOW_SHOWN, () => {
      this.updateMenu({ windowVisible: true })
    })

    // 语言变更事件
    touchEventBus.on(TalexEvents.LANGUAGE_CHANGED, () => {
      // 重新构建菜单以更新语言
      this.updateMenu()
    })

    // 下载任务变化事件
    touchEventBus.on(TalexEvents.DOWNLOAD_TASK_CHANGED, (event: ITouchEvent<TalexEvents>) => {
      const downloadEvent = event as DownloadTaskChangedEvent
      this.updateMenu({ activeDownloads: downloadEvent.activeCount })
    })

    // 更新可用事件
    touchEventBus.on(TalexEvents.UPDATE_AVAILABLE, (event: ITouchEvent<TalexEvents>) => {
      const updateEvent = event as UpdateAvailableEvent
      this.updateMenu({ hasUpdate: true, updateVersion: updateEvent.version })
    })

    console.log('[TrayManager] Event listeners registered')
  }

  /**
   * 销毁托盘
   */
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
