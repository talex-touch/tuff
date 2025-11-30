import type { AppSetting } from '@talex-touch/utils'
import type { TouchApp } from '../../../core/touch-app'
import type { TouchPlugin } from '../../plugin/plugin'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sleep, StorageList } from '@talex-touch/utils'
import { useWindowAnimation } from '@talex-touch/utils/animation/window-node'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { LifecycleHooks } from '@talex-touch/utils/plugin/sdk/hooks/life-cycle'
import chalk from 'chalk'
import { app, nativeTheme, screen, WebContentsView } from 'electron'
import fse from 'fs-extra'
import { BoxWindowOption } from '../../../config/default'
import { genTouchApp } from '../../../core'
import { TouchWindow } from '../../../core/touch-window'
import { TalexTouch } from '../../../types'
import { pluginModule } from '../../plugin/plugin-module'
import { getConfig } from '../../storage'
import { createLogger } from '../../../utils/logger'
import { coreBoxManager } from './manager'
import defaultCoreBoxThemeCss from './theme/tuff-element.css?raw'

const coreBoxWindowLog = createLogger('CoreBox').child('Window')

const windowAnimation = useWindowAnimation()

const CORE_BOX_THEME_EVENT = 'core-box:theme-change'

const CORE_BOX_THEME_FILE_NAME = 'tuff-element.css'
const CORE_BOX_THEME_SUBDIR = ['core-box', 'theme'] as const

