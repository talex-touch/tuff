import { Tray } from 'electron'
import { BaseModule } from '../abstract-base-module'
import { MaybePromise, ModuleKey } from '@talex-touch/utils'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { TrayIconProvider } from './tray-icon-provider'
import { TrayMenuBuilder } from './tray-menu-builder'
import { TrayStateManager, TrayState } from './tray-state-manager'
import {
  touchEventBus,
  DownloadTaskChangedEvent,
  UpdateAvailableEvent
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

    this.registerEventListeners()
  }

  /**
   * 初始化托盘图标
   */
  private initializeTray(): void {
    try {
      const icon = TrayIconProvider.getIcon()

      console.log('[TrayManager] Creating tray with data URL icon...')

      this.tray = new Tray(icon)

      // 设置 Tooltip
      this.tray.setToolTip('Talex Touch') // TODO: 使用 i18n

      // 绑定点击事件
      this.bindTrayEvents()

      // 构建菜单
      this.updateMenu()

      console.log('[TrayManager] Tray initialized successfully with data URL icon')
    } catch (error) {
      console.error('[TrayManager] Failed to initialize tray:', error)
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
   * 注册事件监听器
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
