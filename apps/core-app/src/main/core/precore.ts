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
import { runWithBeforeQuitTimeout } from './before-quit-guard'

const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel

function broadcastBeforeQuit(): void {
  const channel = ($app as { channel?: unknown } | null | undefined)?.channel
  if (!channel) return
  const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
  transport.broadcast(AppEvents.lifecycle.beforeQuit, undefined)
}

function markAppQuitting(reason: string): void {
  const appInstance = globalThis.$app as { isQuitting?: boolean } | undefined
  if (!appInstance || appInstance.isQuitting === true) return
  appInstance.isQuitting = true
  mainLog.debug('Marked app quitting state', { meta: { reason } })
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
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

// Increase renderer process V8 heap limit (main process uses NODE_OPTIONS)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512')

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

const startupBenchmarkMode = parseBooleanEnv(process.env.TUFF_STARTUP_BENCHMARK_ONCE)
if (startupBenchmarkMode) {
  mainLog.info('Startup benchmark mode enabled, skip single-instance lock')
}

if (!startupBenchmarkMode && !app.requestSingleInstanceLock()) {
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
  markAppQuitting('window-all-closed')
  touchEventBus.emit(TalexEvents.WINDOW_ALL_CLOSED, new WindowAllClosedEvent())

  if (process.platform === 'darwin') {
    return
  }

  if (!app.isPackaged && devProcessManager.isShuttingDownProcess()) {
    mainLog.debug('Development mode: skip duplicate quit while graceful shutdown is running')
    return
  }

  app.quit()
})

app.addListener('ready', (event, launchInfo) =>
  touchEventBus.emit(TalexEvents.APP_READY, new AppReadyEvent(event, launchInfo))
)

let beforeQuitFlowDone = false
let beforeQuitFlowPromise: Promise<void> | null = null
const BEFORE_QUIT_TIMEOUT_MS = 8_000

app.on('before-quit', (event) => {
  markAppQuitting('before-quit')
  if (beforeQuitFlowDone) {
    touchEventBus.emit(TalexEvents.WILL_QUIT, new BeforeAppQuitEvent(event))
    return
  }

  event.preventDefault()
  if (beforeQuitFlowPromise) {
    return
  }

  beforeQuitFlowPromise = (async () => {
    try {
      const quitEvent = new BeforeAppQuitEvent(event)
      const beforeQuitResult = await runWithBeforeQuitTimeout(
        () => touchEventBus.emitAsync(TalexEvents.BEFORE_APP_QUIT, quitEvent),
        BEFORE_QUIT_TIMEOUT_MS
      )
      if (beforeQuitResult.timedOut) {
        mainLog.error('before-quit handlers timed out, continue shutdown', {
          meta: {
            timeoutMs: BEFORE_QUIT_TIMEOUT_MS,
            durationMs: beforeQuitResult.durationMs
          }
        })
      }
    } catch (error) {
      mainLog.error('before-quit handlers failed, continue shutdown', { error })
    }
    broadcastBeforeQuit()
    mainLog.info('App quit requested')

    // Development mode: let DevProcessManager orchestrate shutdown steps.
    if (!app.isPackaged && !devProcessManager.isShuttingDownProcess()) {
      mainLog.debug('Development mode: delegating quit to DevProcessManager')
      devProcessManager.triggerGracefulShutdown()
      return
    }

    beforeQuitFlowDone = true
    app.quit()
  })()
    .catch((error) => {
      mainLog.error('before-quit cleanup flow failed', { error })
    })
    .finally(() => {
      beforeQuitFlowPromise = null
    })
})

function getRootPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), APP_FOLDER_NAME)
  }

  const appPath = app.getAppPath()

  return path.join(appPath, APP_FOLDER_NAME)
}
