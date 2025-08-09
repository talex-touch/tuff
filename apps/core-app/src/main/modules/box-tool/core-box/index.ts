import { coreBoxManager } from './manager'
import { ipcManager } from './ipc'
import { shortcutManager } from './shortcuts'
import { windowManager } from './window'

export default {
  name: Symbol('CoreBox'),
  filePath: 'corebox', // This seems to be a convention in the project
  listeners: new Array<() => void>(),

  init() {
    // The managers are singletons and will be instantiated on first call
    coreBoxManager.init()
    windowManager.create() // Explicitly create the first window
    ipcManager.register()
    shortcutManager.register()

    console.log('[CoreBox] Core box module initialized!')
  },

  destroy() {
    shortcutManager.unregister()
    ipcManager.unregister()
    // Other cleanup tasks can be added here
    console.log('[CoreBox] Core box module destroyed!')
  }
}
