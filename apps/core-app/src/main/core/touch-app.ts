import type { ITouchChannel } from '@talex-touch/utils/channel'
import path from 'node:path'
import { ChannelType } from '@talex-touch/utils/channel'
import { app, BrowserWindow, dialog, screen } from 'electron'
import fse from 'fs-extra'
import { MainWindowOption } from '../config/default'
import { getStartupAnalytics } from '../modules/analytics'
import { storageModule } from '../modules/storage'
import { TalexTouch } from '../types'
import { checkDirWithCreate, checkPlatformCompatibility } from '../utils/common-util'
import { devProcessManager } from '../utils/dev-process-manager'
import { mainLog } from '../utils/logger'
import { genTouchChannel } from './channel-core'
import {
  getDisplayLayoutSignature,
  normalizeBoundsToDisplays,
  pickBestMainWindowBounds,
  upsertMainWindowStateProfile
} from './main-window-state'
import { AppStartEvent, TalexEvents, touchEventBus } from './eventbus/touch-event'
import { ModuleManager } from './module-manager'
import { innerRootPath } from './precore'
import { TouchConfig } from './touch-config'
import { TouchWindow } from './touch-window'

export class TouchApp implements TalexTouch.TouchApp {
  readonly rootPath: string = innerRootPath

  app: Electron.App

  window: TalexTouch.ITouchWindow

  config: TalexTouch.IConfiguration

  version: TalexTouch.AppVersion

  moduleManager: TalexTouch.IModuleManager<TalexEvents>

  channel: ITouchChannel

  public isQuitting = false

  private _startSilent = false

  private mainWindowBoundsSaveTimer: NodeJS.Timeout | null = null

  /**
   * Read app-setting.ini directly from disk before StorageModule is initialized.
   */
  private readAppSettingsConfigFromDisk(): Record<string, unknown> {
    try {
      const configPath = path.join(this.rootPath, 'modules', 'config', 'app-setting.ini')
      if (fse.existsSync(configPath)) {
        const content = fse.readFileSync(configPath, 'utf-8')
        if (content.length > 0) {
          const parsed: unknown = JSON.parse(content)
          if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
        }
      }
    } catch (error) {
      mainLog.warn('Failed to read app-setting.ini from disk', { error })
    }
    return {}
  }

  private resolveInitialMainWindowBounds(
    appSettings: Record<string, unknown>
  ): Electron.Rectangle | null {
    try {
      const displays = screen.getAllDisplays()
      const primary = screen.getPrimaryDisplay()

      const defaultSize = {
        width: typeof MainWindowOption.width === 'number' ? MainWindowOption.width : 1100,
        height: typeof MainWindowOption.height === 'number' ? MainWindowOption.height : 680
      }
      const minSize = {
        width: typeof MainWindowOption.minWidth === 'number' ? MainWindowOption.minWidth : 0,
        height: typeof MainWindowOption.minHeight === 'number' ? MainWindowOption.minHeight : 0
      }

      const layoutSignature = getDisplayLayoutSignature(displays)
      const state = (appSettings as { window?: { mainWindowState?: unknown } }).window
        ?.mainWindowState
      const picked = pickBestMainWindowBounds(
        state,
        layoutSignature,
        displays,
        primary,
        defaultSize,
        minSize
      )

      if (picked.reason !== 'default') {
        mainLog.debug('Restoring main window bounds', {
          meta: { reason: picked.reason, layout: layoutSignature }
        })
      }

      return picked.bounds as Electron.Rectangle
    } catch (error) {
      mainLog.warn('Failed to resolve initial main window bounds', { error })
      return null
    }
  }

  private async showFileNotFoundDialog(filePath: string, triedPaths: string[]): Promise<void> {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

    const triedPathsText = triedPaths.join('\n')
    const detail = `Cannot find renderer entry file:\n${filePath}\n\nPlease check if the application installation is complete.\n\nDebug information:\n- app.getAppPath(): ${app.getAppPath()}\n- __dirname: ${__dirname}\n- process.resourcesPath: ${process.resourcesPath || 'N/A'}\n- Tried paths:\n${triedPathsText}`

    await dialog.showMessageBox(window || undefined, {
      type: 'error',
      title: 'File Not Found',
      message: 'Cannot find this file.',
      detail,
      buttons: ['OK'],
      defaultId: 0,
      noLink: true
    })
  }

