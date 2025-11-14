import { globalShortcut, BrowserWindow } from 'electron'
import { ChannelType, StandardChannelData } from '@talex-touch/utils/channel'
import ShortcutStorage from '@talex-touch/utils/common/storage/shortcut-storage'
import { Shortcut, ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { BaseModule } from './abstract-base-module'
import { MaybePromise, ModuleKey } from '@talex-touch/utils'
import { storageModule } from './storage'

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
    this.storage = new ShortcutStorage({
      getConfig: storageModule.getConfig.bind(storageModule),
      saveConfig: storageModule.saveConfig.bind(storageModule)
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
    $app.channel.regChannel(
      ChannelType.MAIN,
      'shortcon:update',
      ({ data }: StandardChannelData) => {
        const { id, accelerator } = data as { id: string; accelerator: string }
        return this.updateShortcut(id, accelerator)
      }
    )

    $app.channel.regChannel(ChannelType.MAIN, 'shortcon:disable-all', () => {
      this.disableAll()
    })

    $app.channel.regChannel(ChannelType.MAIN, 'shortcon:enable-all', () => {
      this.enableAll()
    })

    $app.channel.regChannel(ChannelType.MAIN, 'shortcon:get-all', () => {
      return this.storage!.getAllShortcuts()
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

    console.log(`[GlobalShortcon] Main shortcut registered: ${id} (${defaultAccelerator})`)

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

    const allShortcuts = this.storage!.getAllShortcuts()
    let successCount = 0
    for (const shortcut of allShortcuts) {
      const normalizedAccelerator = this.normalizeAccelerator(shortcut.accelerator)
      if (!normalizedAccelerator) {
        console.error(
          `[GlobalShortcon] Invalid accelerator for shortcut ${shortcut.id}: ${shortcut.accelerator}`
        )
        continue
      }

      if (normalizedAccelerator !== shortcut.accelerator) {
        this.storage!.updateShortcutAccelerator(shortcut.id, normalizedAccelerator)
        shortcut.accelerator = normalizedAccelerator
      }

      try {
        globalShortcut.register(normalizedAccelerator, () => {
          console.debug(`[GlobalShortcon] Shortcut triggered: ${shortcut.id}`)
          this.handleTrigger(shortcut)
        })
        successCount++
      } catch (error) {
        console.error(
          `[GlobalShortcon] Failed to register shortcut: ${shortcut.id} (${normalizedAccelerator})`,
          error
        )
      }
    }

    console.log(`[GlobalShortcon] Successfully registered ${successCount} shortcuts.`)
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
          $app.channel.sendTo(win, ChannelType.MAIN, 'shortcon:trigger', { id: shortcut.id })
        }
        console.log(
          `[GlobalShortcon] Forwarding trigger for '${shortcut.id}' to all renderer processes.`
        )
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
      .map(token => token.trim())
      .filter(Boolean)

    if (!tokens.length) {
      return null
    }

    const normalizedTokens = tokens
      .map(token => this.normalizeAcceleratorToken(token))
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
