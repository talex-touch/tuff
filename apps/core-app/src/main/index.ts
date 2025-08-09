import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app } from 'electron'
import StorageModule from './core/storage'
import CommonChannel from './channel/common'
import PluginModule from './plugins/plugin-core'
import PermissionCenter from './modules/permission-center'
import ServiceCenter from './service/service-center'
import CoreBox from './modules/box-tool/core-box'

import addonOpener from './modules/addon-opener'
import extensionLoader from './modules/extension-loader'
import DropManager from './modules/drop-manager'
import GlobalShortcon from './modules/global-shortcon'
import TrayHolder from './modules/tray-holder'
import Clipboard from './modules/clipboard'
import { SearchEngineCore } from './modules/box-tool/search-engine'

app.whenReady().then(() => {
  const app = genTouchApp()

  app.moduleManager.loadModule(StorageModule)
  app.moduleManager.loadModule(extensionLoader)
  app.moduleManager.loadModule(CommonChannel)
  app.moduleManager.loadModule(PluginModule)
  app.moduleManager.loadModule(PermissionCenter)
  app.moduleManager.loadModule(ServiceCenter)

  app.moduleManager.loadModule(CoreBox)
  app.moduleManager.loadModule(SearchEngineCore.getInstance())
  app.moduleManager.loadModule(TrayHolder)
  app.moduleManager.loadModule(addonOpener)
  app.moduleManager.loadModule(DropManager)
  app.moduleManager.loadModule(GlobalShortcon)
  app.moduleManager.loadModule(Clipboard)
})
