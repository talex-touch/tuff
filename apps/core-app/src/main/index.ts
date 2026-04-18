import type { ModuleLoadMetric } from './modules/analytics'
import type { LogLevel } from './utils/logger'

import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { app, protocol } from 'electron'
import { commonChannelModule } from './channel/common'
import { genTouchApp } from './core'
import { loadStartupModules } from './core/startup-module-loader'
import { enforceDevReleaseStartupConstraint } from './core/startup-version-guard'
import { AllModulesLoadedEvent, TalexEvents, touchEventBus } from './core/eventbus/touch-event'
import { addonOpenerModule } from './modules/addon-opener'

import { intelligenceModule } from './modules/ai/intelligence-module'
import { analyticsModule, getStartupAnalytics } from './modules/analytics'
import { assistantModule } from './modules/assistant'
import { coreBoxModule } from './modules/box-tool/core-box/index'
import FileSystemWatcher from './modules/box-tool/file-system-watcher'
import { buildVerificationModule } from './modules/build-verification'
import { clipboardModule } from './modules/clipboard'
import { databaseModule } from './modules/database'
import { divisionBoxModule } from './modules/division-box'
import { downloadCenterModule } from './modules/download/download-center'
import { extensionLoaderModule } from './modules/extension-loader'
import { fileProtocolModule } from './modules/file-protocol'
import { flowBusModule } from './modules/flow-bus'
// import DropManager from './modules/drop-manager'
import { shortcutModule } from './modules/global-shortcon'
import { notificationModule } from './modules/notification'
import { omniPanelModule } from './modules/omni-panel'
import { networkModule } from './modules/network'
import { PermissionModule } from './modules/permission'
import { pluginModule } from './modules/plugin/plugin-module'
import { sentryModule } from './modules/sentry'
import { syncModule } from './modules/sync'
import { authModule } from './modules/auth'
import { getMainConfig, storageModule, subscribeMainConfig } from './modules/storage'
import { permissionCheckerModule } from './modules/system/permission-checker'
import { tuffDashboardModule } from './modules/system/tuff-dashboard'
import { systemUpdateModule } from './modules/system-update'
import { terminalModule } from './modules/terminal/terminal.manager'
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

function parseBooleanEnvFlag(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function parsePositiveIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return parsed
}

const startupBenchmarkEnabled = parseBooleanEnvFlag(process.env.TUFF_STARTUP_BENCHMARK_ONCE)
const startupBenchmarkExitDelayMs = parsePositiveIntegerEnv(
  process.env.TUFF_STARTUP_BENCHMARK_EXIT_DELAY_MS,
  1_200
)

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
  networkModule,
  analyticsModule,
  permissionCheckerModule,
  permissionModule, // Plugin permission management - before plugin module
  notificationModule,
  sentryModule,
  buildVerificationModule,
  updateServiceModule,
  systemUpdateModule,
  intelligenceModule,
  pluginModule,
  pluginLogModule,
  authModule,
  syncModule,
  flowBusModule, // Flow Transfer system - after plugin module
  divisionBoxModule,
  coreBoxModule,
  omniPanelModule,
  assistantModule,
  trayManagerModule,
  addonOpenerModule,
  clipboardModule,
  tuffDashboardModule,
  FileSystemWatcher,
  terminalModule,
  downloadCenterModule
]
const optionalModulesToLoad = new Set([trayManagerModule])

function shouldLoadAssistantModule(): boolean {
  const value = process.env.TUFF_ENABLE_ASSISTANT_EXPERIMENT
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

// Record when Electron becomes ready
let electronReadyTime: number

// Pre-initialize Sentry before `app.whenReady()` to satisfy @sentry/electron requirements.
try {
  sentryModule.preInitBeforeReady()
} catch (error) {
  mainLog.warn('Failed to pre-initialize Sentry', { error })
}

app.whenReady().then(async () => {
  const canContinue = await enforceDevReleaseStartupConstraint()
  if (!canContinue) return

  electronReadyTime = Date.now()
  const startupTimer = mainLog.time('Startup health check passed', 'success')
  const moduleLoadTimer = mainLog.time('All modules loaded', 'success')
  mainLog.info('Electron ready, bootstrapping modules')

  let modulesLoaded = false
  let loadedModuleCount = 0

  try {
    const analytics = getStartupAnalytics()
    const touchApp = genTouchApp()
    const modulesStartTime = Date.now()

    const moduleLoadMetrics = (await loadStartupModules({
      modules: modulesToLoad,
      loadModule: async (moduleCtor) => {
        return await touchApp.moduleManager.loadModule(moduleCtor)
      },
      optionalModules: optionalModulesToLoad,
      shouldSkip: (moduleCtor) => {
        if (moduleCtor === assistantModule && !shouldLoadAssistantModule()) {
          mainLog.info('Skip Assistant module: TUFF_ENABLE_ASSISTANT_EXPERIMENT disabled')
          return true
        }
        return false
      },
      onOptionalModuleLoadFailed: async (_moduleCtor, metric) => {
        mainLog.warn('Optional module failed to load, continue startup', {
          meta: { module: metric.name }
        })
      },
      onLoaded: async (moduleCtor, metric) => {
        analytics.trackModuleLoad(metric.name, metric.loadTime, metric.order)

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
    })) as ModuleLoadMetric[]

    const totalModulesLoadTime = Date.now() - modulesStartTime
    loadedModuleCount = moduleLoadMetrics.length
    modulesLoaded = true
    moduleLoadTimer.end('All modules loaded', {
      meta: { modules: loadedModuleCount }
    })

    // Set main process metrics
    analytics.setMainProcessMetrics({
      processCreationTime: process.getCreationTime() || Date.now(),
      electronReadyTime,
      modulesLoadTime: totalModulesLoadTime,
      totalModules: modulesToLoad.length,
      moduleDetails: moduleLoadMetrics
    })

    const rendererInitPromise = touchApp.waitUntilInitialized()
    if (touchApp.isSilentStart()) {
      void rendererInitPromise.catch((error) => {
        mainLog.error('Silent-start renderer initialization failed', { error })
        app.quit()
      })
    } else {
      await rendererInitPromise
    }

    touchEventBus.emit(TalexEvents.ALL_MODULES_LOADED, new AllModulesLoadedEvent())

    // Start the global polling service after all modules are loaded.
    pollingService.start()

    startupTimer.end('Startup health check passed', {
      meta: { modules: loadedModuleCount }
    })

    if (startupBenchmarkEnabled) {
      mainLog.info('Startup benchmark mode: scheduling app quit after startup health check', {
        meta: { exitDelayMs: startupBenchmarkExitDelayMs }
      })
      setTimeout(() => {
        app.quit()
      }, startupBenchmarkExitDelayMs)
    }
  } catch (error) {
    if (!modulesLoaded) {
      moduleLoadTimer.end('Module bootstrap failed', {
        level: 'warn',
        error
      })
    }
    startupTimer.end('Bootstrap failed', {
      level: 'warn',
      error
    })
    mainLog.error('Main process bootstrap failed', { error })
    app.quit()
  }
})
