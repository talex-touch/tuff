import { BoxWindowOption } from '../../../config/default'
import { app, screen, WebContentsView, nativeTheme } from 'electron'
import path from 'path'
import * as fs from 'fs'
import { createRequire } from 'module'
import chalk from 'chalk'
import { useWindowAnimation } from '@talex-touch/utils/animation/window'
import { TalexTouch } from '../../../types'
import { getConfig } from '../../storage'
import { sleep, StorageList, type AppSetting } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { coreBoxManager } from './manager'
import { TouchPlugin } from '../../../plugins'
import { LifecycleHooks } from '@talex-touch/utils/plugin/sdk/hooks/life-cycle'
import { TouchWindow } from '../../../core/touch-window'
import { TouchApp } from '../../../core/touch-app'
import { genTouchApp } from '../../../core'

const windowAnimation = useWindowAnimation()

const CORE_BOX_THEME_EVENT = 'core-box:theme-change'

const require = createRequire(import.meta.url)

const ELEMENT_PLUS_BASE_CSS = fs
  .readFileSync(require.resolve('element-plus/theme-chalk/base.css'), 'utf-8')
  .replace(/@charset\s+"UTF-8";?/, '')

const ELEMENT_PLUS_DARK_CSS = fs.readFileSync(
  require.resolve('element-plus/theme-chalk/dark/css-vars.css'),
  'utf-8'
)