  constructor(app: Electron.App) {
    mainLog.info('Running under application root', {
      meta: { root: this.rootPath }
    })
    checkDirWithCreate(this.rootPath, true)

    const appSettingsFromDisk = this.readAppSettingsConfigFromDisk()

    this._startSilent = appSettingsFromDisk?.window?.startSilent === true
    const initialBounds = this.resolveInitialMainWindowBounds(appSettingsFromDisk)

    const _windowOptions: TalexTouch.TouchWindowConstructorOptions = {
      ...MainWindowOption,
      autoShow: !this._startSilent,
      ...(initialBounds ?? {})
    }

    this.app = app
    this.version = app.isPackaged ? TalexTouch.AppVersion.RELEASE : TalexTouch.AppVersion.DEV

    if (!app.isPackaged) {
      devProcessManager.init()
      mainLog.debug('Development process manager initialized')
    }

    if (this._startSilent) {
      mainLog.info('Silent start mode enabled, window will not auto-show')
    }

    this.window = new TouchWindow(_windowOptions)
    this.registerMainWindowBoundsPersistence()
    this.channel = genTouchChannel(this)
    this.moduleManager = new ModuleManager(this, this.channel)
    this.config = new TouchConfig(this)

    // Disable Ctrl+R / Cmd+R reload in production
    this.window.window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'r' && (input.control || input.meta)) {
        if (app.isPackaged) {
          event.preventDefault()
        }
      }
    })

    app.setAppUserModelId('com.tagzxia.talex-touch')

    this.__init__().then(() => {
      mainLog.success('TouchApp runtime initialized')
    })
  }

  private registerMainWindowBoundsPersistence(): void {
    const win = this.window.window

    const scheduleSave = () => {
      if (this.mainWindowBoundsSaveTimer) {
        clearTimeout(this.mainWindowBoundsSaveTimer)
      }

      this.mainWindowBoundsSaveTimer = setTimeout(() => {
        this.mainWindowBoundsSaveTimer = null
        this.persistMainWindowBounds()
      }, 320)
    }

    win.on('resize', scheduleSave)
    win.on('move', scheduleSave)

    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, () => {
      scheduleSave()
    })
  }

  private persistMainWindowBounds(): void {
    if (!storageModule.filePath) {
      return
    }

    const win = this.window.window
    if (win.isDestroyed()) return

    const rawBounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds()

    const displays = screen.getAllDisplays()
    const primary = screen.getPrimaryDisplay()
    const minSize = {
      width: typeof MainWindowOption.minWidth === 'number' ? MainWindowOption.minWidth : 0,
      height: typeof MainWindowOption.minHeight === 'number' ? MainWindowOption.minHeight : 0
    }

    const layoutSignature = getDisplayLayoutSignature(displays)
    const bounds = normalizeBoundsToDisplays(rawBounds, displays, primary, minSize)

    try {
      const appSettings = storageModule.getConfig('app-setting.ini') as Record<string, unknown>
      upsertMainWindowStateProfile(appSettings, layoutSignature, bounds)
      storageModule.saveConfig('app-setting.ini', appSettings, false, false)
    } catch (error) {
      mainLog.warn('Failed to persist main window bounds', { error })
    }
  }

  async __init__(): Promise<void> {
    const renderTimer = mainLog.time('Renderer boot', 'success')

    touchEventBus.emit(TalexEvents.APP_START, new AppStartEvent())

    checkDirWithCreate(this.rootPath, true)

    this.channel.regChannel(ChannelType.MAIN, 'app-ready', ({ header, data }) => {
      const { event } = header
      const { rendererStartTime } = data || {}

      // Use renderer's performance.timeOrigin for accurate timing
      // This ensures reload doesn't accumulate time incorrectly
      const rendererStart = rendererStartTime || Date.now()
      const currentTime = Date.now()

      const senderWebContents = event?.sender as Electron.WebContents | undefined
      const senderId = senderWebContents?.id
      const primaryRendererId = this.window.window.webContents.id

      if (senderId === primaryRendererId) {
        // Record renderer process metrics for analytics (primary window only).
        const analytics = getStartupAnalytics()
        analytics.setRendererProcessMetrics({
          startTime: rendererStart,
          readyTime: currentTime,
          domContentLoaded: undefined, // Will be set by renderer
          firstInteractive: undefined, // Will be set by renderer
          loadEventEnd: undefined // Will be set by renderer
        })
      }

      return {
        id: (event?.sender as Electron.WebContents).id,
        version: this.version,
        path: {
          rootPath: this.rootPath,
          appPath: app.getAppPath(),
          appDataPath: app.getPath('appData'),
          userDataPath: app.getPath('userData'),
          tempPath: app.getPath('temp'),
          homePath: app.getPath('home'),
          exePath: app.getPath('exe'),
          modulePath: path.join(this.rootPath, 'modules'),
          configPath: path.join(this.rootPath, 'config'),
          pluginPath: path.join(this.rootPath, 'plugins')
        },
        isPackaged: app.isPackaged,
        isDev: this.version === TalexTouch.AppVersion.DEV,
        isRelease: this.version === TalexTouch.AppVersion.RELEASE,
        platform: process.platform,
        arch: process.arch,
        platformWarning: checkPlatformCompatibility(),
        t: {
          _s: process.getCreationTime(),
          s: rendererStart,
          e: currentTime,
          p: process.uptime(),
          h: process.hrtime()
        }
      }
    })

    const startSilent = this._startSilent

    if (app.isPackaged || this.version === TalexTouch.AppVersion.RELEASE) {
      mainLog.info('Booting packaged build', {
        meta: { appPath: app.getAppPath() }
      })

      // Try multiple paths for index.html
      const appPath = app.getAppPath()
      const possiblePaths = [
        path.join(__dirname, '..', 'renderer', 'index.html'),
        path.join(appPath, 'renderer', 'index.html'),
        ...(process.resourcesPath
          ? [
              path.join(process.resourcesPath, 'app', 'renderer', 'index.html'),
              path.join(process.resourcesPath, 'renderer', 'index.html')
            ]
          : []),
        // Additional macOS-specific paths
        ...(process.platform === 'darwin'
          ? [
              path.resolve(appPath, '..', '..', '..', 'Resources', 'app', 'renderer', 'index.html'),
              path.resolve(__dirname, '..', '..', 'renderer', 'index.html')
            ]
          : [])
      ]

      mainLog.info('Checking for index.html', {
        meta: {
          __dirname: String(__dirname),
          appPath,
          resourcesPath: process.resourcesPath || 'N/A',
          possiblePaths: possiblePaths.join(', ')
        }
      })

      let url = possiblePaths[0]
      let found = false

      for (const testPath of possiblePaths) {
        const exists = fse.existsSync(testPath)
        mainLog.debug(`Checking path: ${testPath}`, {
          meta: { exists }
        })

        if (exists) {
          url = testPath
          found = true
          mainLog.info(`Found index.html at: ${testPath}`)
          break
        }
      }

      if (!found) {
        // Log all debug information before showing dialog
        console.error('[TouchApp] index.html not found!')
        console.error('[TouchApp] __dirname:', __dirname)
        console.error('[TouchApp] app.getAppPath():', appPath)
        console.error('[TouchApp] process.resourcesPath:', process.resourcesPath || 'N/A')
        console.error('[TouchApp] Tried paths:')
        possiblePaths.forEach((p, i) => {
          console.error(`[TouchApp]   ${i + 1}. ${p} (exists: ${fse.existsSync(p)})`)
        })

        const errorMsg = `index.html not found. Tried paths:\n${possiblePaths.join('\n')}`
        mainLog.error('Renderer file not found', {
          meta: {
            triedPaths: possiblePaths.join(', '),
            appPath: app.getAppPath(),
            __dirname: String(__dirname),
            resourcesPath: process.resourcesPath || 'N/A'
          }
        })

        await this.showFileNotFoundDialog(url, possiblePaths)
        throw new Error(errorMsg)
      }

      if (!startSilent) {
        this.window.window.show()
      } else {
        mainLog.info('Starting in silent mode (hidden to tray)')
      }
      mainLog.info('Loading renderer from file', {
        meta: { url }
      })

      try {
        await this.window.loadFile(url, {
          devtools: this.version === TalexTouch.AppVersion.DEV
        })
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        mainLog.error('Failed to load renderer file', {
          meta: { url, error: errorMsg }
        })

        await this.showFileNotFoundDialog(url, possiblePaths)
        throw error
      }
    } else {
      const url = process.env.ELECTRON_RENDERER_URL as string
      if (!url) {
        throw new Error('ELECTRON_RENDERER_URL is not set')
      }

      if (!startSilent) {
        this.window.window.show()
      } else {
        mainLog.info('Starting in silent mode (hidden to tray)')
      }
      mainLog.info('Loading renderer from dev server', {
        meta: { url }
      })

      await this.window.loadURL(url, { devtools: this.version === TalexTouch.AppVersion.DEV })
    }

    renderTimer.end('Renderer ready', {
      meta: { mode: app.isPackaged ? 'file' : 'dev-server' }
    })
  }

  /**
   * 完全退出应用
   */
  public quit(): void {
    this.isQuitting = true
    this.app.quit()
  }
}
