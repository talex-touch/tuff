import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app } from 'electron'
import StorageModule from './core/storage'
import CommonChannel from './channel/common'
import PluginModule from './plugins/plugin-core'
import pluginPackager from './plugins/plugin-packager'

import addonOpener from './modules/addon-opener'
import backgroundBlur from './modules/background-blur'
import extensionLoader from './modules/extension-loader'

app.whenReady().then(() => {
  const app = genTouchApp()

  app.moduleManager.loadModule(StorageModule)
  app.moduleManager.loadModule(extensionLoader)
  app.moduleManager.loadModule(CommonChannel)
  app.moduleManager.loadModule(PluginModule)
  app.moduleManager.loadModule(pluginPackager)

  app.moduleManager.loadModule(addonOpener)
  app.moduleManager.loadModule(backgroundBlur)
})