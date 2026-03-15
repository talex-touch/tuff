import type { ModuleLoadMetric } from './modules/analytics'
import type { LogLevel } from './utils/logger'

import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { app, protocol } from 'electron'
import { commonChannelModule } from './channel/common'
import { genTouchApp } from './core'
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
import {
  omniPanelFeatureExecuteEvent,
  omniPanelHideEvent,
  omniPanelShowEvent
} from '../shared/events/omni-panel'
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
const OMNI_PANEL_SMOKE_TIMEOUT_MS = 45_000

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

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

async function runOmniPanelSmokeProbeIfNeeded(): Promise<void> {
  if (process.env.TUFF_OMNIPANEL_SMOKE !== '1') return

  mainLog.info('[OmniPanel Smoke] Starting smoke probe in real Electron runtime')

  const channel = genTouchApp().channel
  const keyManager = (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
  const transport = getTuffTransportMain(channel, keyManager)

  const timeoutHandle = setTimeout(() => {
    mainLog.error('[OmniPanel Smoke] Timed out')
    app.exit(1)
  }, OMNI_PANEL_SMOKE_TIMEOUT_MS)

  try {
    await waitMs(300)
    await transport.invoke(omniPanelShowEvent, {
      captureSelection: false,
      source: 'command'
    })

    await waitMs(350)
    const executeResult = await transport.invoke(omniPanelFeatureExecuteEvent, {
      id: 'builtin.corebox-search',
      contextText: 'omni-panel smoke',
      source: 'command'
    })

    if (!executeResult || executeResult.success !== true) {
      throw new Error(`[OmniPanel Smoke] Execute failed: ${JSON.stringify(executeResult ?? null)}`)
    }

    await transport.invoke(omniPanelHideEvent, undefined)
    await waitMs(200)

    mainLog.info('[OmniPanel Smoke] Passed')
    app.exit(0)
  } catch (error) {
    mainLog.error('[OmniPanel Smoke] Failed', { error })
    app.exit(1)
  } finally {
    clearTimeout(timeoutHandle)
  }
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

function shouldLoadTrayModule(): boolean {
  try {
    const appSettings = getMainConfig(StorageList.APP_SETTING)
    return appSettings?.setup?.experimentalTray === true
  } catch (error) {
    mainLog.warn('Failed to read tray experimental switch, skip tray module by default', { error })
    return false
  }
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
  const startupTimer = mainLog.time('All modules loaded', 'success')
  mainLog.info('Electron ready, bootstrapping modules')

  const analytics = getStartupAnalytics()
  const touchApp = genTouchApp()
  const moduleLoadMetrics: ModuleLoadMetric[] = []
  const modulesStartTime = Date.now()

  // Load modules and track individual load times
  for (let i = 0; i < modulesToLoad.length; i++) {
    const moduleCtor = modulesToLoad[i]
    if (moduleCtor === trayManagerModule && !shouldLoadTrayModule()) {
      mainLog.info('Skip TrayManager module: experimentalTray disabled')
      continue
    }

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

  void runOmniPanelSmokeProbeIfNeeded()
})
