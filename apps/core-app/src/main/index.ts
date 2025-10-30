import './polyfills'
import './core/precore'
import { app, protocol } from 'electron'
import { storageModule } from './modules/storage'
import { commonChannelModule } from './channel/common'
import { pluginModule } from './modules/plugin/plugin-module'
// import PermissionCenter from './modules/permission-center'
// import ServiceCenter from './service/service-center'
import { pluginLogModule } from './service/plugin-log.service'
import { coreBoxModule } from './modules/box-tool/core-box/index'

import { addonOpenerModule } from './modules/addon-opener'
// import DropManager from './modules/drop-manager'
import { shortcutModule } from './modules/global-shortcon'
import { trayHolderModule } from './modules/tray-holder'
// import { trayManagerModule } from './modules/tray/tray-manager'
import { clipboardModule } from './modules/clipboard'
import { databaseModule } from './modules/database'
import FileSystemWatcher from './modules/box-tool/file-system-watcher'
import { AllModulesLoadedEvent, TalexEvents, touchEventBus } from './core/eventbus/touch-event'
import { fileProtocolModule } from './modules/file-protocol'
import { terminalModule } from './modules/terminal/terminal.manager'
import { extensionLoaderModule } from './modules/extension-loader'
import { downloadCenterModule } from './modules/download/download-center'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { genTouchApp } from './core'
import { tuffDashboardModule } from './modules/system/tuff-dashboard'
import { mainLog } from './utils/logger'
import { getStartupAnalytics } from './modules/analytics'
import type { ModuleLoadMetric } from './modules/analytics'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

const modulesToLoad = [
  databaseModule,
  storageModule,
  fileProtocolModule,
  shortcutModule,
  extensionLoaderModule,
  commonChannelModule,
  pluginModule,
  pluginLogModule,
  coreBoxModule,
  trayHolderModule,
  // trayManagerModule,
  addonOpenerModule,
  clipboardModule,
  tuffDashboardModule,
  FileSystemWatcher,
  terminalModule,
  downloadCenterModule
]

const pollingLog = mainLog.child('PollingService')

// Record when Electron becomes ready
let electronReadyTime: number

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
    const moduleName = typeof moduleCtor.name === 'string'
      ? moduleCtor.name
      : (typeof moduleCtor.name === 'symbol'
        ? moduleCtor.name.toString()
        : `Module${i}`)

    moduleLoadMetrics.push({
      name: moduleName,
      loadTime: moduleLoadTime,
      order: i
    })

    analytics.trackModuleLoad(moduleName, moduleLoadTime, i)
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
  pollingLog.success('Polling service started')

  startupTimer.end('All modules loaded', {
    meta: { modules: modulesToLoad.length }
  })
})

touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
  pollingLog.info('Stopping polling service due to app quit')
  pollingService.stop()
})
