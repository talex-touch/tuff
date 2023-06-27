import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app } from 'electron'
import StorageModule from './core/storage'
import CommonChannel from './channel/common'
import PluginModule from './plugins/plugin-core'
import PermissionCenter from './modules/permission-center'
import ServiceCenter from './service/service-center'

import addonOpener from './modules/addon-opener'
import extensionLoader from './modules/extension-loader'
import DropManager from './modules/drop-manager'
import { TalexEvents, touchEventBus } from './core/eventbus/touch-event'

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

  touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
    app.moduleManager['getAllModules']!.forEach((module: Symbol) => {
      app.moduleManager.unloadModule(module)
    })
  })
})