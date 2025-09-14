/**
 * This file describes the pre-core of the touch app.
 * Running necessary settings or environment params before startup the touch app.
 */
import { app, crashReporter } from 'electron'
import { release } from 'os'
import path from 'path'
import { APP_FOLDER_NAME } from '../config/default'
import { checkDirWithCreate } from '../utils/common-util'
import {
  AppReadyEvent,
  AppSecondaryLaunch,
  BeforeAppQuitEvent,
  TalexEvents,
  WindowAllClosedEvent,
  touchEventBus
} from './eventbus/touch-event'
import * as log4js from 'log4js'
import { devProcessManager } from '../utils/dev-process-manager'

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

console.log('TALEX TOUCH STARTED')

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  console.warn('Secondary launch, app will quit.')

  app.on('second-instance', (event, argv, workingDirectory, additionalData) => {
    touchEventBus.emit(
      TalexEvents.APP_SECONDARY_LAUNCH,
      new AppSecondaryLaunch(event, argv, workingDirectory, additionalData)
    )
  })

  app.quit()
}

app.on('window-all-closed', () => {
  console.log('[TouchApp] All windows closed! App starts to exit ...')
  touchEventBus.emit(TalexEvents.WINDOW_ALL_CLOSED, new WindowAllClosedEvent())

  if (process.platform !== 'darwin') {
    if (!app.isPackaged) {
      console.log('[TouchApp] Development mode: Graceful shutdown initiated...')
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
  console.log('[TouchApp] App will quit!')

  if (!app.isPackaged) {
    console.log('[TouchApp] Development mode: Using DevProcessManager for cleanup...')

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
