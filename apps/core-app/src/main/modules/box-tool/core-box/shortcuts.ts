import { globalShortcut } from 'electron'
import { coreBoxManager } from './manager'
import { windowManager } from './window'

/**
 * @class ShortcutManager
 * @description
 * 管理全局快捷键。
 */
export class ShortcutManager {
  private static instance: ShortcutManager

  private constructor() {
    //
  }

  public static getInstance(): ShortcutManager {
    if (!ShortcutManager.instance) {
      ShortcutManager.instance = new ShortcutManager()
    }
    return ShortcutManager.instance
  }

  public register() {
    globalShortcut.register('CommandOrControl+E', () => {
      const curScreen = windowManager['getCurScreen']()
      // This is a bit of a hack, we should expose lastWindow in a better way
      // @ts-ignore
      if (coreBoxManager.lastWindow && curScreen && curScreen.id !== coreBoxManager.lastWindow.id) {
        const currentWindow = windowManager.current
        if (currentWindow) {
          windowManager.updatePosition(currentWindow)
          // @ts-ignore
          coreBoxManager.lastWindow = curScreen
        } else {
          console.error('[CoreBox] No current window available')
        }
      } else {
        // @ts-ignore
        coreBoxManager.trigger(!coreBoxManager.showCoreBox)
      }
    })
  }

  public unregister() {
    globalShortcut.unregisterAll()
  }
}

export const shortcutManager = ShortcutManager.getInstance()