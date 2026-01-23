import type { MaybePromise, ModuleKey } from '@talex-touch/utils'
import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import process from 'node:process'
import { ShortcutType } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import ShortcutStorage from '@talex-touch/utils/common/storage/shortcut-storage'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { BrowserWindow, globalShortcut } from 'electron'
import { createLogger } from '../utils/logger'
import { BaseModule } from './abstract-base-module'
import { getPermissionModule } from './permission'
import { pluginModule } from './plugin/plugin-module'
import { useMainStorage } from './storage'

const shortconLog = createLogger('GlobalShortcon')
const shortconUpdateEvent = defineRawEvent<{ id: string; accelerator: string }, boolean>(
  'shortcon:update'
)
const shortconDisableAllEvent = defineRawEvent<void, void>('shortcon:disable-all')
const shortconEnableAllEvent = defineRawEvent<void, void>('shortcon:enable-all')
const shortconGetAllEvent = defineRawEvent<void, ShortcutWithStatus[]>('shortcon:get-all')
const shortconRegisterEvent = defineRawEvent<
  { key: string; id?: string; description?: string; desc?: string },
  boolean
>('shortcon:reg')
const shortconTriggerEvent = defineRawEvent<{ id: string }, void>('shortcon:trigger')

// A runtime map to hold callbacks for 'main' type shortcuts
const mainCallbackRegistry = new Map<string, () => void>()
const SYSTEM_SHORTCUT_AUTHOR = 'system'
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
const SHORTCUT_PERMISSION_ID = 'system.shortcut'
const SHORTCUT_PERMISSION_MIN_SDK = 260121

type ShortcutWarning = 'permission-missing' | 'sdk-legacy' | 'missing-description'

interface ShortcutStatus {
  state: 'active' | 'conflict' | 'unavailable'
  reason?: 'conflict-system' | 'conflict-plugin' | 'register-failed' | 'register-error' | 'invalid'
  conflictWith?: string[]
  warnings?: ShortcutWarning[]
}

