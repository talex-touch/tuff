import { TouchApp, TouchWindow, genTouchApp } from '../../../core/touch-core'
import { BoxWindowOption } from '../../../config/default'
import { app, screen } from 'electron'
import path from 'path'
import { useWindowAnimation } from '@talex-touch/utils/animation/window'
import { TalexTouch } from '../../../types'
import { clipboardManager } from '../../clipboard'
import { getConfig } from '../../../core/storage'
import { StorageList, type AppSetting } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { coreBoxManager } from './manager'

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

  private get touchApp(): TouchApp {
    if (!this._touchApp) {
      this._touchApp = genTouchApp()
    }
    return this._touchApp
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

  /**
   * 创建并初始化一个新的 CoreBox 窗口。
   */
  public async create(): Promise<TouchWindow> {
    const window = new TouchWindow({ ...BoxWindowOption })

    window.window.setVisibleOnAllWorkspaces(true)
    window.window.setAlwaysOnTop(true, 'floating')

    windowAnimation.changeWindow(window)

    setTimeout(async () => {
      console.log('[CoreBox] NewBox created, injecting developing tools ...')

      try {
        if (app.isPackaged || this.touchApp.version === TalexTouch.AppVersion.RELEASE) {
          const url = path.join(__dirname, '..', 'renderer', 'index.html')

          await window.loadFile(url, {
            devtools: this.touchApp.version === TalexTouch.AppVersion.DEV
          })
        } else {
          const url = process.env['ELECTRON_RENDERER_URL'] as string

          await window.loadURL(url)

          window.openDevTools({
            mode: 'detach'
          })
        }

        window.window.hide()
      } catch (error) {
        console.error('[CoreBox] Failed to load content in new box window:', error)
      }
    }, 200)

    window.window.webContents.addListener('dom-ready', () => {
      console.log(
        '[CoreBox] BoxWindow ' + window.window.webContents.id + ' dom loaded, registering ...'
      )

      this.touchApp.channel.sendTo(window.window, ChannelType.MAIN, 'core-box:trigger', {
        id: window.window.webContents.id,
        show: false
      })
    })

    window.window.addListener('closed', () => {
      this.windows = this.windows.filter((w) => w !== window)
      clipboardManager.unregisterWindow(window)
      console.log('[CoreBox] BoxWindow closed!')
    })

    window.window.on('blur', () => {
      const settings = this.getAppSettingConfig()
      if (settings.tools.autoHide) {
        coreBoxManager.trigger(false)
      }
    })

    console.log('[CoreBox] NewBox created, WebContents loaded!')

    this.windows.push(window)

    return window
  }

  /**
   * 根据当前屏幕和鼠标位置更新窗口位置。
   */
  public updatePosition(window: TouchWindow, curScreen?: Electron.Display): void {
    if (!curScreen) {
      curScreen = this.getCurScreen()
    }
    if (!curScreen || !curScreen.bounds) {
      console.error('[CoreBox] Invalid screen object:', curScreen)
      return
    }

    const { bounds } = curScreen

    if (
      typeof bounds.x !== 'number' ||
      typeof bounds.y !== 'number' ||
      typeof bounds.width !== 'number' ||
      typeof bounds.height !== 'number'
    ) {
      console.error('[CoreBox] Invalid bounds properties:', bounds)
      return
    }

    const left = Math.round(bounds.x + bounds.width / 2 - 450)
    const top = Math.round(bounds.y + bounds.height * 0.25)

    if (isNaN(left) || isNaN(top)) {
      console.error('[CoreBox] Invalid position calculation:', { left, top, bounds })
      return
    }

    try {
      window.window.setPosition(left, top)
    } catch (error) {
      console.error('[CoreBox] Failed to set window position:', error)
    }
  }

  public show(): void {
    const window = this.current
    if (!window) return

    this.updatePosition(window)
    window.window.showInactive()
    setTimeout(() => {
      window.window.focus()
    }, 100)
  }

  public hide(): void {
    const window = this.current
    if (!window) return

    if (process.platform !== 'darwin') {
      window.window.setPosition(-1000000, -1000000)
    }

    setTimeout(() => {
      window.window.hide()
    }, 100)
  }

  public expand(length: number = 100): void {
    const height = Math.min(length * 48 + 65, 550)

    const currentWindow = this.current
    if (currentWindow) {
      currentWindow.window.setMinimumSize(900, height)
      currentWindow.window.setSize(900, height)
    } else {
      console.error('[CoreBox] No current window available for expansion')
    }

    console.debug('[CoreBox] Expanded.')
  }

  public shrink(): void {
    const currentWindow = this.current
    if (currentWindow) {
      currentWindow.window.setMinimumSize(900, 60)
      currentWindow.window.setSize(900, 60, false)
    } else {
      console.error('[CoreBox] No current window available for shrinking')
    }
    console.debug('[CoreBox] Shrunk.')
  }

  public getCurScreen(): Electron.Display {
    try {
      const cursorPoint = screen.getCursorScreenPoint()
      const curScreen = screen.getDisplayNearestPoint(cursorPoint)

      if (!curScreen) {
        console.warn('[CoreBox] No screen found for cursor point, using primary display')
        return screen.getPrimaryDisplay()
      }

      return curScreen
    } catch (error) {
      console.error('[CoreBox] Error getting current screen:', error)

      return screen.getPrimaryDisplay()
    }
  }

  public getAppSettingConfig(): AppSetting {
    return getConfig(StorageList.APP_SETTING) as AppSetting
  }
}

export const windowManager = WindowManager.getInstance()

export function getCoreBoxWindow(): TouchWindow | null {
  return windowManager.current || null
}
