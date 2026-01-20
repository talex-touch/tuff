import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import ShortcutStorage from '@talex-touch/utils/common/storage/shortcut-storage'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import process from 'node:process'
import { BrowserWindow, globalShortcut } from 'electron'
import { createLogger } from '../utils/logger'
import { BaseModule } from './abstract-base-module'
import { useMainStorage } from './storage'

const shortconLog = createLogger('GlobalShortcon')
const shortconUpdateEvent = defineRawEvent<{ id: string; accelerator: string }, boolean>(
  'shortcon:update'
)
const shortconDisableAllEvent = defineRawEvent<void, void>('shortcon:disable-all')
const shortconEnableAllEvent = defineRawEvent<void, void>('shortcon:enable-all')
const shortconGetAllEvent = defineRawEvent<void, Shortcut[]>('shortcon:get-all')
const shortconTriggerEvent = defineRawEvent<{ id: string }, void>('shortcon:trigger')

// A runtime map to hold callbacks for 'main' type shortcuts
const mainCallbackRegistry = new Map<string, () => void>()

const isMacPlatform = process.platform === 'darwin'
const acceleratorTokenAlias = new Map<string, string>([
  ['META', isMacPlatform ? 'Command' : 'Super'],
  ['COMMAND', 'Command'],
  ['CMD', 'Command'],
  ['COMMANDORCONTROL', 'CommandOrControl'],
  ['CMDORCTRL', 'CommandOrControl'],
  ['COMMANDORCTRL', 'CommandOrControl'],
  ['CTRL', 'Control'],
  ['CONTROL', 'Control'],
  ['ALT', 'Alt'],
  ['OPTION', isMacPlatform ? 'Option' : 'Alt'],
  ['OPT', isMacPlatform ? 'Option' : 'Alt'],
  ['SHIFT', 'Shift'],
  ['SUPER', 'Super'],
  ['WIN', 'Super'],
  ['WINDOWS', 'Super'],
  ['SPACE', 'Space'],
  ['SPACEBAR', 'Space'],
  ['ENTER', 'Enter'],
  ['RETURN', 'Enter'],
  ['BACKSPACE', 'Backspace'],
  ['DELETE', 'Delete'],
  ['DEL', 'Delete'],
  ['ESC', 'Esc'],
  ['ESCAPE', 'Esc'],
  ['TAB', 'Tab'],
  ['HOME', 'Home'],
  ['END', 'End'],
  ['PAGEUP', 'PageUp'],
  ['PAGEDOWN', 'PageDown']
])
const F_KEY_REGEX = /^F\d{1,2}$/i

export class ShortcutModule extends BaseModule {
  static key: symbol = Symbol.for('Shortcut')
  name: ModuleKey = ShortcutModule.key

  private storage?: ShortcutStorage
  private isEnabled: boolean = true

  constructor() {
    super(ShortcutModule.key, {
      create: false
    })
  }

  onInit(): MaybePromise<void> {
    const storage = useMainStorage()
    this.storage = new ShortcutStorage({
      getConfig: storage.getConfig.bind(storage),
      saveConfig: storage.saveConfig.bind(storage)
    })
    this.setupIpcListeners()
    this.reregisterAllShortcuts()
  }

  onDestroy(): MaybePromise<void> {
    globalShortcut.unregisterAll()
    mainCallbackRegistry.clear()
  }

  /**
   * Sets up IPC listeners for renderer processes to call.
   */
  private setupIpcListeners(): void {
    const channel = $app.channel as any
    const transport = getTuffTransportMain(channel, channel?.keyManager ?? channel)

    transport.on(shortconUpdateEvent, (data) => {
      const { id, accelerator } = data
      return this.updateShortcut(id, accelerator)
    })

    transport.on(shortconDisableAllEvent, () => {
      this.disableAll()
    })

    transport.on(shortconEnableAllEvent, () => {
      this.enableAll()
    })

    transport.on(shortconGetAllEvent, () => {
      return this.storage!.getAllShortcuts()
    })
  }

