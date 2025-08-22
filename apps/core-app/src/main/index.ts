import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app, protocol, net, session } from 'electron'
import StorageModule from './core/storage'
import CommonChannel from './channel/common'
import PluginModule from './plugins/plugin-core'
import PermissionCenter from './modules/permission-center'
import ServiceCenter from './service/service-center'
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
  await app.moduleManager.loadModule(PluginModule)
  await app.moduleManager.loadModule(PermissionCenter)
  await app.moduleManager.loadModule(ServiceCenter)

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

  console.log('[TouchApp] All modules loaded.')
})