type ShortcutWithStatus = Shortcut & { status?: ShortcutStatus }

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
  private shortcutStatusMap = new Map<string, ShortcutStatus>()
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
    const channel = $app.channel
    const transport = getTuffTransportMain(channel, resolveKeyManager(channel))

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
      return this.buildShortcutSnapshot()
    })

    transport.on(shortconRegisterEvent, (payload, context) => {
      const key = payload?.key
      const pluginName = context.plugin?.name
      if (!key || !pluginName) {
        return false
      }
      const description =
        typeof payload?.description === 'string'
          ? payload.description
          : typeof payload?.desc === 'string'
            ? payload.desc
            : undefined
      const triggerId =
        typeof payload?.id === 'string' && payload.id.trim() ? payload.id.trim() : key
      if (!description || !description.trim()) {
        shortconLog.warn(`Shortcut description missing for plugin ${pluginName}: ${triggerId}`)
      }
      const shortcutId = this.resolveRendererShortcutId(pluginName, triggerId)
      return this.registerRendererShortcut(shortcutId, key, pluginName, description, triggerId)
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
          author: SYSTEM_SHORTCUT_AUTHOR
        }
      })
    }

    shortconLog.success(`Main shortcut registered: ${id} (${defaultAccelerator})`)

    this.reregisterAllShortcuts()
    return true
  }

  registerRendererShortcut(
    id: string,
    accelerator: string,
    author: string,
    description?: string,
    triggerId?: string
  ): boolean {
    const normalized = this.normalizeAccelerator(accelerator)
    if (!normalized) {
      shortconLog.error(`Invalid accelerator for shortcut ${id}: ${accelerator}`)
      return false
    }

    const existing = this.storage!.getShortcutById(id)
    if (existing) {
      if (existing.meta?.author && existing.meta.author !== author) {
        shortconLog.warn(`Renderer shortcut with ID ${id} is already registered.`)
        return false
      }
      if (existing.accelerator !== normalized) {
        this.storage!.updateShortcutAccelerator(id, normalized)
        existing.accelerator = normalized
      }
      const meta = existing.meta as (Shortcut['meta'] & { shortcutId?: string }) | undefined
      if (meta) {
        if (typeof description === 'string' && description.trim()) {
          meta.description = description.trim()
        }
        if (triggerId) {
          meta.shortcutId = triggerId
        }
        meta.modificationTime = Date.now()
        this.persistShortcutMeta()
      }
      shortconLog.success(`Renderer shortcut updated: ${id} (${normalized})`)
      this.reregisterAllShortcuts()
      return true
    }

    this.storage!.addShortcut({
      id,
      accelerator: normalized,
      type: ShortcutType.RENDERER,
      meta: {
        creationTime: Date.now(),
        modificationTime: Date.now(),
        author,
        description:
          typeof description === 'string' && description.trim() ? description.trim() : undefined,
        shortcutId: triggerId
      } as Shortcut['meta'] & { shortcutId?: string }
    })

    shortconLog.success(`Renderer shortcut registered: ${id} (${normalized})`)
    this.reregisterAllShortcuts()
    return true
  }

  private resolveRendererShortcutId(pluginName: string, triggerId: string): string {
    const existing = this.findRendererShortcut(pluginName, triggerId)
    if (existing) {
      return existing.id
    }
    return `plugin.${pluginName}.${triggerId}`
  }

  private findRendererShortcut(pluginName: string, triggerId: string): Shortcut | undefined {
    const shortcuts = this.storage?.getAllShortcuts() || []
    return shortcuts.find((shortcut) => {
      if (shortcut.type !== ShortcutType.RENDERER) return false
      if (shortcut.meta?.author !== pluginName) return false
      const meta = shortcut.meta as (Shortcut['meta'] & { shortcutId?: string }) | undefined
      return meta?.shortcutId === triggerId || shortcut.id === triggerId
    })
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
    const normalizedMap = new Map<string, string>()
    const groupedByAccelerator = new Map<string, Shortcut[]>()
    const statusMap = new Map<string, ShortcutStatus>()

    for (const shortcut of allShortcuts) {
      const normalizedAccelerator = this.normalizeAccelerator(shortcut.accelerator)
      if (!normalizedAccelerator) {
        statusMap.set(shortcut.id, { state: 'unavailable', reason: 'invalid' })
        shortconLog.error(
          `Invalid accelerator for shortcut ${shortcut.id}: ${shortcut.accelerator}`
        )
        continue
      }

      if (normalizedAccelerator !== shortcut.accelerator) {
        this.storage!.updateShortcutAccelerator(shortcut.id, normalizedAccelerator)
        shortcut.accelerator = normalizedAccelerator
      }

      normalizedMap.set(shortcut.id, normalizedAccelerator)
      const group = groupedByAccelerator.get(normalizedAccelerator)
      if (group) {
        group.push(shortcut)
      } else {
        groupedByAccelerator.set(normalizedAccelerator, [shortcut])
      }
    }

    this.resolveConflictStatuses(groupedByAccelerator, statusMap)

    let successCount = 0
    for (const shortcut of allShortcuts) {
      const status = statusMap.get(shortcut.id)
      if (!status || status.state !== 'active') {
        continue
      }

      const accelerator = normalizedMap.get(shortcut.id)
      if (!accelerator) {
        continue
      }

      try {
        const registered = globalShortcut.register(accelerator, () => {
          shortconLog.debug(`Shortcut triggered: ${shortcut.id}`)
          this.handleTrigger(shortcut)
        })
        if (!registered) {
          status.state = 'unavailable'
          status.reason = 'register-failed'
          shortconLog.warn(
            `Failed to register shortcut (system reserved?): ${shortcut.id} (${accelerator})`
          )
          continue
        }
        successCount++
      } catch (error) {
        status.state = 'unavailable'
        status.reason = 'register-error'
        shortconLog.error(`Failed to register shortcut: ${shortcut.id} (${accelerator})`, { error })
      }
    }

    this.shortcutStatusMap = statusMap
    shortconLog.success(`Successfully registered ${successCount} shortcuts`)
  }

  private resolveConflictStatuses(
    groupedByAccelerator: Map<string, Shortcut[]>,
    statusMap: Map<string, ShortcutStatus>
  ): void {
    for (const shortcuts of groupedByAccelerator.values()) {
      const systemShortcuts = shortcuts.filter((shortcut) => this.isSystemShortcut(shortcut))
      const pluginShortcuts = shortcuts.filter((shortcut) => !this.isSystemShortcut(shortcut))

      if (systemShortcuts.length > 0) {
        const [primary, ...rest] = systemShortcuts
        statusMap.set(primary.id, { state: 'active' })
        for (const shortcut of rest) {
          statusMap.set(shortcut.id, {
            state: 'conflict',
            reason: 'conflict-system',
            conflictWith: [primary.id]
          })
        }
        const systemIds = systemShortcuts.map((shortcut) => shortcut.id)
        for (const shortcut of pluginShortcuts) {
          statusMap.set(shortcut.id, {
            state: 'conflict',
            reason: 'conflict-system',
            conflictWith: systemIds
          })
        }
        continue
      }

      if (pluginShortcuts.length > 1) {
        const conflictIds = pluginShortcuts.map((shortcut) => shortcut.id)
        for (const shortcut of pluginShortcuts) {
          statusMap.set(shortcut.id, {
            state: 'conflict',
            reason: 'conflict-plugin',
            conflictWith: conflictIds.filter((id) => id !== shortcut.id)
          })
        }
        continue
      }

      if (pluginShortcuts.length === 1) {
        statusMap.set(pluginShortcuts[0].id, { state: 'active' })
      }
    }
  }

  private buildShortcutSnapshot(): ShortcutWithStatus[] {
    const shortcuts = this.storage?.getAllShortcuts() || []
    return shortcuts.map((shortcut) => {
      const baseStatus = this.shortcutStatusMap.get(shortcut.id)
      const warnings = this.resolveShortcutWarnings(shortcut)
      if (!baseStatus && warnings.length === 0) {
        return shortcut
      }
      const status: ShortcutStatus = baseStatus ? { ...baseStatus } : { state: 'active' }
      if (warnings.length > 0) {
        status.warnings = warnings
      }
      return { ...shortcut, status }
    })
  }

  private resolveShortcutWarnings(shortcut: Shortcut): ShortcutWarning[] {
    if (this.isSystemShortcut(shortcut)) {
      return []
    }
    const warnings: ShortcutWarning[] = []
    const meta = shortcut.meta as (Shortcut['meta'] & { shortcutId?: string }) | undefined
    if (!meta?.description) {
      warnings.push('missing-description')
    }

    const pluginName = shortcut.meta?.author
    const sdkapi = this.getPluginSdkapi(pluginName)
    if (!sdkapi || sdkapi < SHORTCUT_PERMISSION_MIN_SDK) {
      warnings.push('sdk-legacy')
      return warnings
    }

    const permissionModule = getPermissionModule()
    if (!permissionModule || !pluginName) {
      return warnings
    }

    if (!permissionModule.getStore().hasPermission(pluginName, SHORTCUT_PERMISSION_ID, sdkapi)) {
      warnings.push('permission-missing')
    }
    return warnings
  }

  private getPluginSdkapi(pluginName?: string): number | undefined {
    if (!pluginName) {
      return undefined
    }
    const manager = pluginModule.pluginManager
    const plugin = manager?.plugins.get(pluginName)
    return plugin?.sdkapi
  }

  private isSystemShortcut(shortcut: Shortcut): boolean {
    if (shortcut.type === ShortcutType.MAIN) {
      return true
    }
    return shortcut.meta?.author === SYSTEM_SHORTCUT_AUTHOR
  }

  private persistShortcutMeta(): void {
    const storage = this.storage as unknown as { _save?: () => void }
    storage?._save?.()
  }

  private getShortcutTriggerId(shortcut: Shortcut): string {
    const meta = shortcut.meta as (Shortcut['meta'] & { shortcutId?: string }) | undefined
    return meta?.shortcutId || shortcut.id
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
        const channel = $app.channel
        const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
        const triggerId = this.getShortcutTriggerId(shortcut)
        const pluginName = shortcut.meta?.author
        if (pluginName && pluginName !== SYSTEM_SHORTCUT_AUTHOR) {
          void transport
            .sendToPlugin(pluginName, shortconTriggerEvent, { id: triggerId })
            .catch(() => {})
          break
        }
        for (const win of allWindows) {
          void transport
            .sendToWindow(win.id, shortconTriggerEvent, { id: triggerId })
            .catch(() => {})
        }
        shortconLog.debug(`Forwarded trigger '${triggerId}' to all renderer processes`)
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
