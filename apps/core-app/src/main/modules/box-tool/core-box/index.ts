import { coreBoxManager } from './manager'
import SearchEngineCore from '../search-engine/search-core'
import { genTouchApp } from '../../../core/touch-core'
export { getCoreBoxWindow } from './window'

export default {
  name: Symbol('CoreBox'),
  filePath: false,
  listeners: new Array<() => void>(),
  async init() {
    const app = genTouchApp()

    await app.moduleManager.loadModule(SearchEngineCore)

    coreBoxManager.init()

    console.log('[CoreBox] Core-box module initialized!')
  },
  destroy() {
    coreBoxManager.destroy()

    console.log('[CoreBox] Core box module destroyed!')
  }
}
