import './polyfills'
import { genTouchApp } from './core/touch-core'
import { app } from 'electron'
import CommonChannel from './channel/common'
import PluginModule from './plugins/plugin-core'

app.whenReady().then(() => {
  const app = genTouchApp()

  app.moduleManager.loadModule(CommonChannel)
  app.moduleManager.loadModule(PluginModule)
})