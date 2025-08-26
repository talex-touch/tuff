import { coreBoxManager } from './manager'
import SearchEngineCore from '../search-engine/search-core'
import { genTouchApp } from '../../../core/touch-core'
import { getShortcutService } from '../../global-shortcon'
import { windowManager } from './window'
export { getCoreBoxWindow } from './window'

let lastScreenId: number | undefined

export default {
  name: Symbol('CoreBox'),
  filePath: false,
  listeners: new Array<() => void>(),
  async init() {
    const app = genTouchApp()

    await app.moduleManager.loadModule(SearchEngineCore)

    coreBoxManager.init()

    getShortcutService().registerMainShortcut('core.box.toggle', 'CommandOrControl+E', () => {
      const curScreen = windowManager.getCurScreen()

      if (coreBoxManager.showCoreBox) {
        if (lastScreenId === curScreen.id) {
          coreBoxManager.trigger(false)
        } else {
          const currentWindow = windowManager.current
          if (currentWindow) {
            windowManager.updatePosition(currentWindow, curScreen)
            lastScreenId = curScreen.id
          } else {
            console.error('[CoreBox] No current window available')
          }
        }
      } else {
        coreBoxManager.trigger(true)
        lastScreenId = curScreen.id
      }
    })

    console.log('[CoreBox] Core-box module initialized!')
  },
  destroy() {
    coreBoxManager.destroy()

    console.log('[CoreBox] Core box module destroyed!')
  }
}
