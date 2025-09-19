import { coreBoxManager } from './manager'
import SearchEngineCore from '../search-engine/search-core'
import { windowManager } from './window'
import { shortcutModule } from '../../global-shortcon'
import { BaseModule } from '../../abstract-base-module'
import { ModuleKey } from '@talex-touch/utils'
export { getCoreBoxWindow } from './window'

let lastScreenId: number | undefined

export class CoreBoxModule extends BaseModule {
  static key: symbol = Symbol.for('CoreBox')
  name: ModuleKey = CoreBoxModule.key

  constructor() {
    super(CoreBoxModule.key, {
      create: false
    })
  }

  async onInit(): Promise<void> {
    await $app.moduleManager.loadModule(SearchEngineCore)

    coreBoxManager.init()

    shortcutModule.registerMainShortcut('core.box.toggle', 'CommandOrControl+E', () => {
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
  }
  async onDestroy(): Promise<void> {
    coreBoxManager.destroy()
  }
}

const coreBoxModule = new CoreBoxModule()

export { coreBoxModule }
