import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app } from 'electron'
import StorageModule from './core/storage'
import CommonChannel from './channel/common'
import PluginModule from './plugins/plugin-core'
import PermissionCenter from './modules/permission-center'
import ServiceCenter from './modules/service-center'

import addonOpener from './modules/addon-opener'
import extensionLoader from './modules/extension-loader'
import DropManager from './modules/drop-manager'

app.whenReady().then(() => {
  const app = genTouchApp()

  app.moduleManager.loadModule(StorageModule)
  app.moduleManager.loadModule(extensionLoader)
  app.moduleManager.loadModule(CommonChannel)
  app.moduleManager.loadModule(PluginModule)
  app.moduleManager.loadModule(PermissionCenter)
  app.moduleManager.loadModule(ServiceCenter)

  app.moduleManager.loadModule(addonOpener)
  app.moduleManager.loadModule(DropManager)
})