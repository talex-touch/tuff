import type { ModuleKey } from '@talex-touch/utils'
import { ChannelType } from '@talex-touch/utils/channel'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { genTouchApp } from '../../../core'
import { BaseModule } from '../../abstract-base-module'
import { shortcutModule } from '../../global-shortcon'
import { getConfig } from '../../storage'
import { createLogger } from '../../../utils/logger'
import SearchEngineCore from '../search-engine/search-core'
import { coreBoxManager } from './manager'
import { windowManager } from './window'

const coreBoxLog = createLogger('CoreBox')

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
          coreBoxLog.warn('Initialization not complete, CoreBox is disabled')
          // Optionally show a notification or dialog to user
          const mainWindow = $app.window.window
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
          }
          return
        }
      } catch (error) {
        coreBoxLog.error('Failed to check initialization status', { error })
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
            coreBoxLog.error('No current window available')
          }
        }
      } else {
        // Pass triggeredByShortcut flag when opening CoreBox via shortcut
        coreBoxManager.trigger(true, { triggeredByShortcut: true })
        lastScreenId = curScreen.id
      }
    })

    shortcutModule.registerMainShortcut('core.box.aiQuickCall', 'CommandOrControl+Shift+I', () => {
      const touchApp = genTouchApp()
      const curScreen = windowManager.getCurScreen()
      const currentWindow = windowManager.current

      if (currentWindow) {
        windowManager.updatePosition(currentWindow, curScreen)
      }

      // Also pass triggeredByShortcut for AI quick call
      coreBoxManager.trigger(true, { triggeredByShortcut: true })
      lastScreenId = curScreen.id

      const targetWindow = windowManager.current?.window
      if (!targetWindow || targetWindow.isDestroyed()) {
        return
      }

      setTimeout(() => {
        touchApp.channel
          .sendTo(targetWindow, ChannelType.MAIN, 'core-box:set-query', { value: 'ai ' })
          .catch((error) => {
            coreBoxLog.error('Failed to set AI quick call query', { error })
          })
      }, 80)
    })

    coreBoxLog.success('Core-box module initialized')
  }

  async onDestroy(): Promise<void> {
    coreBoxManager.destroy()
  }
}

const coreBoxModule = new CoreBoxModule()

export { coreBoxModule }