type ThemeStyleConfig = {
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

interface ThemeTone {
  primary: string
  primaryRgb: string
  primaryHover: string
  primaryActive: string
  page: string
  background: string
  surface: string
  border: string
  text: string
  textSecondary: string
  shadow: string
}

interface ThemePalette {
  light: ThemeTone
  dark: ThemeTone
}

const DEFAULT_PRIMARY_COLOR = '#409eff'
const DEFAULT_DARK_PRIMARY_COLOR = '#409eff'

const LIGHT_TONE_BASE = {
  page: '#f2f3f5',
  background: '#ffffff',
  surface: '#ffffff',
  border: '#dcdfe6',
  text: '#303133',
  textSecondary: '#606266',
  shadowAlpha: 0.12
}

const DARK_TONE_BASE = {
  page: '#0a0a0a',
  background: '#141414',
  surface: '#1d1e1f',
  border: '#4c4d4f',
  text: '#e5eaf3',
  textSecondary: '#cfd3dc',
  shadowAlpha: 0.36
}

const PRIMARY_HOVER_OFFSET = 0.12
const PRIMARY_ACTIVE_OFFSET = -0.14
const DARK_PRIMARY_SHIFT = 0.22

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

  private resolvePrimaryColors(themeStyle: ThemeStyleConfig): { light: string; dark: string } {
    const lightPrimary =
      this.pickValidColor([
        themeStyle.theme?.palette?.primary,
        themeStyle.theme?.colors?.primary,
        themeStyle.theme?.primaryColor,
        themeStyle.palette?.primary,
        themeStyle.colors?.primary,
        themeStyle.primaryColor
      ]) ?? DEFAULT_PRIMARY_COLOR

    const darkPalette = themeStyle.theme?.palette as Record<string, string | undefined> | undefined
    const darkColors = themeStyle.theme?.colors as Record<string, string | undefined> | undefined
    const rootPalette = themeStyle.palette as Record<string, string | undefined> | undefined
    const rootColors = themeStyle.colors as Record<string, string | undefined> | undefined
    const fallbackDark = this.adjustColor(lightPrimary, DARK_PRIMARY_SHIFT) ?? undefined
    const darkPrimaryCandidate =
      this.pickValidColor([
        darkPalette?.['primary-dark'],
        darkPalette?.primaryDark,
        darkColors?.primaryDark,
        rootPalette?.['primary-dark'],
        rootPalette?.primaryDark,
        rootColors?.primaryDark,
      ]) ?? undefined

    const darkPrimary =
      this.pickValidColor([darkPrimaryCandidate, fallbackDark]) ??
      fallbackDark ??
      DEFAULT_DARK_PRIMARY_COLOR

    return { light: lightPrimary, dark: darkPrimary }
  }

  private pickValidColor(candidates: Array<string | undefined | null>): string | null {
    for (const color of candidates) {
      if (this.isValidHexColor(color)) {
        return color
      }
    }
    return null
  }

  private isValidHexColor(color?: string | null): color is string {
    if (!color || typeof color !== 'string') return false
    const trimmed = color.trim()
    return /^#([\da-fA-F]{6}|[\da-fA-F]{3})$/.test(trimmed)
  }

  private hexToRgb(color: string): [number, number, number] | null {
    const match = color.trim().match(/^#([\da-fA-F]{3}|[\da-fA-F]{6})$/)
    if (!match) return null

    let value = match[1]
    if (value.length === 3) {
      value = value
        .split('')
        .map((char) => char + char)
        .join('')
    }

    const numericValue = parseInt(value, 16)
    const r = (numericValue >> 16) & 255
    const g = (numericValue >> 8) & 255
    const b = numericValue & 255
    return [r, g, b]
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (channel: number) =>
      Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  private adjustColor(color: string, amount: number): string | null {
    const rgb = this.hexToRgb(color)
    if (!rgb) {
      return null
    }

    const adjustChannel = (channel: number) => {
      const clampedAmount = Math.max(-1, Math.min(1, amount))
      const adjustedValue =
        clampedAmount < 0
          ? channel * (1 + clampedAmount)
          : channel + (255 - channel) * clampedAmount
      return Math.round(Math.max(0, Math.min(255, adjustedValue)))
    }

    const [r, g, b] = rgb.map((channel) => adjustChannel(channel)) as [number, number, number]
    return this.rgbToHex(r, g, b)
  }

  private mixColor(color: string, mixWith: string, weight: number): string | null {
    const baseRgb = this.hexToRgb(color)
    const mixRgb = this.hexToRgb(mixWith)
    if (!baseRgb || !mixRgb) {
      return null
    }

    const ratio = Math.max(0, Math.min(1, weight))

    const result = baseRgb.map((channel, index) => {
      const mixChannel = mixRgb[index]
      return Math.round(channel * (1 - ratio) + mixChannel * ratio)
    }) as [number, number, number]

    return this.rgbToHex(result[0], result[1], result[2])
  }

  private buildPrimaryVariants(
    tone: ThemeTone,
    lightMixColor: string,
    darkMixColor: string
  ): {
    light3: string
    light5: string
    light7: string
    light8: string
    light9: string
    dark2: string
  } {
    const light3 = this.mixColor(tone.primary, lightMixColor, 0.3) ?? tone.primary
    const light5 = this.mixColor(tone.primary, lightMixColor, 0.5) ?? tone.primary
    const light7 = this.mixColor(tone.primary, lightMixColor, 0.7) ?? tone.primary
    const light8 = this.mixColor(tone.primary, lightMixColor, 0.8) ?? tone.primary
    const light9 = this.mixColor(tone.primary, lightMixColor, 0.9) ?? tone.primary
    const dark2 = this.mixColor(tone.primary, darkMixColor, 0.2) ?? tone.primary

    return { light3, light5, light7, light8, light9, dark2 }
  }

  private toRgbString(color: string): string {
    const rgb = this.hexToRgb(color)
    if (!rgb) {
      return '0, 0, 0'
    }
    return rgb.join(', ')
  }

  private createThemeTone(options: {
    primary: string
    hoverOffset: number
    activeOffset: number
    page: string
    background: string
    surface: string
    border: string
    text: string
    textSecondary: string
    shadowAlpha: number
  }): ThemeTone {
    const primaryHover = this.adjustColor(options.primary, options.hoverOffset) ?? options.primary
    const primaryActive = this.adjustColor(options.primary, options.activeOffset) ?? options.primary
    const primaryRgb = this.toRgbString(options.primary)
    const shadowAlpha = Math.max(0, Math.min(1, options.shadowAlpha))

    return {
      primary: options.primary,
      primaryRgb,
      primaryHover,
      primaryActive,
      page: options.page,
      background: options.background,
      surface: options.surface,
      border: options.border,
      text: options.text,
      textSecondary: options.textSecondary,
      shadow: `rgba(${primaryRgb}, ${shadowAlpha})`
    }
  }

  private buildThemePalette(themeStyle: ThemeStyleConfig): ThemePalette {
    const { light, dark } = this.resolvePrimaryColors(themeStyle)

    return {
      light: this.createThemeTone({
        primary: light,
        hoverOffset: PRIMARY_HOVER_OFFSET,
        activeOffset: PRIMARY_ACTIVE_OFFSET,
        page: LIGHT_TONE_BASE.page,
        background: LIGHT_TONE_BASE.background,
        surface: LIGHT_TONE_BASE.surface,
        border: LIGHT_TONE_BASE.border,
        text: LIGHT_TONE_BASE.text,
        textSecondary: LIGHT_TONE_BASE.textSecondary,
        shadowAlpha: LIGHT_TONE_BASE.shadowAlpha
      }),
      dark: this.createThemeTone({
        primary: dark,
        hoverOffset: PRIMARY_HOVER_OFFSET,
        activeOffset: PRIMARY_ACTIVE_OFFSET,
        page: DARK_TONE_BASE.page,
        background: DARK_TONE_BASE.background,
        surface: DARK_TONE_BASE.surface,
        border: DARK_TONE_BASE.border,
        text: DARK_TONE_BASE.text,
        textSecondary: DARK_TONE_BASE.textSecondary,
        shadowAlpha: DARK_TONE_BASE.shadowAlpha
      })
    }
  }

  private generateThemeVariablesCSS(palette: ThemePalette): string {
    const { light, dark } = palette
    const lightPrimaryVariants = this.buildPrimaryVariants(light, '#ffffff', '#000000')
    const darkPrimaryVariants = this.buildPrimaryVariants(dark, dark.background, '#ffffff')

    return `${ELEMENT_PLUS_BASE_CSS}
${ELEMENT_PLUS_DARK_CSS}

:root {
  color-scheme: light;
  --el-color-primary: ${light.primary};
  --el-color-primary-rgb: ${light.primaryRgb};
  --el-color-primary-light-3: ${lightPrimaryVariants.light3};
  --el-color-primary-light-5: ${lightPrimaryVariants.light5};
  --el-color-primary-light-7: ${lightPrimaryVariants.light7};
  --el-color-primary-light-8: ${lightPrimaryVariants.light8};
  --el-color-primary-light-9: ${lightPrimaryVariants.light9};
  --el-color-primary-dark-2: ${lightPrimaryVariants.dark2};
  --el-bg-color: ${light.background};
  --el-bg-color-page: ${light.page};
  --el-bg-color-overlay: ${light.surface};
}

html.dark {
  color-scheme: dark;
  --el-color-primary: ${dark.primary};
  --el-color-primary-rgb: ${dark.primaryRgb};
  --el-color-primary-light-3: ${darkPrimaryVariants.light3};
  --el-color-primary-light-5: ${darkPrimaryVariants.light5};
  --el-color-primary-light-7: ${darkPrimaryVariants.light7};
  --el-color-primary-light-8: ${darkPrimaryVariants.light8};
  --el-color-primary-light-9: ${darkPrimaryVariants.light9};
  --el-color-primary-dark-2: ${darkPrimaryVariants.dark2};
  --el-bg-color: ${dark.background};
  --el-bg-color-page: ${dark.page};
  --el-bg-color-overlay: ${dark.surface};
}
    `
  }

  private applyThemeToUIView(view: WebContentsView): void {
    const themeStyle = this.loadThemeStyleConfig()
    const palette = this.buildThemePalette(themeStyle)
    const css = this.generateThemeVariablesCSS(palette)

    if (!view.webContents.isDestroyed()) {
      void view.webContents.insertCSS(css).catch((error) => {
        console.error('[CoreBox] Failed to inject theme variables into UI view:', error)
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
    console.log(`${chalk.gray('[CoreBox]')} ${chalk.magenta('Apply UI theme')} ${themeLabel}`)

    const script = `
      (() => {
        const root = document.documentElement;
        if (!root) { return; }
        root.classList.${isDark ? 'add' : 'remove'}('dark');
      })();
    `

    void view.webContents.executeJavaScript(script).catch((error) => {
      console.error('[CoreBox] Failed to update UI view theme class:', error)
    })
  }

  private runUIViewDarkThemeSync(): void {
    if (!this.uiView || this.uiView.webContents.isDestroyed()) {
      return
    }

    const themeLabel = this.currentThemeIsDark
      ? chalk.bgHex('#0b1120').white.bold(' DARK ')
      : chalk.bgHex('#f1f5f9').black.bold(' LIGHT ')
    console.log(`${chalk.gray('[CoreBox]')} ${chalk.blue('Sync UI theme')} ${themeLabel}`)

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
      console.error('[CoreBox] Failed to synchronize UI view theme:', error)
    })
  }

  private notifyThemeChange(isDark: boolean): void {
    this.currentThemeIsDark = isDark
    const themeLabel = isDark
      ? chalk.bgHex('#1f2937').white.bold(' DARK ')
      : chalk.bgHex('#e5e7eb').black.bold(' LIGHT ')
    console.log(`${chalk.gray('[CoreBox]')} ${chalk.cyan('Theme ready')} ${themeLabel}`)
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
      console.error('[CoreBox] Cannot attach UI view: no window available.')
      return
    }

    if (this.uiView) {
      // this.detachUIView()
      console.warn('[CoreBox] UI view already attached, skipping re-attachment.')
      return
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
    this.attachedPlugin = plugin ?? null

    this.uiViewFocused = true
    currentWindow.window.contentView.addChildView(this.uiView)

    this.uiView.webContents.addListener('blur', () => {
      this.uiViewFocused = false
    })

    this.uiView.webContents.addListener('focus', () => {
      this.uiViewFocused = true
    })

    this.uiView.webContents.addListener('dom-ready', () => {
      this.applyThemeToUIView(view)
      this.runUIViewDarkThemeSync()

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
                console.debug(e, arg)
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

        genTouchApp().channel.sendToPlugin(plugin.name, '@lifecycle:' + LifecycleHooks.ACTIVE, {
          plugin: plugin.name,
          feature: coreBoxManager.getCurrentFeature()
        })
      }
    })

    const bounds = currentWindow.window.getBounds()
    this.uiView.setBounds({
      x: 0,
      y: 60,
      width: bounds.width,
      height: bounds.height - 60
    })
    this.uiView.webContents.loadURL(url)
  }

  public detachUIView(): void {
    if (this.nativeThemeHandler) {
      nativeTheme.removeListener('updated', this.nativeThemeHandler)
      this.nativeThemeHandler = null
    }

    if (this.uiView) {
      const currentWindow = this.current
      if (currentWindow && !currentWindow.window.isDestroyed()) {
        this.uiView.webContents.closeDevTools()
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
      this.attachedPlugin = null
      console.log('[WindowManager] uiView set to null.')
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
}

export const windowManager = WindowManager.getInstance()

export function getCoreBoxWindow(): TouchWindow | undefined {
  return windowManager.current || void 0
}
