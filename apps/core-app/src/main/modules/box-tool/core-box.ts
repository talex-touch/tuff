import { clipboardManager } from '../clipboard'
import { genTouchApp, TouchApp, TouchWindow } from '../../core/touch-core'
import { BoxWindowOption } from '../../config/default'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { globalShortcut, screen, app } from 'electron'
import { TalexTouch } from '../../types'
import path from 'path'
import { getConfig } from '../../core/storage'
import { StorageList, type AppSetting } from '@talex-touch/utils'
import { useWindowAnimation } from '@talex-touch/utils/animation/window.ts'
import { SearchEngineCore } from './search-engine/search-core'

let touchApp: TouchApp
let coreBoxManagerInstance: CoreBoxManager | null = null
const windowAnimation = useWindowAnimation()

/**
 * Gets the current CoreBox window instance for direct communication
 * @returns The current CoreBox window or null if not available
 */
export function getCoreBoxWindow(): TouchWindow | null {
  return coreBoxManagerInstance?.nowWindow || null
}

/**
 * Creates a new CoreBox window with the specified options and initializes it.
 * This function handles the creation of a new BrowserWindow, loading the appropriate
 * content based on whether the app is packaged, and setting up event listeners.
 *
 * @param closeCallback - Callback function that is called when the window is closed.
 *                        Receives the closed TouchWindow instance as a parameter.
 * @returns A Promise that resolves to the created TouchWindow instance.
 */
