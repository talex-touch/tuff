import { TouchApp, TouchWindow, genTouchApp } from '../../../core/touch-core'
import { BoxWindowOption } from '../../../config/default'
import { app, screen, WebContentsView } from 'electron'
import path from 'path'
import { useWindowAnimation } from '@talex-touch/utils/animation/window'
import { TalexTouch } from '../../../types'
import { clipboardManager } from '../../clipboard'
import { getConfig } from '../../../core/storage'
import { sleep, StorageList, type AppSetting } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { coreBoxManager } from './manager'
import { TouchPlugin } from '../../../plugins'
import { genTouchChannel } from '../../../core/channel-core'

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
  private uiView: WebContentsView | null = null
  private uiViewFocused = false

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

    // window.window.on('blur', () => {
    //   const settings = this.getAppSettingConfig()
    //   // Access isUIMode via its public getter
    //   console.log(
    //     `[CoreBox] Blur event detected. isUIMode: ${coreBoxManager.isUIMode}, autoHide setting: ${settings.tools.autoHide}`
    //   )
    //   if (settings.tools.autoHide && !coreBoxManager.isUIMode) {
    //     // Only auto-hide if not in UI mode
    //     console.log('[CoreBox] Auto-hiding CoreBox due to blur event (not in UI mode).')
    //     coreBoxManager.trigger(false)
    //   } else if (settings.tools.autoHide && coreBoxManager.isUIMode) {
    //     console.log('[CoreBox] Blur event ignored in UI mode to prevent unintended hiding.')
    //   }
    // })

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

  public expand(length: number = 100, isUIMode: boolean = false): void {
    const height = isUIMode ? 600 : Math.min(length * 48 + 65, 550)

    const currentWindow = this.current
    if (currentWindow) {
      currentWindow.window.setMinimumSize(900, height)
      currentWindow.window.setSize(900, height)

      if (this.uiView) {
        const bounds = currentWindow.window.getBounds()
        this.uiView.setBounds({
          x: 0,
          y: 60,
          width: bounds.width,
          height: bounds.height - 60
        })
      }
    } else {
      console.error('[CoreBox] No current window available for expansion')
    }

    console.debug('[CoreBox] Expanded.')
  }

  public shrink(): void {
    if (this.uiView) {
      console.warn('[CoreBox] Cannot shrink window while UI view is attached.')
      return
    }
    this.detachUIView()

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

  public attachUIView(url: string, plugin?: TouchPlugin): void {
    const currentWindow = this.current
    if (!currentWindow) {
      console.error('[CoreBox] Cannot attach UI view: no window available.')
      return
    }

    if (this.uiView) {
      this.detachUIView()
    }

    const injections = plugin?.__getInjections__()
    const webPreferences: Electron.WebPreferences = {
      preload: injections?._.preload || undefined,
      webSecurity: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true,
      scrollBounce: true
    }

    const view = (this.uiView = new WebContentsView({ webPreferences }))

    this.uiViewFocused = true
    currentWindow.window.contentView.addChildView(this.uiView)

    this.uiView.webContents.addListener('blur', () => {
      console.log('[CoreBox] UI view blurred.')

      this.uiViewFocused = false
    })

    this.uiView.webContents.addListener('focus', () => {
      console.log('[CoreBox] UI view focused.')

      this.uiViewFocused = true
    })

    this.uiView.webContents.addListener('dom-ready', () => {
      if (plugin) {
        if (!app.isPackaged || plugin.dev.enable) {
          view.webContents.openDevTools({ mode: 'detach' })
          this.uiViewFocused = true
        }

        const channelScript = `
        (() => {
            const uniqueKey = "${plugin._uniqueChannelKey}";
            const electron = require('electron')
            const ChannelType = ${JSON.stringify(ChannelType)};
            const DataCode = ${JSON.stringify(DataCode)};

            class TouchChannel {
              channelMap = new Map();
              pendingMap = new Map();

              constructor() {
                electron.ipcRenderer.on('@plugin-process-message', this.__handle_main.bind(this));
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
                        type: ChannelType.MAIN,
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
                this.channelMap.get(rawData.name)?.forEach((func) => {
                  const handInData = {
                    reply: (code, data) => {
                      e.sender.send(
                        '@main-process-message',
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

              regChannel(eventName, callback) {
                const listeners = this.channelMap.get(eventName) || [];
                if (!listeners.includes(callback)) {
                  listeners.push(callback);
                } else {
                  return () => {};
                }
                this.channelMap.set(eventName, listeners);
                return () => {
                  const index = listeners.indexOf(callback);
                  if (index !== -1) {
                    listeners.splice(index, 1);
                  }
                };
              }

              send(eventName, arg) {
                const uniqueId = \`\${new Date().getTime()}#\${eventName}@\${Math.random().toString(12)}\`;
                const data = {
                  code: DataCode.SUCCESS,
                  data: arg,
                  sync: {
                    timeStamp: new Date().getTime(),
                    timeout: 10000,
                    id: uniqueId
                  },
                  name: eventName,
                  header: {
                    uniqueKey,
                    status: 'request',
                    type: ChannelType.PLUGIN
                  }
                };
                return new Promise((resolve) => {
                  electron.ipcRenderer.send('@plugin-process-message', data);
                  this.pendingMap.set(uniqueId, (res) => {
                    this.pendingMap.delete(uniqueId);
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
                    type: ChannelType.PLUGIN
                  }
                };
                const res = this.__parse_raw_data(null, electron.ipcRenderer.sendSync('@plugin-process-message', data));
                if (res?.header?.status === 'reply') return res.data;
                return res;
              }
            }
            window['$channel'] = new TouchChannel();
        })();
        `
        this.uiView?.webContents.executeJavaScript(channelScript)

        if (injections.js) {
          this.uiView?.webContents.executeJavaScript(injections.js)
        }
        if (injections.styles) {
          this.uiView?.webContents.insertCSS(injections.styles)
        }

        genTouchApp().channel.send(ChannelType.PLUGIN, '@plugin-lifecycle:attach-view', {
          plugin: plugin.name,
          feature: coreBoxManager.getCurrentFeature()
        })
      }
    })

    genTouchChannel().regChannel(ChannelType.PLUGIN, 'test', ({ reply, plugin }) => {
      reply(DataCode.SUCCESS, 'Hello World!' + plugin)
    })

    const bounds = currentWindow.window.getBounds()
    this.uiView.setBounds({
      x: 0,
      y: 60,
      width: bounds.width,
      height: bounds.height - 60
    })
    this.uiView.webContents.loadURL(url)

    console.log('[CoreBox] UI view attached.', url)
  }

  public detachUIView(): void {
    if (this.uiView) {
      const currentWindow = this.current
      if (currentWindow && !currentWindow.window.isDestroyed()) {
        console.log('[WindowManager] Removing child view from current window.')
        currentWindow.window.contentView.removeChildView(this.uiView)
      } else {
        console.warn(
          '[WindowManager] Cannot remove child view: current window is null or destroyed.'
        )
      }
      // The WebContents are automatically destroyed when the WebContentsView is removed.
      // Explicitly destroying them here is unnecessary and causes a type error.
      this.uiView = null
      console.log('[WindowManager] uiView set to null.')
    }
  }

  public sendToUIView(channel: string, ...args: any[]): void {
    if (this.uiView) {
      this.uiView.webContents.postMessage(channel, args)
    }
  }
}

export const windowManager = WindowManager.getInstance()

export function getCoreBoxWindow(): TouchWindow | null {
  return windowManager.current || null
}
