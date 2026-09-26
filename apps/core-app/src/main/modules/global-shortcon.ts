import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type {
  Shortcut,
  ShortcutMeta
} from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import type { ShortcutBinding } from '../../shared/events/shortcut-binding'
import process from 'node:process'
import {
  ShortcutTriggerKind,
  ShortcutType
} from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import ShortcutStorage from '@talex-touch/utils/common/storage/shortcut-storage'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { BrowserWindow, globalShortcut } from 'electron'
import { acceleratorLabel, acceleratorsMatch } from '../../shared/accelerator-label'
import { shortconChangedEvent, shortconGetBindingEvent } from '../../shared/events/shortcut-binding'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { resolveMainRuntime } from '../core/runtime-accessor'
import { t } from '../utils/i18n-helper'
import { createLogger } from '../utils/logger'
import { BaseModule } from './abstract-base-module'
import { notificationModule } from './notification'
import { getPermissionModule } from './permission'
import { pluginModule } from './plugin/plugin-module'
import {
  buildFeatureShortcutId,
  parseFeatureShortcutId
} from './plugin/services/feature-shortcut-id'
import { useMainStorage } from './storage'

const shortconLog = createLogger('GlobalShortcon')
const shortconUpdateEvent = defineRawEvent<
  { id: string; accelerator?: string; enabled?: boolean },
  boolean
>('shortcon:update')
const shortconDisableAllEvent = defineRawEvent<void, void>('shortcon:disable-all')
const shortconEnableAllEvent = defineRawEvent<void, void>('shortcon:enable-all')
const shortconGetAllEvent = defineRawEvent<void, ShortcutWithStatus[]>('shortcon:get-all')
/**
 * The feature manager's two calls. Not on the plugin-facing allowlist, so they are reachable only
 * from the host renderer: binding a key to a feature is the user's act, not a plugin's.
 */
const shortconGetFeatureEvent = defineRawEvent<
  { plugin: string },
  Record<string, ShortcutWithStatus>
>('shortcon:get-feature')
const shortconSetFeatureEvent = defineRawEvent<
  { plugin: string; feature: string; accelerator: string },
  boolean
>('shortcon:set-feature')

/**
 * What the user is told, once per launch, when a system default ends a pass with no key. No other
 * key stands in for it, so the notice is the only way they learn that the key does nothing.
 *
 * Every body receives `{shortcut}`, the default's label; the title receives it too.
 */
interface MainShortcutUnavailableNotice {
  titleKey: string
  /** The OS refused the default. Names no cause: on macOS a refusal is never another app. */
  refusedBodyKey: string
  /** The default lost an in-app conflict to a shortcut that has no settings label. */
  conflictBodyKey: string
  /** The same, naming the shortcut that kept the key as `{other}` (its settings label). */
  conflictNamedBodyKey: string
}

// A runtime map to hold callbacks for 'main' type shortcuts
interface MainShortcutRegistration {
  callback: () => void
  owner?: string
  /** What `registerMainShortcut` was given; a stored value equal to it is still the default. */
  defaultAccelerator?: string
  unavailableNotice?: MainShortcutUnavailableNotice
}
const mainCallbackRegistry = new Map<string, MainShortcutRegistration>()
interface MainTriggerRegistration {
  onStateChange?: (enabled: boolean) => void
  onTrigger?: () => void
  owner?: string
}
const mainTriggerRegistry = new Map<string, MainTriggerRegistration>()
const SYSTEM_SHORTCUT_AUTHOR = 'system'
const RETIRED_GLOBAL_SHORTCUT_IDS = [
  'core.box.aiQuickCall',
  'flow:detach-to-divisionbox',
  'flow:transfer-to-plugin'
] as const
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
const SHORTCUT_PERMISSION_ID = 'system.shortcut'
const SHORTCUT_PERMISSION_MIN_SDK = 260121

type ShortcutWarning = 'permission-missing' | 'sdk-blocked' | 'missing-description'

interface ShortcutStatus {
  state: 'active' | 'conflict' | 'unavailable' | 'disabled'
  reason?:
    | 'conflict-system'
    | 'conflict-plugin'
    | 'register-failed'
    | 'register-error'
    | 'invalid'
    | 'runtime-missing'
    | 'disabled'
  conflictWith?: string[]
  warnings?: ShortcutWarning[]
}

type ShortcutWithStatus = Shortcut & { status?: ShortcutStatus }
type MainShortcutRegisterOptions = {
  enabled?: boolean
  owner?: string
  legacyDefaultAccelerators?: readonly string[]
  unavailableNotice?: MainShortcutUnavailableNotice
}
type MainTriggerRegisterOptions = {
  enabled?: boolean
  onStateChange?: (enabled: boolean) => void
  onTrigger?: () => void
  owner?: string
}