async function createNewBoxWindow(
  closeCallback: (window: TouchWindow) => void
): Promise<TouchWindow> {
  const window = new TouchWindow({ ...BoxWindowOption })

  windowAnimation.changeWindow(window)

  setTimeout(async () => {
    console.log('[CoreBox] NewBox created, injecting developing tools ...')

    try {
      if (app.isPackaged || touchApp.version === TalexTouch.AppVersion.RELEASE) {
        const url = path.join(__dirname, '..', 'renderer', 'index.html')

        await window.loadFile(url, {
          devtools: touchApp.version === TalexTouch.AppVersion.DEV
        })
      } else {
        const url = process.env['ELECTRON_RENDERER_URL'] as string

        await window.loadURL(url /* , { devtools: true } */)

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

    touchApp.channel.sendTo(window.window, ChannelType.MAIN, 'core-box:trigger', {
      id: window.window.webContents.id,
      show: false
    })
  })

  window.window.addListener('closed', () => {
    closeCallback(window)

    clipboardManager.unregisterWindow(window)

    console.log('[CoreBox] BoxWindow closed!')
  })

  clipboardManager.registerWindow(window)

  console.log('[CoreBox] NewBox created, WebContents loaded!')

  return window
}

export class CoreBoxManager {
  #_show: boolean
  #_expand: number
  windows: Array<TouchWindow>
  searchEngine: SearchEngineCore

  lastWindow: Electron.Display | null

  constructor() {
    this.#_show = false
    this.#_expand = 0
    this.windows = []
    this.lastWindow = null
    this.searchEngine = new SearchEngineCore()

    // Always match the last window => popover window
    this.init().then(() => this.register())
  }

  /**
   * Performs a search using the search engine.
   * @param keyword - The search keyword.
   * @returns A promise that resolves to the search results.
   */
  async search(keyword: string): Promise<any> {
    return this.searchEngine.search({ text: keyword })
  }

  /**
   * Gets the singleton instance of CoreBoxManager.
   * @returns The CoreBoxManager instance or null if not initialized.
   */
  static getInstance(): CoreBoxManager | null {
    return coreBoxManagerInstance
  }

  /**
   * Gets the current screen based on cursor position.
   * @returns The current screen display or primary display if not found.
   */
  get getCurScreen(): Electron.Display {
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

  /**
   * Gets the application setting configuration.
   * @returns The application setting configuration.
   */
  getAppSettingConfig(): AppSetting {
    return getConfig(StorageList.APP_SETTING) as AppSetting
  }

  /**
   * Initializes the CoreBoxManager by creating a new box window.
   * @returns A promise that resolves when initialization is complete.
   */
  async init(): Promise<void> {
    const w = await createNewBoxWindow((window: TouchWindow) => {
      this.windows = this.windows.filter((w) => w !== window)
    })

    this.initWindow(w)

    this.windows.push(w)
  }

  /**
   * Initializes a window with event listeners.
   * @param window - The TouchWindow to initialize.
   */
  initWindow(window: TouchWindow): void {
    window.window.addListener('blur', () => {
      if (this.nowWindow !== window) return

      const appSettingConfig = this.getAppSettingConfig()

      if (!appSettingConfig.tools?.autoHide) return

      if (this.#_show) this.trigger(false)
    })

    // register clipboard listen in clipboard manager
    clipboardManager.registerWindow(window)
  }

  /**
   * Gets the show state of the core box.
   * @returns True if the core box is shown, false otherwise.
   */
  get showCoreBox(): boolean {
    return this.#_show
  }

  /**
   * Gets the current window.
   * @returns The current TouchWindow or undefined if no windows exist.
   */
  get nowWindow(): TouchWindow | undefined {
    return this.windows[this.windows.length - 1]
  }

  /**
   * Updates the window position based on the screen bounds.
   * @param window - The TouchWindow to position.
   * @param screen - The Electron.Display to position the window on.
   */
  updateWindowPos(window: TouchWindow, screen: Electron.Display): void {
    if (!screen || !screen.bounds) {
      console.error('[CoreBox] Invalid screen object:', screen)
      return
    }

    const { bounds } = screen

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
      window.window.show()
      setTimeout(() => {
        window.window.focus()
      }, 100)
    } catch (error) {
      console.error('[CoreBox] Failed to set window position:', error)
    }
  }

  /**
   * Registers global shortcuts and channel listeners.
   */
  register(): void {
    globalShortcut.register('CommandOrControl+E', () => {
      const curScreen = this.getCurScreen
      if (this.lastWindow && curScreen && curScreen.id !== this.lastWindow.id) {
        const currentWindow = this.nowWindow
        if (currentWindow) {
          this.updateWindowPos(currentWindow, curScreen)
          this.lastWindow = curScreen
        } else {
          console.error('[CoreBox] No current window available')
        }
      } else this.trigger(!this.#_show)
    })

    // globalShortcut.register("CommandOrControl+D", () => {
    //   const w = this.nowWindow;
    //   if (!w.window.isFocused()) return;

    //   console.log("divide");
    // });
    touchApp.channel.regChannel(ChannelType.MAIN, 'file:extract-icon', async ({ data, reply }) => {
      try {
        const { path } = data as { path: string }
        const fileIcon = (await import('extract-file-icon')).default
        if (typeof fileIcon !== 'function') {
          return
        }

        const buffer = fileIcon(path, 32)
        reply(DataCode.SUCCESS, {
          buffer
        })
      } catch (error) {
        console.log('Cannot find target file icon:', path, error)
      }
    })

    touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:hide', () => this.trigger(false))
    touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:expand', ({ data }: any) =>
      data ? this.expand(data) : this.shrink()
    )
    touchApp.channel.regChannel(ChannelType.MAIN, 'core-box:search', async ({ data, reply }) => {
      const { keyword } = data
      const results = await this.search(keyword)
      reply(DataCode.SUCCESS, results)
    })
  }

  /**
   * Expands the core box window to accommodate more content.
   * @param length - The expansion length (default: 100).
   */
  expand(length: number = 100): void {
    this.#_expand = length

    const height = Math.min(length * 48 + 65, 550)

    const currentWindow = this.nowWindow
    if (currentWindow) {
      currentWindow.window.setMinimumSize(900, height)
      currentWindow.window.setSize(900, height, process.platform === 'darwin')
    } else {
      console.error('[CoreBox] No current window available for expansion')
    }

    console.debug('[CoreBox] Expanded.')
  }

  /**
   * Shrinks the core box window to its default size.
   */
  shrink(): void {
    this.#_expand = 0

    const currentWindow = this.nowWindow
    if (currentWindow) {
      currentWindow.window.setMinimumSize(900, 60)
      currentWindow.window.setSize(900, 60, false)
    } else {
      console.error('[CoreBox] No current window available for shrinking')
    }
    console.debug('[CoreBox] Shrunk.')
  }

  lastTrigger: number = -1

  /**
   * Triggers the core box window to show or hide.
   * @param show - True to show the window, false to hide it.
   * @returns void
   */
  trigger(show: boolean): void {
    if (Date.now() - this.lastTrigger < 200) return
    this.lastTrigger = Date.now()

    this.#_show = show

    const w = this.nowWindow
    if (!w) {
      console.error('[CoreBox] No current window available for trigger')
      return
    }

    // TypeScript doesn't recognize that w is not undefined after the check above
    // So we use a non-null assertion operator to tell TypeScript that w is definitely not undefined
    const window = w!

    window.window.setAlwaysOnTop(show)

    if (show) {
      if (!this.#_expand) {
        window.window.setMinimumSize(900, 60)
        window.window.setSize(900, 60, false)
      } else this.expand(this.#_expand)

      touchApp.channel.sendTo(window.window, ChannelType.MAIN, 'core-box:trigger', {
        id: window.window.webContents.id,
        show: true
      })

      const curScreen = (this.lastWindow = this.getCurScreen)

      if (curScreen) {
        this.updateWindowPos(window, curScreen)
      } else {
        console.error('[CoreBox] Invalid screen for positioning:', {
          curScreen,
          window
        })
      }
    } else {
      window.window.setPosition(-1000000, -1000000)

      setTimeout(() => {
        this.shrink()

        window.window.hide()
      }, 100)
    }

    touchApp.channel.sendTo(window.window, ChannelType.MAIN, 'core-box:trigger', {
      id: window.window.webContents.id,
      show
    })
  }
}

export default {
  name: Symbol('CoreBox'),
  filePath: 'corebox',
  listeners: new Array<() => void>(),
  init() {
    touchApp = genTouchApp()
    coreBoxManagerInstance = new CoreBoxManager()

    // const touchChannel = genTouchChannel();

    // this.listeners.push(
    //   touchChannel.regChannel(ChannelType.MAIN, 'core-box:trigger', ({ data }) => {
    //     const { key } = data!

    //   })
    // )

    console.log('[CoreBox] Core box initialized!')
  },
  destroy() {
    this.listeners.forEach((listener) => listener())
  }
}
