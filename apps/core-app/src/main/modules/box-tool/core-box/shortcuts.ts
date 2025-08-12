import { globalShortcut } from 'electron'
import { coreBoxManager } from './manager'
import { windowManager } from './window'

/**
 * @class ShortcutManager
 * @description
 * Manage core-box global shortcuts.
 */
export class ShortcutManager {
  private static instance: ShortcutManager
  private lastScreenId: number | undefined

  private constructor() {
    //
  }

  public static getInstance(): ShortcutManager {
    if (!ShortcutManager.instance) {
      ShortcutManager.instance = new ShortcutManager()
    }
    return ShortcutManager.instance
  }

  public register(): void {
    globalShortcut.register('CommandOrControl+E', () => {
      const curScreen = windowManager.getCurScreen()

      if (coreBoxManager.showCoreBox) {
        if (this.lastScreenId === curScreen.id) {
          coreBoxManager.trigger(false)
        } else {
          const currentWindow = windowManager.current
          if (currentWindow) {
            windowManager.updatePosition(currentWindow, curScreen)
            this.lastScreenId = curScreen.id
          } else {
            console.error('[CoreBox] No current window available')
          }
        }
      } else {
        coreBoxManager.trigger(true)
        this.lastScreenId = curScreen.id
      }
    })
  }

  public unregister(): void {
    globalShortcut.unregisterAll()
  }
}

export const shortcutManager = ShortcutManager.getInstance()