const isMacPlatform = process.platform === 'darwin'
/** Canonical token Escape normalises to; reserved as cancel, so it is never a binding. */
const ESCAPE_ACCELERATOR_TOKEN = 'Esc'
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

/**
 * macOS modifier names the settings recorder wrote on every platform, and what the normaliser calls
 * those keys off macOS. The recorder read its platform check (a computed ref) as a boolean, which
 * is always true, so on Windows and Linux the Windows key was stored as `Command` and Alt as
 * `Option`. `CommandOrControl` / `CmdOrCtrl` are not here: they are cross-platform on purpose.
 */
const MAC_ONLY_MODIFIER_NAMES = new Map<string, string>([
  ['COMMAND', 'Super'],
  ['CMD', 'Super'],
  ['OPTION', 'Alt'],
  ['OPT', 'Alt']
])

/**
 * `accelerator` with its macOS-only modifier names renamed for this platform, or `null` when there
 * is nothing to rename -- or when renaming would produce something the old value was not: a key
 * spelled like a modifier, or two copies of one modifier (`Command+Super+E`). Those are left as
 * they are; a value the user can still see and fix beats one silently rewritten into another.
 */
function renameMacOnlyModifiers(accelerator: string): string | null {
  const tokens = accelerator.split('+').map((token) => token.trim())
  const key = tokens.pop()
  if (!key || tokens.length === 0 || MAC_ONLY_MODIFIER_NAMES.has(key.toUpperCase())) return null

  const renamed = tokens.map((token) => MAC_ONLY_MODIFIER_NAMES.get(token.toUpperCase()) ?? token)
  if (renamed.every((token, index) => token === tokens[index])) return null
  if (new Set(renamed.map((token) => token.toUpperCase())).size !== renamed.length) return null
  return [...renamed, key].join('+')
}

export class ShortcutModule extends BaseModule {
  static key: symbol = Symbol.for('Shortcut')
  name: ModuleKey = ShortcutModule.key

  private storage?: ShortcutStorage
  private shortcutStatusMap = new Map<string, ShortcutStatus>()
  private isEnabled: boolean = true
  private disposeBeforeQuitListener: (() => void) | null = null
  private transport: ReturnType<typeof getTuffTransportMain> | null = null
  /** Ids of the shortcuts this launch has already told the user are left without a key. */
  private announcedNotices = new Set<string>()
  private bindingListeners = new Set<() => void>()
  /** Stored and effective key of every shortcut after the last pass, to publish only changes. */
  private bindingsSignature = ''

