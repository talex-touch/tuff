import type { ModuleLoadMetric } from './modules/analytics'
import type { LogLevel } from './utils/logger'

import { StorageList } from '@talex-touch/utils'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import process from 'node:process'
import { app, protocol } from 'electron'
import { commonChannelModule } from './channel/common'
import { genTouchApp } from './core'
import { AllModulesLoadedEvent, TalexEvents, touchEventBus } from './core/eventbus/touch-event'
import { addonOpenerModule } from './modules/addon-opener'

import { intelligenceModule } from './modules/ai/intelligence-module'
import { analyticsModule, getStartupAnalytics } from './modules/analytics'
import { coreBoxModule } from './modules/box-tool/core-box/index'
import FileSystemWatcher from './modules/box-tool/file-system-watcher'
import { buildVerificationModule } from './modules/build-verification'
import { clipboardModule } from './modules/clipboard'
import { databaseModule } from './modules/database'
import { downloadCenterModule } from './modules/download/download-center'
import { extensionLoaderModule } from './modules/extension-loader'
import { fileProtocolModule } from './modules/file-protocol'
import { flowBusModule } from './modules/flow-bus'
// import DropManager from './modules/drop-manager'
import { shortcutModule } from './modules/global-shortcon'
import { notificationModule } from './modules/notification'
import { PermissionModule } from './modules/permission'
import { pluginModule } from './modules/plugin/plugin-module'
import { sentryModule } from './modules/sentry'
import { getMainConfig, storageModule, subscribeMainConfig } from './modules/storage'
import { permissionCheckerModule } from './modules/system/permission-checker'
import { tuffDashboardModule } from './modules/system/tuff-dashboard'
import { terminalModule } from './modules/terminal/terminal.manager'
// import { trayHolderModule } from './modules/tray-holder'
import { trayManagerModule } from './modules/tray/tray-manager'
import { updateServiceModule } from './modules/update/UpdateService'
// import PermissionCenter from './modules/permission-center'
// import ServiceCenter from './service/service-center'
import { pluginLogModule } from './service/plugin-log.service'

import { loggerManager, mainLog } from './utils/logger'
import './polyfills'
import './core/precore'

// 设置环境变量禁用 ws 模块的可选依赖
process.env.WS_NO_UTF_8_VALIDATE = 'true'
process.env.WS_NO_BUFFER_UTIL = 'true'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
])

let lastVerboseLogsState: boolean | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isLogLevel(value: unknown): value is LogLevel {
  return (
    value === 'debug' ||
    value === 'info' ||
    value === 'success' ||
    value === 'warn' ||
    value === 'error'
  )
}

function applyLoggerConfig(appSettings: unknown): void {
  const loggerConfig =
    isRecord(appSettings) && isRecord(appSettings.logger) ? appSettings.logger : null

  const levels: Record<string, LogLevel> = {}
  if (loggerConfig && isRecord(loggerConfig.levels)) {
    for (const [namespace, level] of Object.entries(loggerConfig.levels)) {
      if (isLogLevel(level)) {
        levels[namespace] = level
      }
    }
  }

  const verboseLogs =
    isRecord(appSettings) &&
    isRecord(appSettings.diagnostics) &&
    appSettings.diagnostics.verboseLogs === true
  if (verboseLogs && lastVerboseLogsState !== true) {
    mainLog.warn('================ VERBOSE LOGS ENABLED ================')
    mainLog.warn('Verbose logs increase CPU/memory/disk usage and may log file paths.')
    mainLog.warn('Disable after debugging to avoid performance impact.')
  }
  lastVerboseLogsState = verboseLogs
  if (!verboseLogs) {
    levels.FileProvider = 'warn'
  } else if (!levels.FileProvider) {
    levels.FileProvider = 'info'
  }

  const defaultLevel =
    loggerConfig && isLogLevel(loggerConfig.defaultLevel)
      ? loggerConfig.defaultLevel
      : app.isPackaged
        ? 'info'
        : 'debug'

  loggerManager.setConfig({
    defaultLevel,
    levels
  })
  ;(globalThis as typeof globalThis & { __TALEX_VERBOSE_LOGS__?: boolean }).__TALEX_VERBOSE_LOGS__ =
    verboseLogs
}

applyLoggerConfig({ diagnostics: { verboseLogs: false } })

// Permission module instance
const permissionModule = new PermissionModule()

const modulesToLoad = [
  databaseModule,
  storageModule,
  fileProtocolModule,
  shortcutModule,
  extensionLoaderModule,
  commonChannelModule,
  analyticsModule,
  permissionCheckerModule,
  permissionModule, // Plugin permission management - before plugin module
  notificationModule,
  sentryModule,
  buildVerificationModule,
  updateServiceModule,
  intelligenceModule,
  pluginModule,
  pluginLogModule,
  flowBusModule, // Flow Transfer system - after plugin module
  coreBoxModule,
  trayManagerModule,
  addonOpenerModule,
  clipboardModule,
  tuffDashboardModule,
  FileSystemWatcher,
  terminalModule,
  downloadCenterModule
]

// Record when Electron becomes ready
let electronReadyTime: number

// Pre-initialize Sentry before `app.whenReady()` to satisfy @sentry/electron requirements.
try {
  sentryModule.preInitBeforeReady()
} catch (error) {
  mainLog.warn('Failed to pre-initialize Sentry', { error })
}

app.whenReady().then(async () => {
  electronReadyTime = Date.now()
  const startupTimer = mainLog.time('All modules loaded', 'success')
  mainLog.info('Electron ready, bootstrapping modules')

  const analytics = getStartupAnalytics()
  const touchApp = genTouchApp()
  const moduleLoadMetrics: ModuleLoadMetric[] = []
  const modulesStartTime = Date.now()

  // Load modules and track individual load times
  for (let i = 0; i < modulesToLoad.length; i++) {
    const moduleCtor = modulesToLoad[i]
    const moduleStartTime = Date.now()

    await touchApp.moduleManager.loadModule(moduleCtor)

    const moduleLoadTime = Date.now() - moduleStartTime
    // Convert module name to string (handle symbol case)
    const moduleName =
      typeof moduleCtor.name === 'string'
        ? moduleCtor.name
        : typeof moduleCtor.name === 'symbol'
          ? moduleCtor.name.toString()
          : `Module${i}`

    moduleLoadMetrics.push({
      name: moduleName,
      loadTime: moduleLoadTime,
      order: i
    })

    analytics.trackModuleLoad(moduleName, moduleLoadTime, i)

    if (moduleCtor === storageModule) {
      try {
        const appSettings = getMainConfig(StorageList.APP_SETTING)
        applyLoggerConfig(appSettings)
        subscribeMainConfig(StorageList.APP_SETTING, (data) => {
          applyLoggerConfig(data)
        })
      } catch (error) {
        mainLog.warn('Failed to load logger configuration', { error })
      }
    }
  }

  const totalModulesLoadTime = Date.now() - modulesStartTime

  // Set main process metrics
  analytics.setMainProcessMetrics({
    processCreationTime: process.getCreationTime() || Date.now(),
    electronReadyTime,
    modulesLoadTime: totalModulesLoadTime,
    totalModules: modulesToLoad.length,
    moduleDetails: moduleLoadMetrics
  })

  touchEventBus.emit(TalexEvents.ALL_MODULES_LOADED, new AllModulesLoadedEvent())

  // Start the global polling service after all modules are loaded.
  pollingService.start()

  startupTimer.end('All modules loaded', {
    meta: { modules: modulesToLoad.length }
  })
})
