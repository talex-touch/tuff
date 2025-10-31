import { TalexTouch } from '../types'
import { ChannelType, ITouchChannel } from '@talex-touch/utils/channel'
import { app } from 'electron'
import path from 'path'
import { MainWindowOption } from '../config/default'
import { checkDirWithCreate, checkPlatformCompatibility } from '../utils/common-util'
import { genTouchChannel } from './channel-core'
import {
  AppStartEvent,
  TalexEvents,
  touchEventBus
} from './eventbus/touch-event'
import { devProcessManager } from '../utils/dev-process-manager'
import { innerRootPath } from './precore'
import { TouchWindow } from './touch-window'
import { TouchConfig } from './touch-config'
import { ModuleManager } from './module-manager'
import { mainLog } from '../utils/logger'
import { getStartupAnalytics } from '../modules/analytics'

export class TouchApp implements TalexTouch.TouchApp {
  readonly rootPath: string = innerRootPath

  app: Electron.App

  window: TalexTouch.ITouchWindow

  config: TalexTouch.IConfiguration

  version: TalexTouch.AppVersion

  moduleManager: TalexTouch.IModuleManager<TalexEvents>

  channel: ITouchChannel

  public isQuitting = false

  constructor(app: Electron.App) {
    mainLog.info('Running under application root', {
      meta: { root: this.rootPath }
    })
    checkDirWithCreate(this.rootPath, true)

    const _windowOptions: TalexTouch.TouchWindowConstructorOptions = {
      ...MainWindowOption,
      autoShow: true
    }

    this.app = app
    this.version = app.isPackaged ? TalexTouch.AppVersion.RELEASE : TalexTouch.AppVersion.DEV

    if (!app.isPackaged) {
      devProcessManager.init()
      mainLog.debug('Development process manager initialized')
    }

    this.window = new TouchWindow(_windowOptions)
    this.channel = genTouchChannel(this)
    this.moduleManager = new ModuleManager(this, this.channel)
    this.config = new TouchConfig(this)

    app.setAppUserModelId('com.tagzxia.talex-touch')

    this.__init__().then(() => {
      mainLog.success('TouchApp runtime initialized')
    })
  }

  async __init__(): Promise<void> {
    const renderTimer = mainLog.time('Renderer boot', 'success')

    touchEventBus.emit(TalexEvents.APP_START, new AppStartEvent())

    checkDirWithCreate(this.rootPath, true)

    if (app.isPackaged || this.version === TalexTouch.AppVersion.RELEASE) {
      mainLog.info('Booting packaged build', {
        meta: { appPath: app.getAppPath() }
      })
      const url = path.join(__dirname, '..', 'renderer', 'index.html')

      this.window.window.show()
      mainLog.info('Loading renderer from file', {
        meta: { url }
      })

      await this.window.loadFile(url, {
        devtools: this.version === TalexTouch.AppVersion.DEV
      })
    } else {
      const url = process.env['ELECTRON_RENDERER_URL'] as string
      if (!url) {
        throw new Error('ELECTRON_RENDERER_URL is not set')
      }

      this.window.window.show()
      mainLog.info('Loading renderer from dev server', {
        meta: { url }
      })

      await this.window.loadURL(url, { devtools: true })
    }

    renderTimer.end('Renderer ready', {
      meta: { mode: app.isPackaged ? 'file' : 'dev-server' }
    })

    this.channel.regChannel(ChannelType.MAIN, 'app-ready', ({ header, data }) => {
      const { event } = header
      const { rendererStartTime } = data || {}

      // Use renderer's performance.timeOrigin for accurate timing
      // This ensures reload doesn't accumulate time incorrectly
      const rendererStart = rendererStartTime || Date.now()
      const currentTime = Date.now()

      // Record renderer process metrics for analytics
      const analytics = getStartupAnalytics()
      analytics.setRendererProcessMetrics({
        startTime: rendererStart,
        readyTime: currentTime,
        domContentLoaded: undefined, // Will be set by renderer
        firstInteractive: undefined, // Will be set by renderer
        loadEventEnd: undefined // Will be set by renderer
      })

      // Save metrics to history (async, don't wait)
      void analytics.saveToHistory()

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
  }

  /**
   * 完全退出应用
   */
  public quit(): void {
    this.isQuitting = true
    this.app.quit()
  }
}
