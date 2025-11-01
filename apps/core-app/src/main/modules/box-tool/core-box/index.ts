import { coreBoxManager } from './manager'
import SearchEngineCore from '../search-engine/search-core'
import { windowManager } from './window'
import { shortcutModule } from '../../global-shortcon'
import { BaseModule } from '../../abstract-base-module'
import { ModuleKey } from '@talex-touch/utils'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { getConfig } from '../../storage'
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
      // Check if initialization is complete
      try {
        const appSetting = getConfig(StorageList.APP_SETTING) as any
        if (!appSetting?.beginner?.init) {
          console.warn('[CoreBox] Initialization not complete, CoreBox is disabled')
          // Optionally show a notification or dialog to user
          const mainWindow = $app.window.window
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
          }
          return
        }
      } catch (error) {
        console.error('[CoreBox] Failed to check initialization status:', error)
        // If we can't check, allow CoreBox to open (fail-open approach)
      }

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