interface ThemeStyleConfig {
  theme?: {
    style?: {
      dark?: boolean
      auto?: boolean
    }
    palette?: {
      primary?: string
    }
    colors?: {
      primary?: string
    }
    primaryColor?: string
  }
  palette?: {
    primary?: string
  }
  colors?: {
    primary?: string
  }
  primaryColor?: string
}

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
  private attachedPlugin: TouchPlugin | null = null
  private nativeThemeHandler: (() => void) | null = null
  private currentThemeIsDark = false
  private bundledThemeCss: string | null = null
  private inputAllowed = false
  private clipboardAllowedTypes = 0

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

  public getAttachedPlugin(): TouchPlugin | null {
    return this.attachedPlugin
  }

  /**
   * Enable input monitoring for attached UI view
   */
  public enableInputMonitoring(): void {
    this.inputAllowed = true
    coreBoxWindowLog.info('Input monitoring enabled for UI view')
  }

  /**
   * Enable clipboard monitoring for specified types
   */
  public enableClipboardMonitoring(types: number): void {
    this.clipboardAllowedTypes = types
    coreBoxWindowLog.info(`Clipboard monitoring enabled for types: ${types.toString(2)}`)
  }

  /**
   * Send input change to UI view if allowed
   */
  public sendInputChange(input: string): void {
    if (!this.inputAllowed || !this.attachedPlugin) return

    this.sendChannelMessageToUIView('core-box:input-change', { input })
  }

  /**
   * Check if clipboard type is allowed
   */
  private isClipboardTypeAllowed(type: number): boolean {
    return (this.clipboardAllowedTypes & type) !== 0
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
      coreBoxWindowLog.debug('NewBox created, injecting development tools')

      try {
        if (app.isPackaged || this.touchApp.version === TalexTouch.AppVersion.RELEASE) {
          const url = path.join(__dirname, '..', 'renderer', 'index.html')

          await window.loadFile(url, {
            devtools: this.touchApp.version === TalexTouch.AppVersion.DEV
          })
        } else {
          const url = process.env.ELECTRON_RENDERER_URL as string

          await window.loadURL(url)

          window.openDevTools({
            mode: 'detach'
          })
        }

        window.window.hide()
      } catch (error) {
        coreBoxWindowLog.error('Failed to load content in new box window', { error })
      }
    }, 200)

    window.window.webContents.addListener('dom-ready', () => {
      coreBoxWindowLog.debug(
        `BoxWindow ${window.window.webContents.id} dom loaded, registering ...`
      )

      this.touchApp.channel.sendTo(window.window, ChannelType.MAIN, 'core-box:trigger', {
        id: window.window.webContents.id,
        show: false
      })
    })

    window.window.addListener('closed', () => {
      this.windows = this.windows.filter((w) => w !== window)
      coreBoxWindowLog.debug('BoxWindow closed')
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

    coreBoxWindowLog.info('NewBox created, WebContents loaded')

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
      coreBoxWindowLog.error('Invalid screen object', { meta: { screenId: curScreen?.id } })
      return
    }

    const { bounds } = curScreen

    if (
      typeof bounds.x !== 'number' ||
      typeof bounds.y !== 'number' ||
      typeof bounds.width !== 'number' ||
      typeof bounds.height !== 'number'
    ) {
      coreBoxWindowLog.error('Invalid screen bounds received', {
        meta: {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y
        }
      })
      return
    }

    const left = Math.round(bounds.x + bounds.width / 2 - 450)
    const top = Math.round(bounds.y + bounds.height * 0.25)

    if (isNaN(left) || isNaN(top)) {
      coreBoxWindowLog.error('Invalid position calculation', {
        meta: { left, top }
      })
      return
    }

    try {
      window.window.setPosition(left, top)
    } catch (error) {
      coreBoxWindowLog.error('Failed to set window position', { error })
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

  public expand(
    options: { length?: number; forceMax?: boolean } = {},
    isUIMode: boolean = false
  ): void {
    const { length = 0, forceMax = false } = options
    const effectiveLength = length > 0 ? length : 1
    const height = isUIMode ? 600 : forceMax ? 550 : Math.min(effectiveLength * 48 + 65, 550)

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
      coreBoxWindowLog.error('No current window available for expansion')
    }

    coreBoxWindowLog.debug('Expanded window constraints updated')
  }

  public shrink(): void {
    if (this.uiView) {
      coreBoxWindowLog.debug('Cannot shrink window while UI view is attached')
      return
    }
    this.detachUIView()

    const currentWindow = this.current
    if (currentWindow) {
      currentWindow.window.setMinimumSize(900, 60)
      currentWindow.window.setSize(900, 60, false)
    } else {
      coreBoxWindowLog.error('No current window available for shrinking')
    }
    coreBoxWindowLog.debug('Shrunk window to compact mode')
  }

  public getCurScreen(): Electron.Display {
    try {
      const cursorPoint = screen.getCursorScreenPoint()
      const curScreen = screen.getDisplayNearestPoint(cursorPoint)

      if (!curScreen) {
        coreBoxWindowLog.warn('No screen found for cursor point, using primary display')
        return screen.getPrimaryDisplay()
      }

      return curScreen
    } catch (error) {
      coreBoxWindowLog.error('Error getting current screen', { error })

      return screen.getPrimaryDisplay()
    }
  }

  public getAppSettingConfig(): AppSetting {
    return getConfig(StorageList.APP_SETTING) as AppSetting
  }

  private loadThemeStyleConfig(): ThemeStyleConfig {
    const config = getConfig('theme-style.ini') as ThemeStyleConfig | undefined
    if (config && typeof config === 'object') {
      return config
    }
    return {}
  }

  private resolveDarkPreference(themeStyle: ThemeStyleConfig): {
    followSystem: boolean
    dark: boolean
  } {
    const style = themeStyle.theme?.style
    const followSystem = style?.auto ?? true
    const dark = followSystem ? nativeTheme.shouldUseDarkColors : Boolean(style?.dark)
    return { followSystem, dark }
  }

  private resolveThemeStoragePath(): { directory: string; file: string } {
    const userDataDir = app.getPath('userData')
    const directory = path.join(userDataDir, ...CORE_BOX_THEME_SUBDIR)
    const file = path.join(directory, CORE_BOX_THEME_FILE_NAME)
    return { directory, file }
  }

  private getBundledThemeCss(): string {
    if (!this.bundledThemeCss) {
      this.bundledThemeCss = defaultCoreBoxThemeCss
    }
    return this.bundledThemeCss
  }

  private loadInternalThemeCss(): string {
    const defaultCss = this.getBundledThemeCss()
    const { directory, file } = this.resolveThemeStoragePath()

    try {
      fs.mkdirSync(directory, { recursive: true })

      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, defaultCss, 'utf-8')
        return defaultCss
      }

      const content = fs.readFileSync(file, 'utf-8')
      return content.trim().length > 0 ? content : defaultCss
    } catch (error) {
      coreBoxWindowLog.error('Failed to prepare theme stylesheet, falling back to default', {
        error
      })
      return defaultCss
    }
  }

  private applyThemeToUIView(view: WebContentsView): void {
    const themeStyle = this.loadThemeStyleConfig()
    const css = this.loadInternalThemeCss()

    if (!view.webContents.isDestroyed()) {
      void view.webContents.insertCSS(css).catch((error) => {
        coreBoxWindowLog.error('Failed to inject theme variables into UI view', { error })
      })
    }

    const { followSystem, dark } = this.resolveDarkPreference(themeStyle)
    this.updateUIViewDarkClass(view, dark)
    this.notifyThemeChange(dark)

    if (this.nativeThemeHandler) {
      nativeTheme.removeListener('updated', this.nativeThemeHandler)
      this.nativeThemeHandler = null
    }

    if (followSystem) {
      const handler = () => {
        if (!this.uiView || this.uiView !== view || view.webContents.isDestroyed()) {
          return
        }
        this.updateUIViewDarkClass(view, nativeTheme.shouldUseDarkColors)
        this.notifyThemeChange(nativeTheme.shouldUseDarkColors)
      }
      nativeTheme.on('updated', handler)
      this.nativeThemeHandler = handler
    }
  }

  private updateUIViewDarkClass(view: WebContentsView, isDark: boolean): void {
    if (view.webContents.isDestroyed()) {
      return
    }

    const themeLabel = isDark
      ? chalk.bgHex('#0f172a').white.bold(' DARK ')
      : chalk.bgHex('#f8fafc').black.bold(' LIGHT ')
    coreBoxWindowLog.info(`${chalk.magenta('Apply UI theme')} ${themeLabel}`)

    const script = `
      (() => {
        const root = document.documentElement;
        if (!root) { return; }
        root.classList.${isDark ? 'add' : 'remove'}('dark');
      })();
    `

    void view.webContents.executeJavaScript(script).catch((error) => {
      coreBoxWindowLog.error('Failed to update UI view theme class', { error })
    })
  }

  private runUIViewDarkThemeSync(): void {
    if (!this.uiView || this.uiView.webContents.isDestroyed()) {
      return
    }

    const themeLabel = this.currentThemeIsDark
      ? chalk.bgHex('#0b1120').white.bold(' DARK ')
      : chalk.bgHex('#f1f5f9').black.bold(' LIGHT ')
    coreBoxWindowLog.info(`${chalk.blue('Sync UI theme')} ${themeLabel}`)

    const script = `
      (() => {
        const root = document.documentElement;
        if (!root) { return; }
        const isDark = ${JSON.stringify(this.currentThemeIsDark)};
        if (isDark) {
          root.classList.remove('dark');
          root.classList.add('dark');
        } else {
          root.classList.add('dark');
          root.classList.remove('dark');
        }
        console.log('[CoreBox] Current app theme:', isDark ? 'dark' : 'light');
      })();
    `

    void this.uiView.webContents.executeJavaScript(script).catch((error) => {
      coreBoxWindowLog.error('Failed to synchronize UI view theme', { error })
    })
  }

  private notifyThemeChange(isDark: boolean): void {
    this.currentThemeIsDark = isDark
    const themeLabel = isDark
      ? chalk.bgHex('#1f2937').white.bold(' DARK ')
      : chalk.bgHex('#e5e7eb').black.bold(' LIGHT ')
    coreBoxWindowLog.info(`${chalk.cyan('Theme ready')} ${themeLabel}`)
    const payload = { dark: isDark }

    const currentWindow = this.current
    if (currentWindow && !currentWindow.window.isDestroyed()) {
      void this.touchApp.channel.sendTo(
        currentWindow.window,
        ChannelType.MAIN,
        CORE_BOX_THEME_EVENT,
        payload
      )
    }

    if (this.attachedPlugin) {
      this.sendChannelMessageToUIView(CORE_BOX_THEME_EVENT, payload)
    }
  }

  public attachUIView(url: string, plugin?: TouchPlugin): void {
    const currentWindow = this.current
    if (!currentWindow) {
      coreBoxWindowLog.error('Cannot attach UI view: no window available')
      return
    }

    coreBoxWindowLog.info(`AttachUIView - loading ${url}`)

    if (this.uiView) {
      coreBoxWindowLog.warn('UI view already attached, skipping re-attachment')
      return
    }

    const injections = plugin?.__getInjections__()

    // Create dynamic preload script to inject window.$plugin and window.$channel before page scripts execute
    let preloadPath = injections?._.preload
    if (plugin && injections?.js) {
      const tempPreloadPath = path.resolve(
        os.tmpdir(),
        `talex-plugin-preload-${plugin.name}-${Date.now()}.js`
      )

      let originalPreloadContent = ''
      if (injections._.preload && fse.existsSync(injections._.preload)) {
        try {
          originalPreloadContent = fse.readFileSync(injections._.preload, 'utf-8')
        } catch (error) {
          coreBoxWindowLog.warn(`Failed to read original preload: ${injections._.preload}`, {
            error
          })
        }
      }

      const channelScript = `
(function() {
  const uniqueKey = "${plugin._uniqueChannelKey}";
  const { ipcRenderer } = require('electron')
  const ChannelType = ${JSON.stringify(ChannelType)};
  const DataCode = ${JSON.stringify(DataCode)};
  const CHANNEL_DEFAULT_TIMEOUT = 10000;

  class TouchChannel {
    channelMap = new Map();
    pendingMap = new Map();

    constructor() {
      ipcRenderer.on('@plugin-process-message', this.__handle_main.bind(this));
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
              '@plugin-process-message',
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

    formatPayloadPreview(payload) {
      if (payload === null || payload === undefined) return String(payload);
      if (typeof payload === 'string') return payload.length > 200 ? payload.slice(0, 200) + '…' : payload;
      try {
        return JSON.stringify(payload);
      } catch {
        return '[unserializable]';
      }
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
      const uniqueId = Date.now() + '#' + eventName + '@' + Math.random().toString(12);
      const data = {
        code: DataCode.SUCCESS,
        data: arg,
        sync: {
          timeStamp: new Date().getTime(),
          timeout: CHANNEL_DEFAULT_TIMEOUT,
          id: uniqueId
        },
        name: eventName,
        header: {
          uniqueKey,
          status: 'request',
          type: ChannelType.PLUGIN
        }
      };
      return new Promise((resolve, reject) => {
        try {
          ipcRenderer.send('@plugin-process-message', data);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[CoreBox] Failed to send plugin channel message', {
            eventName,
            error: errorMessage,
            payloadPreview: this.formatPayloadPreview(arg)
          });
          const sendError = new Error('Failed to send plugin channel message "' + eventName + '": ' + errorMessage);
          sendError.code = 'plugin_channel_send_failed';
          reject(sendError);
          return;
        }

        const timeoutMs = data.sync?.timeout ?? CHANNEL_DEFAULT_TIMEOUT;
        const timeoutHandle = setTimeout(() => {
          if (!this.pendingMap.has(uniqueId)) return;
          this.pendingMap.delete(uniqueId);
          const timeoutError = new Error('Plugin channel request "' + eventName + '" timed out after ' + timeoutMs + 'ms');
          timeoutError.code = 'plugin_channel_timeout';
          console.warn(timeoutError.message);
          reject(timeoutError);
        }, timeoutMs);

        this.pendingMap.set(uniqueId, (res) => {
          clearTimeout(timeoutHandle);
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
      try {
        const res = this.__parse_raw_data(null, ipcRenderer.sendSync('@plugin-process-message', data));
        if (res?.header?.status === 'reply') return res.data;
        return res;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[CoreBox] Failed to sendSync plugin channel message', {
          eventName,
          error: errorMessage
        });
        throw new Error('Failed to sendSync plugin channel message "' + eventName + '": ' + errorMessage);
      }
    }
  }
  window['$channel'] = new TouchChannel();
})();
`

      const hasOriginalPreload = originalPreloadContent && originalPreloadContent.trim().length > 0
      const pluginInjectionCode = injections.js.trim()

      const combinedPreload = `
// Auto-generated preload script for plugin initialization
(function() {
  try {
    ${pluginInjectionCode};
  } catch (error) {
    console.error('[CoreBox] Failed to inject window.$plugin:', error);
  }

  try {
    ${channelScript}
  } catch (error) {
    console.error('[CoreBox] Failed to inject window.$channel:', error);
  }

  ${
    hasOriginalPreload
      ? `try {
    ${originalPreloadContent};
  } catch (error) {
    console.error('[CoreBox] Failed to execute original preload:', error);
  }`
      : '// No original preload script'
  }
})();
`
      try {
        fse.writeFileSync(tempPreloadPath, combinedPreload, 'utf-8')
        preloadPath = path.resolve(tempPreloadPath)
        coreBoxWindowLog.info(`Created dynamic preload script: ${preloadPath}`)
      } catch (error) {
        coreBoxWindowLog.error(`Failed to create preload script: ${tempPreloadPath}`, {
          error
        })
        preloadPath = injections._.preload
      }
    }

    const webPreferences: Electron.WebPreferences = {
      preload: preloadPath || undefined,
      webSecurity: false,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: true,
      contextIsolation: false,
      sandbox: false,
      webviewTag: true,
      scrollBounce: true
    }

    const view = (this.uiView = new WebContentsView({ webPreferences }))
    this.attachedPlugin = plugin ?? null

    this.uiViewFocused = true
    currentWindow.window.contentView.addChildView(this.uiView)

    this.uiView.webContents.addListener('blur', () => {
      this.uiViewFocused = false
    })

    this.uiView.webContents.addListener('focus', () => {
      this.uiViewFocused = true
    })

    // window.$plugin and window.$channel are injected via preload script before page scripts execute
    // Styles will be injected on dom-ready

    this.uiView.webContents.addListener('dom-ready', () => {
      this.applyThemeToUIView(view)
      this.runUIViewDarkThemeSync()

      if (plugin) {
        if (!app.isPackaged || plugin.dev.enable) {
          view.webContents.openDevTools({ mode: 'detach' })
          this.uiViewFocused = true
        }

        if (injections?.styles) {
          this.uiView?.webContents.insertCSS(injections.styles)
        }
        if (pluginModule.pluginManager) {
          pluginModule.pluginManager.setActivePlugin(plugin.name)
        } else {
          coreBoxWindowLog.warn('Plugin manager not available, cannot set plugin active')
        }
      }
    })

    const bounds = currentWindow.window.getBounds()
    this.uiView.setBounds({
      x: 0,
      y: 60,
      width: bounds.width,
      height: bounds.height - 60
    })

    const finalUrl = this.normalizeUIViewUrl(url, plugin)
    coreBoxWindowLog.info(`AttachUIView - resolved URL ${finalUrl}`)
    this.uiView.webContents.loadURL(finalUrl)
  }

  public detachUIView(): void {
    // Reset permissions
    this.inputAllowed = false
    this.clipboardAllowedTypes = 0

    if (this.nativeThemeHandler) {
      nativeTheme.removeListener('updated', this.nativeThemeHandler)
      this.nativeThemeHandler = null
    }

    if (this.uiView) {
      // Handle plugin state transition before detaching
      if (this.attachedPlugin && pluginModule.pluginManager) {
        const plugin = this.attachedPlugin
        // Deactivate the plugin: set to ENABLED if still enabled, send INACTIVE event
        if (plugin.status === PluginStatus.ACTIVE) {
          plugin.status = PluginStatus.ENABLED
          genTouchApp().channel.send(ChannelType.PLUGIN, `@lifecycle:${LifecycleHooks.INACTIVE}`, {
            plugin: plugin.name
          })
        }
      }

      const currentWindow = this.current
      if (currentWindow && !currentWindow.window.isDestroyed()) {
        this.uiView.webContents.closeDevTools()
        currentWindow.window.contentView.removeChildView(this.uiView)
      } else {
        coreBoxWindowLog.warn('Cannot remove child view: current window is null or destroyed')
      }
      // The WebContents are automatically destroyed when the WebContentsView is removed.
      // Explicitly destroying them here is unnecessary and causes a type error.
      this.uiView = null
      this.attachedPlugin = null
    }
  }

  public sendToUIView(channel: string, ...args: any[]): void {
    if (this.uiView) {
      this.uiView.webContents.postMessage(channel, args)
    }
  }

  public sendChannelMessageToUIView(eventName: string, data?: any): void {
    if (!this.attachedPlugin) {
      return
    }

    void this.touchApp.channel.sendToPlugin(this.attachedPlugin.name, eventName, data)
  }

  public getUIView(): WebContentsView | undefined {
    if (!this.uiView) {
      return void 0
    }

    return this.uiView
  }

  private normalizeUIViewUrl(url: string, plugin?: TouchPlugin): string {
    const isDevPlugin = Boolean(plugin && plugin.dev && plugin.dev.enable)
    if (!isDevPlugin) {
      return url
    }

    try {
      const parsed = new URL(url)
      if (parsed.hash && parsed.hash.startsWith('#/')) {
        return url
      }

      const pathWithSearch = `${parsed.pathname ?? ''}${parsed.search ?? ''}` || '/'
      const normalizedPath = pathWithSearch.startsWith('/') ? pathWithSearch : `/${pathWithSearch}`
      parsed.pathname = '/'
      parsed.search = ''
      parsed.hash = `#${normalizedPath}`
      return parsed.toString()
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      coreBoxWindowLog.warn(
        '[CoreBox] Failed to normalize plugin dev URL for hash routing, falling back.',
        { meta: { url, error: errorMessage } }
      )
      const sanitized = url.replace(/#.*$/, '').replace(/\/+$/, '')
      return `${sanitized}/#/`
    }
  }
}

export const windowManager = WindowManager.getInstance()

export function getCoreBoxWindow(): TouchWindow | undefined {
  return windowManager.current || void 0
}
