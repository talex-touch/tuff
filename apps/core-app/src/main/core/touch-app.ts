import { TalexTouch } from '../types'
import { ChannelType, ITouchChannel } from '@talex-touch/utils/channel'
import { app } from 'electron'
import path from 'path'
import { MainWindowOption } from '../config/default'
import { checkDirWithCreate } from '../utils/common-util'
import { genTouchChannel } from './channel-core'
import { AppStartEvent, TalexEvents, touchEventBus } from './eventbus/touch-event'
import { devProcessManager } from '../utils/dev-process-manager'
import { innerRootPath } from './precore'
import { TouchWindow } from './touch-window'
import { TouchConfig } from './touch-config'
import { ModuleManager } from './module-manager'

export class TouchApp implements TalexTouch.TouchApp {
  readonly rootPath: string = innerRootPath

  app: Electron.App

  window: TalexTouch.ITouchWindow

  config: TalexTouch.IConfiguration

  version: TalexTouch.AppVersion

  moduleManager: TalexTouch.IModuleManager<TalexEvents>

  channel: ITouchChannel

  constructor(app: Electron.App) {
    console.log('[TouchApp] App running under: ' + this.rootPath)
    checkDirWithCreate(this.rootPath, true)

    const _windowOptions: TalexTouch.TouchWindowConstructorOptions = {
      ...MainWindowOption,
      autoShow: true
    }

    this.app = app
    this.version = app.isPackaged ? TalexTouch.AppVersion.RELEASE : TalexTouch.AppVersion.DEV

    if (!app.isPackaged) {
      devProcessManager.init()
      console.log('[TouchApp] Development process manager initialized')
    }

    this.window = new TouchWindow(_windowOptions)
    this.channel = genTouchChannel(this)
    this.moduleManager = new ModuleManager(this, this.channel)
    this.config = new TouchConfig(this)

    app.setAppUserModelId('com.tagzxia.talex-touch')

    this.__init__().then(() => {
      console.log('[TouchApp] TouchApp initialized!')
    })
  }

  async __init__(): Promise<void> {
    const startTime = new Date().getTime()

    touchEventBus.emit(TalexEvents.APP_START, new AppStartEvent())

    checkDirWithCreate(this.rootPath, true)

    if (app.isPackaged || this.version === TalexTouch.AppVersion.RELEASE) {
      console.log(
        '[TouchApp] App is packaged or release version ' + __dirname,
        ' | ',
        app.getAppPath()
      )
      const url = path.join(__dirname, '..', 'renderer', 'index.html')

      this.window.window.show()
      console.log('[TouchApp] Loading (mainWindow) webContents from: ' + url)

      await this.window.loadFile(url, {
        devtools: this.version === TalexTouch.AppVersion.DEV
      })
    } else {
      const url = process.env['ELECTRON_RENDERER_URL'] as string
      if (!url) {
        throw new Error('ELECTRON_RENDERER_URL is not set')
      }

      this.window.window.show()
      console.log('[TouchApp DEV] Loading (mainWindow) webContents from: ' + url)

      await this.window.loadURL(url, { devtools: true })
    }

    console.log('[TouchApp] WebContents loaded!')

    this.channel.regChannel(ChannelType.MAIN, 'app-ready', ({ header }) => {
      const { event } = header
      // if ()
      //   genPluginManager().plugins.forEach((plugin) => {
      //       plugin.webViewInit = false;
      //     });
      // }

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
        t: {
          _s: process.getCreationTime(),
          s: startTime,
          e: new Date().getTime(),
          p: process.uptime(),
          h: process.hrtime()
        }
      }
    })
  }
}
