import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app, protocol, net, session } from 'electron'
import StorageModule from './core/storage'
import CommonChannel from './channel/common'
import { PluginManagerModule } from './plugins'
import PermissionCenter from './modules/permission-center'
import ServiceCenter from './service/service-center'
import PluginLogService from './service/plugin-log.service'
import CoreBox from './modules/box-tool/core-box/index'

import addonOpener from './modules/addon-opener'
import extensionLoader from './modules/extension-loader'
// import DropManager from './modules/drop-manager'
import GlobalShortcon from './modules/global-shortcon'
import TrayHolder from './modules/tray-holder'
import Clipboard from './modules/clipboard'
import DatabaseModule from './modules/database'
import FileSystemWatcher from './modules/file-system-watcher'
import { AllModulesLoadedEvent, TalexEvents, touchEventBus } from './core/eventbus/touch-event'
import FileProtocolModule from './modules/file-protocol'
import TerminalManager from './modules/terminal/terminal.manager'
import { pollingService } from '@talex-touch/utils/common/utils/polling'

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

app.whenReady().then(async () => {
  const app = genTouchApp()

  await app.moduleManager.loadModule(DatabaseModule)
  await app.moduleManager.loadModule(StorageModule)
  await app.moduleManager.loadModule(extensionLoader)
  await app.moduleManager.loadModule(CommonChannel)
  await app.moduleManager.loadModule(PluginManagerModule)
  await app.moduleManager.loadModule(PermissionCenter)
  await app.moduleManager.loadModule(ServiceCenter)
  await app.moduleManager.loadModule(PluginLogService)

  await app.moduleManager.loadModule(CoreBox)
  await app.moduleManager.loadModule(TrayHolder)
  await app.moduleManager.loadModule(addonOpener)
  // await app.moduleManager.loadModule(DropManager)
  await app.moduleManager.loadModule(GlobalShortcon)
  await app.moduleManager.loadModule(Clipboard)
  await app.moduleManager.loadModule(FileSystemWatcher)
  await app.moduleManager.loadModule(FileProtocolModule)
  await app.moduleManager.loadModule(TerminalManager)

  touchEventBus.emit(TalexEvents.ALL_MODULES_LOADED, new AllModulesLoadedEvent())

  // Start the global polling service after all modules are loaded.
  pollingService.start()

  console.log('[TouchApp] All modules loaded.')
})

touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
  console.log('[PollingService] Stopping polling service due to app quit.')
  pollingService.stop()
})