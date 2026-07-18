import type { WebContentsView } from 'electron'
import * as fs from 'node:fs'
import path from 'node:path'
import { StorageList } from '@talex-touch/utils'
import chalk from 'chalk'
import { app, nativeTheme } from 'electron'
import { resolveThemeStateFromStyle } from '../../../../shared/theme/theme-mode'
import { createLogger } from '../../../utils/logger'
import { getMainConfig } from '../../storage'
import defaultCoreBoxThemeCss from './theme/tuff-element.css?raw'
import { getLiveViewWebContents } from './web-contents-view-guard'

const themeLog = createLogger('CoreBox').child('Window')
const CORE_BOX_THEME_FILE_NAME = 'tuff-element.css'
const CORE_BOX_THEME_SUBDIR = ['core-box', 'theme'] as const

export interface ThemeStyleConfig {
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

export class CoreBoxThemeController {
  private readonly cssKeyByView = new WeakMap<WebContentsView, string>()
  private nativeThemeHandler: (() => void) | null = null
  private currentThemeIsDark = false
  private bundledThemeCss: string | null = null
  private activeView: WebContentsView | null = null

  public get isDark(): boolean {
    return this.currentThemeIsDark
  }

  public applyToView(view: WebContentsView): void {
    this.removeNativeThemeListener()
    this.activeView = view
    const themeStyle = this.loadThemeStyleConfig()
    const css = this.loadInternalThemeCss()
    const webContents = getLiveViewWebContents(view)

    if (webContents) {
      const previousKey = this.cssKeyByView.get(view)
      if (previousKey) {
        void webContents.removeInsertedCSS(previousKey).catch(() => {})
        this.cssKeyByView.delete(view)
      }

      void webContents
        .insertCSS(css)
        .then((key) => {
          this.cssKeyByView.set(view, key)
        })
        .catch((error) => {
          themeLog.error('Failed to inject theme variables into UI view', { error })
        })
    }

    const { followSystem, dark } = this.resolveDarkPreference(themeStyle)
    this.updateViewDarkClass(view, dark)
    this.notifyThemeChange(dark)

    if (followSystem) {
      const handler = () => {
        if (this.activeView !== view || !getLiveViewWebContents(view)) {
          return
        }
        this.updateViewDarkClass(view, nativeTheme.shouldUseDarkColors)
        this.notifyThemeChange(nativeTheme.shouldUseDarkColors)
      }
      nativeTheme.on('updated', handler)
      this.nativeThemeHandler = handler
    }
  }

  public stopFollowingSystem(): void {
    this.removeNativeThemeListener()
    this.activeView = null
  }

  private removeNativeThemeListener(): void {
    if (!this.nativeThemeHandler) {
      return
    }
    nativeTheme.removeListener('updated', this.nativeThemeHandler)
    this.nativeThemeHandler = null
  }

  private loadThemeStyleConfig(): ThemeStyleConfig {
    const config = getMainConfig(StorageList.THEME_STYLE) as ThemeStyleConfig | undefined
    if (config && typeof config === 'object') {
      return config
    }
    return {}
  }

  private resolveDarkPreference(themeStyle: ThemeStyleConfig): {
    followSystem: boolean
    dark: boolean
  } {
    const themeState = resolveThemeStateFromStyle(
      themeStyle.theme?.style,
      nativeTheme.shouldUseDarkColors
    )
    return { followSystem: themeState.auto, dark: themeState.isDark }
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
      themeLog.error('Failed to prepare theme stylesheet, falling back to default', {
        error
      })
      return defaultCss
    }
  }

  private updateViewDarkClass(view: WebContentsView, isDark: boolean): void {
    const webContents = getLiveViewWebContents(view)
    if (!webContents) {
      return
    }

    const themeLabel = isDark
      ? chalk.bgHex('#0f172a').white.bold(' DARK ')
      : chalk.bgHex('#f8fafc').black.bold(' LIGHT ')
    themeLog.info(`${chalk.magenta('Apply UI theme')} ${themeLabel}`)

    const script = `
      (() => {
        const root = document.documentElement;
        if (!root) { return; }
        const theme = '${isDark ? 'dark' : 'light'}';
        root.classList.toggle('dark', theme === 'dark');
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
      })();
    `

    void webContents.executeJavaScript(script).catch((error) => {
      themeLog.error('Failed to update UI view theme class', { error })
    })
  }

  private notifyThemeChange(isDark: boolean): void {
    this.currentThemeIsDark = isDark
    const themeLabel = isDark
      ? chalk.bgHex('#1f2937').white.bold(' DARK ')
      : chalk.bgHex('#e5e7eb').black.bold(' LIGHT ')
    themeLog.info(`${chalk.cyan('Theme ready')} ${themeLabel}`)
  }
}
