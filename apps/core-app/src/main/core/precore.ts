import { release } from 'node:os'
import path from 'node:path'
import process from 'node:process'
/**
 * This file describes the pre-core of the touch app.
 * Running necessary settings or environment params before startup the touch app.
 */
import { app, crashReporter } from 'electron'
import * as log4js from 'log4js'
import { AppEvents, getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { APP_FOLDER_NAME } from '../config/default'
import { checkDirWithCreate } from '../utils/common-util'
import { devProcessManager } from '../utils/dev-process-manager'
import { mainLog } from '../utils/logger'
import {
  AppReadyEvent,
  AppSecondaryLaunch,
  BeforeAppQuitEvent,
  TalexEvents,
  touchEventBus,
  WindowAllClosedEvent
} from './eventbus/touch-event'

const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel

function broadcastBeforeQuit(): void {
  const channel = ($app as { channel?: unknown } | null | undefined)?.channel
  if (!channel) return
  const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
  transport.broadcast(AppEvents.lifecycle.beforeQuit, undefined)
}

export const innerRootPath = getRootPath()

const logs = path.join(innerRootPath, 'logs')
checkDirWithCreate(logs)

app.setPath('crashDumps', path.join(logs, 'crashes'))

crashReporter.start({
  companyName: 'TalexTouch',
  productName: 'TalexTouch',
  submitURL: '',
  uploadToServer: false,
  ignoreSystemCrashHandler: false,
  extra: {
    version: app.getVersion()
  }
})

log4js.configure({
  appenders: {
    all: {
      type: 'dateFile',
      keepFileExt: true,
      filename: path.join(logs, 'D'),
      maxLogSize: 10485760,
      backups: 3,
      compress: true,
      alwaysIncludePattern: true,
      pattern: 'yyyy-MM-dd.log'
    },
    out: {
      type: 'stdout'
    },
    err: {
      type: 'stderr'
    },
    error: {
      type: 'dateFile',
      keepFileExt: true,
      filename: path.join(logs, 'E'),
      maxLogSize: 10485760,
      backups: 3,
      compress: true,
      alwaysIncludePattern: true,
      pattern: 'yyyy-MM-dd.err'
    }
  },
  categories: {
    default: {
      appenders: ['all', 'out'],
      level: 'INFO'
    },
    error: {
      appenders: ['all', 'err', 'error'],
      level: 'ERROR'
    }
  }
})

mainLog.success('Talex Touch bootstrap started')

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  mainLog.warn('Secondary launch detected, quitting existing process')

  app.on('second-instance', (event, argv, workingDirectory, additionalData) => {
    const launchData =
      typeof additionalData === 'object' && additionalData !== null
        ? (additionalData as Record<string, unknown>)
        : {}
    touchEventBus.emit(
      TalexEvents.APP_SECONDARY_LAUNCH,
      new AppSecondaryLaunch(event, argv, workingDirectory, launchData)
    )
  })

  app.quit()
}

app.on('window-all-closed', () => {
  mainLog.info('All windows closed, preparing shutdown')
  touchEventBus.emit(TalexEvents.WINDOW_ALL_CLOSED, new WindowAllClosedEvent())

  if (process.platform !== 'darwin') {
    if (!app.isPackaged) {
      mainLog.debug('Development mode: scheduling graceful shutdown')
      setTimeout(() => {
        app.quit()
        process.exit(0)
      }, 200)
    } else {
      app.quit()
      process.exit(0)
    }
  }
})

app.addListener('ready', (event, launchInfo) =>
  touchEventBus.emit(TalexEvents.APP_READY, new AppReadyEvent(event, launchInfo))
)

app.on('before-quit', (event) => {
  touchEventBus.emit(TalexEvents.BEFORE_APP_QUIT, new BeforeAppQuitEvent(event))
  broadcastBeforeQuit()
  mainLog.info('App quit requested')

  if (!app.isPackaged) {
    mainLog.debug('Development mode: delegating quit to DevProcessManager')

    // Forbidden default quit behavior, let DevProcessManager handle it
    if (!devProcessManager.isShuttingDownProcess()) {
      event.preventDefault()
      devProcessManager.triggerGracefulShutdown()
      return
    }
  }

  touchEventBus.emit(TalexEvents.WILL_QUIT, new BeforeAppQuitEvent(event))
})

function getRootPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), APP_FOLDER_NAME)
  }

  const appPath = app.getAppPath()

  return path.join(appPath, APP_FOLDER_NAME)
}
