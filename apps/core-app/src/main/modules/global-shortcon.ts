import { globalShortcut, BrowserWindow } from 'electron'
import { ChannelType, StandardChannelData } from '@talex-touch/utils/channel'
import { genTouchChannel } from '../core/channel-core'
import { getConfig, saveConfig } from '../core/storage'
import ShortcutStorage from '@talex-touch/utils/common/storage/shortcut-storage'
import { Shortcut, ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import type { TalexTouch } from '../types'

// A runtime map to hold callbacks for 'main' type shortcuts
const mainCallbackRegistry = new Map<string, () => void>()

class ShortcutService {
  private storage: ShortcutStorage
  private channel
  private isEnabled: boolean = true

  constructor() {
    this.storage = new ShortcutStorage({ getConfig, saveConfig })
    this.channel = genTouchChannel()
    this.setupIpcListeners()
    this.reregisterAllShortcuts()
  }

  /**
   * Sets up IPC listeners for renderer processes to call.
   */
  private setupIpcListeners(): void {
    this.channel.regChannel(
      ChannelType.MAIN,
      'shortcon:update',
      ({ data }: StandardChannelData) => {
        const { id, accelerator } = data as { id: string; accelerator: string }
        return this.updateShortcut(id, accelerator)
      }
    )

    this.channel.regChannel(ChannelType.MAIN, 'shortcon:disable-all', () => {
      this.disableAll()
    })

    this.channel.regChannel(ChannelType.MAIN, 'shortcon:enable-all', () => {
      this.enableAll()
    })

    this.channel.regChannel(ChannelType.MAIN, 'shortcon:get-all', () => {
      return this.storage.getAllShortcuts()
    })
  }

  /**
   * Registers a shortcut that executes a callback within the main process.
   * This is called by other main-process modules during initialization.
   */
  registerMainShortcut(id: string, defaultAccelerator: string, callback: () => void): boolean {
    if (mainCallbackRegistry.has(id)) {
      console.warn(`Main shortcut with ID ${id} is already registered.`)
      return false
    }

    mainCallbackRegistry.set(id, callback)

    const existingShortcut = this.storage.getShortcutById(id)
    if (!existingShortcut) {
      this.storage.addShortcut({
        id,
        accelerator: defaultAccelerator,
        type: ShortcutType.MAIN,
        meta: {
          creationTime: Date.now(),
          modificationTime: Date.now(),
          author: 'system'
        }
      })
    }

    console.log(`[GlobalShortcon] Main shortcut registered: ${id} (${defaultAccelerator})`)

    this.reregisterAllShortcuts()
    return true
  }

  /**
   * Updates the accelerator for a given shortcut ID.
   */
  updateShortcut(id: string, newAccelerator: string): boolean {
    const success = this.storage.updateShortcutAccelerator(id, newAccelerator)
    if (success) {
      this.reregisterAllShortcuts()
    }
    return success
  }

  /**
   * Disables all currently active global shortcuts.
   */
  disableAll(): void {
    if (!this.isEnabled) return
    globalShortcut.unregisterAll()
    this.isEnabled = false
    console.log('[GlobalShortcon] All global shortcuts disabled.')
  }

  /**
   * Enables and registers all shortcuts from storage.
   */
  enableAll(): void {
    if (this.isEnabled) return
    this.isEnabled = true
    this.reregisterAllShortcuts()
    console.log('[GlobalShortcon] All global shortcuts enabled.')
  }

  /**
   * Core function: unregisters everything and re-registers from storage.
   */
  private reregisterAllShortcuts(): void {
    globalShortcut.unregisterAll()

    if (!this.isEnabled) {
      console.log('[GlobalShortcon] Shortcuts are globally disabled, skipping registration.')
      return
    }

    const allShortcuts = this.storage.getAllShortcuts()
    for (const shortcut of allShortcuts) {
      try {
        globalShortcut.register(shortcut.accelerator, () => {
          console.debug(`[GlobalShortcon] Shortcut triggered: ${shortcut.id}`)
          this.handleTrigger(shortcut)
        })
      } catch (error) {
        console.error(
          `[GlobalShortcon] Failed to register shortcut: ${shortcut.id} (${shortcut.accelerator})`,
          error
        )
      }
    }

    console.log(`[GlobalShortcon] Successfully registered ${allShortcuts.length} shortcuts.`)
  }

  /**
   * Handles the trigger logic based on the shortcut's type.
   */
  private handleTrigger(shortcut: Shortcut): void {
    switch (shortcut.type) {
      case ShortcutType.MAIN: {
        const callback = mainCallbackRegistry.get(shortcut.id)
        if (callback) {
          callback()
        } else {
          console.error(
            `[GlobalShortcon] No main-process callback found for shortcut ID: ${shortcut.id}`
          )
        }
        break
      }
      case ShortcutType.RENDERER: {
        const allWindows = BrowserWindow.getAllWindows()
        for (const win of allWindows) {
          this.channel.sendTo(win, ChannelType.MAIN, 'shortcon:trigger', { id: shortcut.id })
        }
        console.log(
          `[GlobalShortcon] Forwarding trigger for '${shortcut.id}' to all renderer processes.`
        )
        break
      }
    }
  }

  destroy(): void {
    globalShortcut.unregisterAll()
    mainCallbackRegistry.clear()
  }
}

let serviceInstance: ShortcutService | null = null

export default {
  name: Symbol('GlobalShortcon'),
  init() {
    if (!serviceInstance) {
      serviceInstance = new ShortcutService()
    }
  },
  destroy() {
    serviceInstance?.destroy()
    serviceInstance = null
  }
} as TalexTouch.IModule

// Expose the service for other main-process modules
export const getShortcutService = (): ShortcutService => {
  if (!serviceInstance) {
    throw new Error('ShortcutService not initialized!')
  }
  return serviceInstance
}