  constructor() {
    super(ShortcutModule.key, {
      create: false
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const storage = useMainStorage()
    this.storage = new ShortcutStorage({
      getConfig: storage.getConfig.bind(storage),
      saveConfig: storage.saveConfig.bind(storage)
    })
    const removedRetiredShortcuts = this.storage.removeShortcuts(RETIRED_GLOBAL_SHORTCUT_IDS)
    if (removedRetiredShortcuts > 0) {
      shortconLog.info(`Removed ${removedRetiredShortcuts} retired global shortcuts`)
    }
    this.renameRecordedMacModifiers()
    this.registerBeforeQuitTeardownListener()
    const runtime = resolveMainRuntime(ctx, 'ShortcutModule.onInit')
    this.transport = getTuffTransportMain(runtime.channel, resolveKeyManager(runtime.channel))
    this.setupIpcListeners(this.transport)
    this.reregisterAllShortcuts()
  }

  /**
   * Renames the macOS modifier names the recorder stored off macOS (see
   * {@link MAC_ONLY_MODIFIER_NAMES}) to this platform's, once per launch, before the first pass
   * registers anything. Idempotent: a renamed value has nothing left to rename.
   *
   * Only the values a user records: MAIN (settings, app launches) and FEATURE bindings. A plugin's
   * RENDERER shortcut is the plugin's own spelling, and the plugin writes it back on every load.
   * Each record is written on its own, so one that fails to write keeps its old value, in the store
   * and in this run, while the rest still move; the next launch tries it again.
   */
  private renameRecordedMacModifiers(): void {
    const storage = this.storage
    if (isMacPlatform || !storage) return

    for (const shortcut of storage.getAllShortcuts()) {
      if (shortcut.type !== ShortcutType.MAIN && shortcut.type !== ShortcutType.FEATURE) continue
      if (typeof shortcut.accelerator !== 'string') continue
      const renamed = renameMacOnlyModifiers(shortcut.accelerator)
      if (!renamed) continue

      try {
        storage.updateShortcutAccelerator(shortcut.id, renamed)
        shortconLog.info(`Renamed ${shortcut.id}: ${shortcut.accelerator} -> ${renamed}`)
      } catch (error) {
        // The store sets a value before saving it, so a failed save leaves the new one in memory.
        // Put the old one back; that sets first too, so it holds even if its own save fails.
        try {
          storage.updateShortcutAccelerator(shortcut.id, shortcut.accelerator)
        } catch {
          // Already restored in memory; see above.
        }
        shortconLog.warn(`Could not rename ${shortcut.id}; kept ${shortcut.accelerator}`, {
          error
        })
      }
    }
  }

  onDestroy(): MaybePromise<void> {
    if (this.disposeBeforeQuitListener) {
      this.disposeBeforeQuitListener()
      this.disposeBeforeQuitListener = null
    }
    this.transport = null
    this.teardownRuntimeRegistrations()
  }

  /**
   * Sets up IPC listeners for renderer processes to call.
   */
  private setupIpcListeners(transport: ReturnType<typeof getTuffTransportMain>): void {
    transport.on(shortconUpdateEvent, (data) => {
      const { id, accelerator, enabled } = data
      return this.updateShortcut(id, accelerator, enabled)
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

    transport.on(shortconGetBindingEvent, (data) => {
      const id = typeof data?.id === 'string' ? data.id : ''
      return this.getShortcutBinding(id)
    })

    transport.on(shortconGetFeatureEvent, (data) => {
      const pluginName = typeof data?.plugin === 'string' ? data.plugin : ''
      if (!pluginName) return {}
      return this.getFeatureShortcuts(pluginName)
    })

    // Host-only by construction: the plugin-facing allowlist does not carry these two, so a
    // plugin surface cannot bind a key on a feature - its own or anyone else's.
    transport.on(shortconSetFeatureEvent, (data) => {
      const pluginName = typeof data?.plugin === 'string' ? data.plugin : ''
      const featureId = typeof data?.feature === 'string' ? data.feature : ''
      const accelerator = typeof data?.accelerator === 'string' ? data.accelerator : ''
      return this.setFeatureShortcut(pluginName, featureId, accelerator)
    })

    transport.on(PluginEvents.shortcut.register, (payload, context) => {
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
   *
   * `options.unavailableNotice` tells the user when the default ends up with no key -- see
   * {@link announceUnavailableDefaults}. No other key ever stands in for it.
   */
  registerMainShortcut(
    id: string,
    defaultAccelerator: string,
    callback: () => void,
    options?: MainShortcutRegisterOptions
  ): boolean {
    if (mainCallbackRegistry.has(id)) {
      shortconLog.warn(`Main shortcut with ID ${id} is already registered.`)
      return false
    }

    mainCallbackRegistry.set(id, {
      callback,
      owner: options?.owner,
      defaultAccelerator,
      unavailableNotice: options?.unavailableNotice
    })

    const existingShortcut = this.storage!.getShortcutById(id)
    if (!existingShortcut) {
      this.storage!.addShortcut({
        id,
        accelerator: defaultAccelerator,
        type: ShortcutType.MAIN,
        meta: {
          creationTime: Date.now(),
          modificationTime: Date.now(),
          author: SYSTEM_SHORTCUT_AUTHOR,
          enabled: options?.enabled ?? true
        }
      })
    } else if (
      existingShortcut.meta?.author === SYSTEM_SHORTCUT_AUTHOR &&
      this.isRetiredDefault(
        existingShortcut.accelerator,
        defaultAccelerator,
        options?.legacyDefaultAccelerators
      )
    ) {
      this.storage!.updateShortcutAccelerator(id, defaultAccelerator)
    }

    shortconLog.success(`Main shortcut registered: ${id} (${defaultAccelerator})`)

    this.reregisterAllShortcuts()
    return true
  }

  /**
   * Whether a stored accelerator is one of the earlier defaults and not the current one.
   *
   * Compared through the normaliser: `CmdOrCtrl+E` and `commandorcontrol+e` are the stored
   * `CommandOrControl+E` written another way. A different accelerator is not, even one that
   * presses the same key on this platform (`Command+E` on macOS), because only the recorder writes
   * those and that is the user choosing it.
   */
  private isRetiredDefault(
    stored: string,
    defaultAccelerator: string,
    legacyDefaults?: readonly string[]
  ): boolean {
    if (!legacyDefaults?.length) return false
    const normalized = this.normalizeAccelerator(stored)
    if (!normalized || normalized === this.normalizeAccelerator(defaultAccelerator)) return false
    return legacyDefaults.some((legacy) => this.normalizeAccelerator(legacy) === normalized)
  }

  registerMainTrigger(
    id: string,
    triggerKind: ShortcutTriggerKind | string,
    options?: MainTriggerRegisterOptions
  ): boolean {
    if (mainTriggerRegistry.has(id)) {
      shortconLog.warn(`Main trigger with ID ${id} is already registered.`)
      return false
    }

    mainTriggerRegistry.set(id, {
      onStateChange: options?.onStateChange,
      onTrigger: options?.onTrigger,
      owner: options?.owner
    })

    const existingShortcut = this.storage!.getShortcutById(id)
    if (existingShortcut && existingShortcut.type !== ShortcutType.TRIGGER) {
      shortconLog.warn(`Shortcut with ID ${id} exists but is not trigger type.`)
      mainTriggerRegistry.delete(id)
      return false
    }

    if (!existingShortcut) {
      this.storage!.addShortcut({
        id,
        accelerator: triggerKind,
        type: ShortcutType.TRIGGER,
        meta: {
          creationTime: Date.now(),
          modificationTime: Date.now(),
          author: SYSTEM_SHORTCUT_AUTHOR,
          enabled: options?.enabled ?? true,
          triggerKind
        }
      })
    } else {
      let updated = false
      if (existingShortcut.accelerator !== triggerKind) {
        this.storage!.updateShortcutAccelerator(id, triggerKind)
        existingShortcut.accelerator = triggerKind
        updated = true
      }
      const meta = existingShortcut.meta
      if (meta && meta.triggerKind !== triggerKind) {
        meta.triggerKind = triggerKind
        meta.modificationTime = Date.now()
        updated = true
      }
      if (typeof options?.enabled === 'boolean' && meta?.enabled === undefined) {
        this.storage!.updateShortcutEnabled(id, options.enabled)
        this.ensureShortcutMeta(existingShortcut).enabled = options.enabled
        updated = true
      }
      if (updated) {
        this.persistShortcutMeta()
      }
    }

    shortconLog.success(`Main trigger registered: ${id} (${triggerKind})`)
    this.reregisterAllShortcuts()
    return true
  }

  unregisterMainShortcut(id: string): boolean {
    const removed = mainCallbackRegistry.delete(id)
    if (!removed) return false
    if (this.storage) {
      this.reregisterAllShortcuts()
    }
    return true
  }

  unregisterMainTrigger(id: string): boolean {
    const removed = mainTriggerRegistry.delete(id)
    if (!removed) return false
    if (this.storage) {
      this.reregisterAllShortcuts()
    }
    return true
  }

  /**
   * Registers or rebinds a shortcut that launches one application.
   *
   * Distinct from {@link registerMainShortcut}, which refuses a second registration for the same
   * id: that is right for a fixed system action wired once at boot, but an app binding is user
   * state — it gets rebound to a different key and unbound entirely, at runtime. Rebinding a
   * live id here replaces the accelerator and the callback rather than failing.
   */
  setAppShortcut(id: string, accelerator: string, callback: () => void): boolean {
    const normalized = this.normalizeAccelerator(accelerator)
    if (!normalized) {
      shortconLog.error(`Invalid accelerator for app shortcut ${id}: ${accelerator}`)
      return false
    }

    // Snapshotted before the first write. A rebind that the OS refuses has to leave the previous
    // accelerator working — by the time the verdict arrives, both the registry and the store hold
    // the new values, and the key the user was using is already gone.
    const previousCallback = mainCallbackRegistry.get(id)?.callback
    const previous = this.storage!.getShortcutById(id)

    mainCallbackRegistry.set(id, { callback })

    const existing = this.storage!.getShortcutById(id)
    if (existing) {
      if (existing.accelerator !== normalized) {
        this.storage!.updateShortcutAccelerator(id, normalized)
      }
      this.storage!.updateShortcutEnabled(id, true)
    } else {
      this.storage!.addShortcut({
        id,
        accelerator: normalized,
        type: ShortcutType.MAIN,
        meta: {
          creationTime: Date.now(),
          modificationTime: Date.now(),
          author: SYSTEM_SHORTCUT_AUTHOR,
          enabled: true
        }
      })
    }

    this.reregisterAllShortcuts()
    // The accelerator may be taken by the system or another binding; the caller needs to know,
    // and `reregisterAllShortcuts` has just recomputed that verdict.
    const state = this.shortcutStatusMap.get(id)?.state
    if (state === 'conflict' || state === 'unavailable') {
      this.restoreAppShortcut(id, previousCallback, previous)
      return false
    }

    // `disabled` is the global shortcut switch rather than this key: the binding is stored and
    // becomes live again when the user re-enables shortcuts.
    return true
  }

  /**
   * Puts a binding back the way it was after an attempt that will not fire.
   *
   * `conflict` and `unavailable` both mean the accelerator never reaches this callback, so the
   * attempt is rolled back instead of being left as the user's binding: keeping it would report a
   * failure while silently having discarded the key that used to work.
   */
  private restoreAppShortcut(id: string, previousCallback?: () => void, previous?: Shortcut): void {
    if (previousCallback) {
      mainCallbackRegistry.set(id, { callback: previousCallback })
    } else {
      mainCallbackRegistry.delete(id)
    }

    if (previous) {
      this.storage!.updateShortcutAccelerator(id, previous.accelerator)
      this.storage!.updateShortcutEnabled(id, previous.meta?.enabled ?? true)
    } else {
      // Nothing was bound before, so the attempted accelerator is left in the store for no key
      // that fires.
      this.storage!.removeShortcuts([id])
    }

    this.reregisterAllShortcuts()
  }

  /** Removes an app shortcut entirely, both its callback and its stored accelerator. */
  removeAppShortcut(id: string): boolean {
    mainCallbackRegistry.delete(id)
    const removed = this.storage?.removeShortcuts([id]) ?? 0
    if (removed > 0) this.reregisterAllShortcuts()
    return removed > 0
  }

  getShortcutAccelerator(id: string): string | null {
    return this.storage?.getShortcutById(id)?.accelerator ?? null
  }

  /**
   * The accelerator that fires `id` right now, or `null` when no key does: disabled, refused by
   * the OS, lost an in-app conflict, or not registered yet.
   *
   * What a surface prints next to an action. The stored value is the wrong thing to print when it
   * is not registered, because it names a key that does nothing.
   */
  getEffectiveAccelerator(id: string): string | null {
    const shortcut = this.storage?.getShortcutById(id)
    return shortcut
      ? this.resolveEffectiveAccelerator(shortcut, this.shortcutStatusMap.get(id))
      : null
  }

  getShortcutBinding(id: string): ShortcutBinding {
    return {
      configured: id ? this.getShortcutAccelerator(id) : null,
      effective: id ? this.getEffectiveAccelerator(id) : null
    }
  }

  /**
   * Called after a registration pass that changed a stored or effective key, for in-process
   * surfaces that bake a key into a native object (the tray menu). Returns the unsubscribe.
   */
  onBindingsChanged(listener: () => void): () => void {
    this.bindingListeners.add(listener)
    return () => {
      this.bindingListeners.delete(listener)
    }
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
        enabled: true,
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
   * Bind, rebind or clear the accelerator the user put on one plugin feature.
   *
   * Separate from `registerRendererShortcut` because the two have different owners: that one is
   * called by a plugin for itself and is gated on the plugin holding `system.shortcut`, while
   * this is the user binding a key from the feature manager, where no plugin is asking for
   * anything. Requiring the permission here would let a plugin refuse the user a keybinding on
   * the plugin's own feature.
   *
   * An empty `accelerator` removes the binding, which is what the clear button in the row sends.
   */
  setFeatureShortcut(pluginName: string, featureId: string, accelerator: string): boolean {
    if (!pluginName || !featureId) return false

    const id = buildFeatureShortcutId(pluginName, featureId)
    const existing = this.storage!.getShortcutById(id)

    if (!accelerator.trim()) {
      if (!existing) return true
      this.storage!.removeShortcuts([id])
      this.reregisterAllShortcuts()
      shortconLog.success(`Feature shortcut cleared: ${id}`)
      return true
    }

    const normalized = this.normalizeAccelerator(accelerator)
    if (!normalized) {
      shortconLog.error(`Invalid accelerator for feature shortcut ${id}: ${accelerator}`)
      return false
    }

    if (existing) {
      this.storage!.updateShortcutAccelerator(id, normalized)
      this.storage!.updateShortcutEnabled(id, true)
    } else {
      this.storage!.addShortcut({
        id,
        accelerator: normalized,
        type: ShortcutType.FEATURE,
        meta: {
          creationTime: Date.now(),
          modificationTime: Date.now(),
          author: pluginName,
          enabled: true,
          featureId
        }
      })
    }

    this.reregisterAllShortcuts()
    shortconLog.success(`Feature shortcut bound: ${id} (${normalized})`)
    return true
  }

  /**
   * Every feature binding for one plugin, keyed by feature id.
   *
   * Keyed by what the *id* says rather than by `meta.featureId`: the id is what the trigger
   * resolves, so a row keyed off drifted metadata would show a binding on a feature that a key
   * press would never reach.
   */
  getFeatureShortcuts(pluginName: string): Record<string, ShortcutWithStatus> {
    const statusMap = this.shortcutStatusMap
    const result: Record<string, ShortcutWithStatus> = {}

    for (const shortcut of this.storage?.getAllShortcuts() ?? []) {
      if (shortcut.type !== ShortcutType.FEATURE) continue
      const target = parseFeatureShortcutId(shortcut.id)
      if (!target || target.pluginName !== pluginName) continue
      result[target.featureId] = { ...shortcut, status: statusMap.get(shortcut.id) }
    }

    return result
  }

  /**
   * Updates the accelerator for a given shortcut ID.
   */
  updateShortcut(id: string, newAccelerator?: string, enabled?: boolean): boolean {
    let updated = false
    if (typeof newAccelerator === 'string' && newAccelerator.trim().length > 0) {
      updated = this.storage!.updateShortcutAccelerator(id, newAccelerator)
    }
    if (typeof enabled === 'boolean') {
      const enabledUpdated = this.storage!.updateShortcutEnabled(id, enabled)
      updated = updated || enabledUpdated
    }
    if (updated) {
      this.reregisterAllShortcuts()
    }
    return updated
  }

  /**
   * Disables all currently active global shortcuts.
   */
  disableAll(): void {
    if (!this.isEnabled) return
    globalShortcut.unregisterAll()
    this.isEnabled = false
    this.syncMainTriggerStates(new Map<string, ShortcutStatus>())
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
   * `Shortcut.meta` is typed as required, but this file guards it with `?.` in a dozen places
   * because records written by an older schema, a hand-edited store or a partial write reach us
   * without one. Writing through the guarded value then threw, and since reregisterAllShortcuts
   * starts with globalShortcut.unregisterAll(), that TypeError took every shortcut down with it
   * -- including the CoreBox trigger -- until the app restarted (#776).
   */
  private ensureShortcutMeta(shortcut: Shortcut): ShortcutMeta {
    if (!shortcut.meta) {
      const now = Date.now()
      shortcut.meta = {
        creationTime: now,
        modificationTime: now,
        author: SYSTEM_SHORTCUT_AUTHOR
      }
    }
    return shortcut.meta
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
      // One malformed record must not abort classification: the loop runs after
      // unregisterAll(), so throwing here leaves every shortcut unregistered.
      try {
        if (shortcut.meta?.enabled === false) {
          statusMap.set(shortcut.id, { state: 'disabled', reason: 'disabled' })
          continue
        }
        if (shortcut.type === ShortcutType.TRIGGER) {
          if (!mainTriggerRegistry.has(shortcut.id)) {
            statusMap.set(shortcut.id, { state: 'unavailable', reason: 'runtime-missing' })
            continue
          }
          const triggerKind =
            typeof shortcut.meta?.triggerKind === 'string' &&
            shortcut.meta.triggerKind.trim().length > 0
              ? shortcut.meta.triggerKind
              : shortcut.accelerator

          if (!triggerKind) {
            statusMap.set(shortcut.id, { state: 'unavailable', reason: 'invalid' })
            shortconLog.error(`Invalid trigger kind for shortcut ${shortcut.id}`)
            continue
          }

          if (shortcut.accelerator !== triggerKind) {
            this.storage!.updateShortcutAccelerator(shortcut.id, triggerKind)
            shortcut.accelerator = triggerKind
          }
          if (shortcut.meta?.triggerKind !== triggerKind) {
            const meta = this.ensureShortcutMeta(shortcut)
            meta.triggerKind = triggerKind
            meta.modificationTime = Date.now()
            this.persistShortcutMeta()
          }

          statusMap.set(shortcut.id, { state: 'active' })
          continue
        }

        if (shortcut.type === ShortcutType.MAIN && !mainCallbackRegistry.has(shortcut.id)) {
          statusMap.set(shortcut.id, { state: 'unavailable', reason: 'runtime-missing' })
          continue
        }

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
        // Grouped by the key the platform presses, not by string. `Option+Space` beside
        // `Alt+Space` on macOS is one key: grouped by string, both reached `register`, Electron
        // refused the later one, and settings showed a failure instead of the conflict.
        const group = [...groupedByAccelerator].find(([grouped]) =>
          acceleratorsMatch(grouped, normalizedAccelerator, process.platform)
        )?.[1]
        if (group) {
          group.push(shortcut)
        } else {
          groupedByAccelerator.set(normalizedAccelerator, [shortcut])
        }
      } catch (error) {
        statusMap.set(shortcut.id, { state: 'unavailable', reason: 'invalid' })
        shortconLog.error(`Failed to classify shortcut ${shortcut.id}`, { error })
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

    this.announceUnavailableDefaults(allShortcuts, statusMap)

    this.shortcutStatusMap = statusMap
    this.syncMainTriggerStates(statusMap)
    this.publishBindings(allShortcuts, statusMap)
    shortconLog.success(`Successfully registered ${successCount} shortcuts`)
  }

  /**
   * Tells the user, once per launch, about a system default that ended the pass with no key.
   *
   * No other key stands in for it. The stored default is left as it is, so the next pass and the
   * next launch try it again, and settings shows on its row why it does nothing.
   *
   * A default is left without a key in two ways, and the notice says which:
   *
   * - The OS refused it (`register-failed` / `register-error`). Windows refuses a key another app
   *   holds. macOS does not: Electron registers Carbon hotkeys without the exclusive flag, so they
   *   succeed while another app holds the same key, and a refusal there only comes from inside
   *   this process. The copy therefore names no cause.
   * - It lost an in-app conflict: a built-in shortcut stored before it was set to the same key (on
   *   a fresh profile the screenshot, voice and local AI records precede CoreBox's). The copy names
   *   that shortcut when settings has a label for it.
   *
   * Only a binding still on its system default qualifies. A key the user chose that does nothing is
   * theirs to see and change in settings, where they set it.
   */
  private announceUnavailableDefaults(
    shortcuts: Shortcut[],
    statusMap: Map<string, ShortcutStatus>
  ): void {
    for (const shortcut of shortcuts) {
      const status = statusMap.get(shortcut.id)
      if (!status || !this.isLeftWithoutKey(status)) continue
      const notice = this.resolveUnavailableNotice(shortcut)
      if (notice) this.announceUnavailableDefault(shortcut, status, notice)
    }
  }

  /** The OS refused the key, or the binding lost an in-app conflict for it. */
  private isLeftWithoutKey(status: ShortcutStatus): boolean {
    if (status.state === 'conflict') return true
    return (
      status.state === 'unavailable' &&
      (status.reason === 'register-failed' || status.reason === 'register-error')
    )
  }

  /** The notice `shortcut` asked for, when it is a system binding still on its default. */
  private resolveUnavailableNotice(shortcut: Shortcut): MainShortcutUnavailableNotice | null {
    if (shortcut.type !== ShortcutType.MAIN) return null
    if (shortcut.meta?.author !== SYSTEM_SHORTCUT_AUTHOR) return null
    const registration = mainCallbackRegistry.get(shortcut.id)
    if (!registration?.unavailableNotice || !registration.defaultAccelerator) return null
    // The main loop has normalized the stored value already; the default is read the same way.
    if (shortcut.accelerator !== this.normalizeAccelerator(registration.defaultAccelerator)) {
      return null
    }
    return registration.unavailableNotice
  }

  /**
   * One notice per shortcut and launch, whichever way it lost its key. Every pass finds it keyless
   * again (each module registering at startup runs one, and so does every settings edit), and the
   * user needs to hear it once. The id is marked before the notice is shown, so a notice that
   * throws is not retried on every pass.
   */
  private announceUnavailableDefault(
    shortcut: Shortcut,
    status: ShortcutStatus,
    notice: MainShortcutUnavailableNotice
  ): void {
    if (this.announcedNotices.has(shortcut.id)) return
    this.announcedNotices.add(shortcut.id)

    try {
      const label = acceleratorLabel(shortcut.accelerator, process.platform)
      let message: string
      if (status.state === 'conflict') {
        const other = this.resolveShortcutLabel(status.conflictWith?.[0])
        message = other
          ? t(notice.conflictNamedBodyKey, { shortcut: label, other })
          : t(notice.conflictBodyKey, { shortcut: label })
      } else {
        message = t(notice.refusedBodyKey, { shortcut: label })
      }
      notificationModule.showInternalSystemNotification({
        id: `shortcut-unavailable:${shortcut.id}`,
        title: t(notice.titleKey, { shortcut: label }),
        message,
        level: 'error',
        dedupeKey: `shortcut-unavailable:${shortcut.id}`,
        system: { silent: false }
      })
    } catch (error) {
      shortconLog.warn(`Failed to show the no-key notice for ${shortcut.id}`, { error })
    }
  }

  /**
   * What the settings list calls shortcut `id` -- the `settingTools.shortcutLabels.<id>` key that
   * `SettingTools.vue` reads -- or `null` when it has none there. Settings then prints the raw id,
   * which reads as noise in a sentence.
   */
  private resolveShortcutLabel(id: string | undefined): string | null {
    if (!id) return null
    const key = `settingTools.shortcutLabels.${id.replace(/[.:-]/g, '_')}`
    const label = t(key)
    return label && label !== key ? label : null
  }

  private resolveEffectiveAccelerator(
    shortcut: Shortcut,
    status: ShortcutStatus | undefined
  ): string | null {
    if (!status) return null
    // A trigger's "accelerator" is a gesture kind, not a key anyone can press.
    if (status.state !== 'active' || shortcut.type === ShortcutType.TRIGGER) return null
    return shortcut.accelerator || null
  }

  /**
   * Tells in-process listeners and every window that a key changed. Most passes change nothing a
   * surface prints (each module registering at startup runs one), so only a change is published.
   */
  private publishBindings(shortcuts: Shortcut[], statusMap: Map<string, ShortcutStatus>): void {
    const signature = JSON.stringify(
      shortcuts.map((shortcut) => [
        shortcut.id,
        shortcut.accelerator,
        this.resolveEffectiveAccelerator(shortcut, statusMap.get(shortcut.id))
      ])
    )
    if (signature === this.bindingsSignature) return
    this.bindingsSignature = signature

    for (const listener of [...this.bindingListeners]) {
      try {
        listener()
      } catch (error) {
        shortconLog.warn('Shortcut binding listener failed', { error })
      }
    }
    try {
      this.transport?.broadcast(shortconChangedEvent, undefined)
    } catch (error) {
      shortconLog.warn('Failed to broadcast shortcut binding change', { error })
    }
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
      warnings.push('sdk-blocked')
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
    if (shortcut.type === ShortcutType.MAIN || shortcut.type === ShortcutType.TRIGGER) {
      return true
    }
    return shortcut.meta?.author === SYSTEM_SHORTCUT_AUTHOR
  }

  private syncMainTriggerStates(statusMap: Map<string, ShortcutStatus>): void {
    for (const [id, registration] of mainTriggerRegistry.entries()) {
      const status = statusMap.get(id)
      const active = this.isEnabled && status?.state === 'active'
      try {
        registration.onStateChange?.(active)
      } catch (error) {
        shortconLog.warn(`Failed to sync trigger state for ${id}`, { error })
      }
    }
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
        const registration = mainCallbackRegistry.get(shortcut.id)
        if (registration?.callback) {
          registration.callback()
        } else {
          shortconLog.error(`No main-process callback found for shortcut ID: ${shortcut.id}`)
        }
        break
      }
      case ShortcutType.RENDERER: {
        const allWindows = BrowserWindow.getAllWindows()
        const transport = this.transport
        if (!transport) {
          shortconLog.warn('Shortcut transport is not initialized', {
            meta: { shortcutId: shortcut.id }
          })
          break
        }
        const triggerId = this.getShortcutTriggerId(shortcut)
        const pluginName = shortcut.meta?.author
        if (pluginName && pluginName !== SYSTEM_SHORTCUT_AUTHOR) {
          void transport
            .sendToPlugin(pluginName, PluginEvents.shortcut.trigger, { id: triggerId })
            .catch(() => {})
          break
        }
        for (const win of allWindows) {
          void transport
            .sendToWindow(win.id, PluginEvents.shortcut.trigger, { id: triggerId })
            .catch(() => {})
        }
        shortconLog.debug(`Forwarded trigger '${triggerId}' to all renderer processes`)
        break
      }
      case ShortcutType.TRIGGER: {
        const registration = mainTriggerRegistry.get(shortcut.id)
        if (!registration?.onTrigger) {
          shortconLog.debug(`Trigger shortcut ${shortcut.id} has no onTrigger callback`)
          return
        }
        registration.onTrigger()
        break
      }
      case ShortcutType.FEATURE: {
        // The user bound this to a feature from the feature manager, so the host runs it rather
        // than notifying the plugin: unlike a RENDERER trigger, this works whether or not the
        // plugin wrote a listener for it.
        //
        // Imported here rather than at module scope: running a feature reaches CoreBox and the
        // plugin view loader, and pulling that graph in just to *list* bindings would make this
        // module impossible to load without the whole box-tool stack behind it.
        void import('./plugin/services/feature-shortcut-service')
          .then((module) => module.triggerFeatureShortcut(shortcut.id))
          .catch((error) => {
            shortconLog.error(`Feature shortcut failed: ${shortcut.id}`, { error })
          })
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

    // Escape is the cancel key everywhere else in the app, so it never holds a global binding.
    // Refusing it here covers the write paths and every re-registration, without touching reads:
    // an already-stored Escape still reads back, so the user can see and clear it.
    if (normalizedTokens[normalizedTokens.length - 1] === ESCAPE_ACCELERATOR_TOKEN) {
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

  private registerBeforeQuitTeardownListener(): void {
    if (this.disposeBeforeQuitListener) {
      return
    }
    const handler = () => {
      this.teardownRuntimeRegistrations()
    }
    touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, handler)
    this.disposeBeforeQuitListener = () => {
      touchEventBus.off(TalexEvents.BEFORE_APP_QUIT, handler)
    }
  }

  private teardownRuntimeRegistrations(): void {
    globalShortcut.unregisterAll()
    mainCallbackRegistry.clear()
    mainTriggerRegistry.clear()
    this.shortcutStatusMap = new Map()
    this.bindingsSignature = ''
  }
}

const shortcutModule = new ShortcutModule()

export { shortcutModule }