  /**
   * Registers a shortcut that executes a callback within the main process.
   * This is called by other main-process modules during initialization.
   */
  registerMainShortcut(id: string, defaultAccelerator: string, callback: () => void): boolean {
    if (mainCallbackRegistry.has(id)) {
      shortconLog.warn(`Main shortcut with ID ${id} is already registered.`)
      return false
    }

    mainCallbackRegistry.set(id, callback)

    const existingShortcut = this.storage!.getShortcutById(id)
    if (!existingShortcut) {
      this.storage!.addShortcut({
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

    shortconLog.success(`Main shortcut registered: ${id} (${defaultAccelerator})`)

    this.reregisterAllShortcuts()
    return true
  }

  /**
   * Updates the accelerator for a given shortcut ID.
   */
  updateShortcut(id: string, newAccelerator: string): boolean {
    const success = this.storage!.updateShortcutAccelerator(id, newAccelerator)
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
    shortconLog.info('All global shortcuts disabled')
  }

  /**
   * Enables and registers all shortcuts from storage.
   */
  enableAll(): void {
    if (this.isEnabled) return
    this.isEnabled = true
    this.reregisterAllShortcuts()
    shortconLog.info('All global shortcuts enabled')
  }

  /**
   * Core function: unregisters everything and re-registers from storage.
   */
  private reregisterAllShortcuts(): void {
    globalShortcut.unregisterAll()

    if (!this.isEnabled) {
      shortconLog.debug('Shortcuts globally disabled, skip registration')
      return
    }

    const allShortcuts = this.storage!.getAllShortcuts()
    let successCount = 0
    for (const shortcut of allShortcuts) {
      const normalizedAccelerator = this.normalizeAccelerator(shortcut.accelerator)
      if (!normalizedAccelerator) {
        shortconLog.error(
          `Invalid accelerator for shortcut ${shortcut.id}: ${shortcut.accelerator}`
        )
        continue
      }

      if (normalizedAccelerator !== shortcut.accelerator) {
        this.storage!.updateShortcutAccelerator(shortcut.id, normalizedAccelerator)
        shortcut.accelerator = normalizedAccelerator
      }

      try {
        globalShortcut.register(normalizedAccelerator, () => {
          shortconLog.debug(`Shortcut triggered: ${shortcut.id}`)
          this.handleTrigger(shortcut)
        })
        successCount++
      } catch (error) {
        shortconLog.error(
          `Failed to register shortcut: ${shortcut.id} (${normalizedAccelerator})`,
          { error }
        )
      }
    }

    shortconLog.success(`Successfully registered ${successCount} shortcuts`)
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
          shortconLog.error(`No main-process callback found for shortcut ID: ${shortcut.id}`)
        }
        break
      }
      case ShortcutType.RENDERER: {
        const allWindows = BrowserWindow.getAllWindows()
        const channel = $app.channel as any
        const transport = getTuffTransportMain(channel, channel?.keyManager ?? channel)
        for (const win of allWindows) {
          void transport
            .sendToWindow(win.id, shortconTriggerEvent, { id: shortcut.id })
            .catch(() => {})
        }
        shortconLog.debug(`Forwarded trigger '${shortcut.id}' to all renderer processes`)
        break
      }
    }
  }

  private normalizeAccelerator(raw: string): string | null {
    if (!raw || typeof raw !== 'string') {
      return null
    }

    const tokens = raw
      .split('+')
      .map((token) => token.trim())
      .filter(Boolean)

    if (!tokens.length) {
      return null
    }

    const normalizedTokens = tokens
      .map((token) => this.normalizeAcceleratorToken(token))
      .filter((token): token is string => Boolean(token))

    if (!normalizedTokens.length) {
      return null
    }

    return normalizedTokens.join('+')
  }

  private normalizeAcceleratorToken(token: string): string {
    const upper = token.toUpperCase()
    const alias = acceleratorTokenAlias.get(upper)
    if (alias) {
      return alias
    }

    if (F_KEY_REGEX.test(token)) {
      return upper
    }

    if (token.length === 1) {
      return upper
    }

    if (token.toLowerCase().startsWith('numpad')) {
      const suffix = token.slice(6)
      if (!suffix) {
        return 'Numpad'
      }
      return `Numpad${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`
    }

    return token.charAt(0).toUpperCase() + token.slice(1)
  }
}

const shortcutModule = new ShortcutModule()

export { shortcutModule }
