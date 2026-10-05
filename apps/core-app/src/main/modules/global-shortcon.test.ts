import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import {
  ShortcutTriggerKind,
  ShortcutType
} from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

// global-shortcon.ts computes `isMacPlatform` at module scope, so the Option/Alt
// spelling is fixed the moment it is imported -- a beforeAll pin would be too
// late. Hoisted so it runs before the import graph; the suite covers migration
// of a persisted default, and only the token spelling is platform-specific.
const originalPlatform = vi.hoisted(() => {
  const previous = process.platform
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  return previous
})

afterAll(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

const electronMocks = vi.hoisted(() => ({
  register: vi.fn<(accelerator: string, callback: () => void) => boolean>(() => true),
  unregisterAll: vi.fn(),
  getAllWindows: vi.fn(() => [])
}))

const mainStorageMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn()
}))

const noticeMocks = vi.hoisted(() => {
  // The one settings label this fake locale carries. Any other key without params comes back as
  // itself, which is what the real `t` returns for a key it cannot find.
  const labels: Record<string, string> = {
    'settingTools.shortcutLabels.screenshot_tool_start': 'Take a screenshot'
  }
  return {
    showInternalSystemNotification: vi.fn(),
    // Key plus params, so an assertion reads which copy was chosen and what was put into it.
    t: vi.fn((key: string, params?: Record<string, string | number>) =>
      params ? `${key} ${JSON.stringify(params)}` : (labels[key] ?? key)
    )
  }
})

/**
 * What `onInit` wires onto the transport, keyed by the event object itself: a lookup with the
 * shared event finds a handler only if the module registered that same event, not a copy that
 * happens to carry the same name.
 */
const transportMocks = vi.hoisted(() => ({
  handlers: new Map<unknown, (payload: unknown) => unknown>(),
  broadcast: vi.fn()
}))

const eventBusMocks = vi.hoisted(() => {
  const handlers = new Map<string, Set<(event: unknown) => void>>()
  const on = (event: string, handler: (payload: unknown) => void) => {
    const set = handlers.get(event) ?? new Set()
    set.add(handler)
    handlers.set(event, set)
  }
  const off = (event: string, handler: (payload: unknown) => void): boolean => {
    const set = handlers.get(event)
    if (!set) return false
    return set.delete(handler)
  }
  const emit = (event: string, payload: unknown) => {
    const set = handlers.get(event)
    if (!set) return
    for (const handler of [...set]) {
      handler(payload)
    }
  }
  return {
    TalexEvents: {
      BEFORE_APP_QUIT: 'app-before-quit',
      PLUGIN_STATUS_CHANGED: 'plugin/status-changed'
    },
    touchEventBus: {
      on,
      off,
      emit
    }
  }
})

vi.mock('electron', () => ({
  globalShortcut: {
    register: electronMocks.register,
    unregisterAll: electronMocks.unregisterAll
  },
  BrowserWindow: {
    getAllWindows: electronMocks.getAllWindows
  }
}))

vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn()
  })
}))

vi.mock('../core/eventbus/touch-event', () => ({
  TalexEvents: eventBusMocks.TalexEvents,
  touchEventBus: eventBusMocks.touchEventBus
}))

vi.mock('./storage', () => ({
  useMainStorage: () => mainStorageMocks
}))

vi.mock('./plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: null
  }
}))

vi.mock('./permission', () => ({
  getPermissionModule: () => null
}))

vi.mock('./notification', () => ({
  notificationModule: {
    showInternalSystemNotification: noticeMocks.showInternalSystemNotification
  }
}))

vi.mock('../utils/i18n-helper', () => ({
  t: noticeMocks.t
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => ({
    on: vi.fn((event: unknown, handler: (payload: unknown) => unknown) => {
      transportMocks.handlers.set(event, handler)
      return () => {}
    }),
    broadcast: transportMocks.broadcast
  })
}))

import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { acceleratorsMatch } from '../../shared/accelerator-label'
import { shortconChangedEvent, shortconGetBindingEvent } from '../../shared/events/shortcut-binding'
import { ShortcutModule } from './global-shortcon'
import { pluginModule } from './plugin/plugin-module'
import { buildFeatureShortcutId } from './plugin/services/feature-shortcut-id'

type MutableShortcut = Shortcut & {
  meta: NonNullable<Shortcut['meta']> & {
    triggerKind?: string
    shortcutId?: string
  }
}

class InMemoryShortcutStorage {
  private readonly shortcuts = new Map<string, MutableShortcut>()

  /** Public reads are isolated snapshots, matching the real storage contract. */
  getShortcutById(id: string): MutableShortcut | undefined {
    const shortcut = this.shortcuts.get(id)
    return shortcut ? structuredClone(shortcut) : undefined
  }

  addShortcut(shortcut: Shortcut): void {
    this.shortcuts.set(shortcut.id, structuredClone(shortcut) as MutableShortcut)
  }

  getAllShortcuts(): MutableShortcut[] {
    return Array.from(this.shortcuts.values(), (shortcut) => structuredClone(shortcut))
  }

  updateShortcutAccelerator(id: string, accelerator: string, enabled?: boolean): boolean {
    const shortcut = this.shortcuts.get(id)
    if (!shortcut) return false
    shortcut.accelerator = accelerator
    if (typeof enabled === 'boolean') shortcut.meta.enabled = enabled
    shortcut.meta.modificationTime = Date.now()
    return true
  }

  updateShortcutEnabled(id: string, enabled: boolean): boolean {
    const shortcut = this.shortcuts.get(id)
    if (!shortcut) return false
    shortcut.meta.enabled = enabled
    shortcut.meta.modificationTime = Date.now()
    return true
  }

  removeShortcuts(ids: readonly string[]): number {
    let removed = 0
    for (const id of ids) {
      if (this.shortcuts.delete(id)) removed += 1
    }
    return removed
  }
}

type ShortcutModuleHarness = Omit<
  ShortcutModule,
  | 'storage'
  | 'registerMainShortcut'
  | 'unregisterMainShortcut'
  | 'registerMainTrigger'
  | 'unregisterMainTrigger'
  | 'registerBeforeQuitTeardownListener'
  | 'shortcutStatusMap'
  | 'reregisterAllShortcuts'
  | 'onDestroy'
> & {
  storage: InMemoryShortcutStorage
  registerMainShortcut: ShortcutModule['registerMainShortcut']
  unregisterMainShortcut: ShortcutModule['unregisterMainShortcut']
  registerMainTrigger: ShortcutModule['registerMainTrigger']
  unregisterMainTrigger: ShortcutModule['unregisterMainTrigger']
  registerBeforeQuitTeardownListener?: () => void
  shortcutStatusMap?: Map<string, { state?: string; reason?: string; conflictWith?: string[] }>
  reregisterAllShortcuts?: () => void
  onDestroy: ShortcutModule['onDestroy']
}

function createModule() {
  const module = new ShortcutModule() as unknown as ShortcutModuleHarness
  const storage = new InMemoryShortcutStorage()
  module.storage = storage
  return { module, storage }
}

afterEach(() => {
  electronMocks.register.mockClear()
  electronMocks.unregisterAll.mockClear()
  electronMocks.getAllWindows.mockClear()
  mainStorageMocks.getConfig.mockReset()
  mainStorageMocks.saveConfig.mockReset()
  noticeMocks.showInternalSystemNotification.mockClear()
  noticeMocks.t.mockClear()
  transportMocks.handlers.clear()
  transportMocks.broadcast.mockClear()
})

describe('ShortcutModule survives a malformed shortcut record', () => {
  /**
   * Shortcut.meta is typed as required, but this module guards it with `?.` in a dozen places
   * because older schemas and partial writes produce records without one (#776). The
   * classification loop then wrote through the guarded value and threw -- after
   * globalShortcut.unregisterAll() had already run, so nothing was re-registered.
   *
   * Classification must keep this trigger usable without relying on mutable public storage reads.
   */
  function seedTrigger(module: ShortcutModuleHarness, storage: InMemoryShortcutStorage): void {
    module.registerMainTrigger('core.test.trigger', ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS, {
      enabled: true,
      onStateChange: vi.fn(),
      owner: 'test'
    })
    storage.addShortcut({
      id: 'core.test.trigger',
      accelerator: ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS,
      type: ShortcutType.TRIGGER
    } as unknown as Shortcut)
  }

  it('keeps a trigger without persisted meta usable during classification', () => {
    const { module, storage } = createModule()
    seedTrigger(module, storage)

    module.reregisterAllShortcuts?.()

    expect(module.shortcutStatusMap?.get('core.test.trigger')?.state).toBe('active')

    module.onDestroy()
  })

  it('单条记录抛错不会让其它快捷键失去注册', () => {
    const { module } = createModule()

    // Both must be registered through registerMainShortcut, otherwise the classification loop
    // skips them at the mainCallbackRegistry check and never reaches the fault.
    module.registerMainShortcut('core.test.main', 'CommandOrControl+Shift+K', vi.fn())
    module.registerMainShortcut('core.test.broken', 'CommandOrControl+Shift+J', vi.fn())

    // A per-record fault, standing in for anything the classification loop can hit on one
    // shortcut. Injected after registration so setup does not trip over it.
    const internals = module as unknown as {
      normalizeAccelerator: (accelerator: string) => string | null
    }
    const originalNormalize = internals.normalizeAccelerator.bind(module)
    internals.normalizeAccelerator = (accelerator: string): string | null => {
      if (accelerator === 'CommandOrControl+Shift+J') throw new Error('malformed record')
      return originalNormalize(accelerator)
    }

    electronMocks.register.mockClear()
    expect(() => module.reregisterAllShortcuts?.()).not.toThrow()
    expect(electronMocks.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+K',
      expect.any(Function)
    )

    module.onDestroy()
  })
})

describe('ShortcutModule retired shortcut migration', () => {
  it('removes retired IDs before the initial global registration pass', () => {
    const timestamp = Date.now()
    mainStorageMocks.getConfig.mockReturnValue([
      {
        id: 'core.box.aiQuickCall',
        accelerator: 'CommandOrControl+Shift+I',
        type: ShortcutType.MAIN,
        meta: {
          creationTime: timestamp,
          modificationTime: timestamp,
          author: 'system',
          enabled: false
        }
      },
      {
        id: 'flow:detach-to-divisionbox',
        accelerator: 'CommandOrControl+D',
        type: ShortcutType.MAIN,
        meta: {
          creationTime: timestamp,
          modificationTime: timestamp,
          author: 'system',
          enabled: true
        }
      },
      {
        id: 'flow:transfer-to-plugin',
        accelerator: 'CommandOrControl+Shift+D',
        type: ShortcutType.MAIN,
        meta: {
          creationTime: timestamp,
          modificationTime: timestamp,
          author: 'system',
          enabled: true
        }
      },
      {
        id: 'core.box.toggle',
        accelerator: 'CommandOrControl+E',
        type: ShortcutType.MAIN,
        meta: {
          creationTime: timestamp,
          modificationTime: timestamp,
          author: 'system',
          enabled: true
        }
      }
    ])

    const module = new ShortcutModule()
    module.onInit({
      app: {},
      runtime: { channel: {} }
    } as unknown as Parameters<ShortcutModule['onInit']>[0])

    expect(mainStorageMocks.saveConfig).toHaveBeenCalledTimes(1)
    const persistedShortcuts = JSON.parse(String(mainStorageMocks.saveConfig.mock.calls[0]?.[1]))
    expect(persistedShortcuts.map((shortcut: Shortcut) => shortcut.id)).toEqual(['core.box.toggle'])
    expect(electronMocks.register).not.toHaveBeenCalled()

    module.onDestroy()
  })
})

describe('ShortcutModule runtime cleanup', () => {
  it('keeps persisted main shortcut but skips registration after runtime unregister', () => {
    const { module, storage } = createModule()

    const callback = vi.fn()
    expect(
      module.registerMainShortcut('core.test.main', 'CommandOrControl+K', callback, {
        owner: 'test'
      })
    ).toBe(true)
    electronMocks.register.mockClear()
    electronMocks.unregisterAll.mockClear()

    expect(module.unregisterMainShortcut('core.test.main')).toBe(true)
    expect(storage.getShortcutById('core.test.main')).toBeDefined()
    expect(electronMocks.unregisterAll).toHaveBeenCalledTimes(1)
    expect(electronMocks.register).not.toHaveBeenCalled()

    const status = module.shortcutStatusMap?.get('core.test.main')
    expect(status?.state).toBe('unavailable')
    expect(status?.reason).toBe('runtime-missing')

    module.onDestroy()
  })

  it('migrates a persisted system default without overwriting a customized shortcut', () => {
    const { module, storage } = createModule()
    const timestamp = Date.now()
    storage.addShortcut({
      id: 'core.test.legacy-default',
      accelerator: 'CommandOrControl+Shift+S',
      type: ShortcutType.MAIN,
      meta: {
        creationTime: timestamp,
        modificationTime: timestamp,
        author: 'system',
        enabled: true
      }
    })
    storage.addShortcut({
      id: 'core.test.customized',
      accelerator: 'CommandOrControl+Option+7',
      type: ShortcutType.MAIN,
      meta: {
        creationTime: timestamp,
        modificationTime: timestamp,
        author: 'system',
        enabled: true
      }
    })

    expect(
      module.registerMainShortcut('core.test.legacy-default', 'CommandOrControl+Shift+A', vi.fn(), {
        owner: 'test',
        legacyDefaultAccelerators: ['CommandOrControl+Shift+S']
      })
    ).toBe(true)
    expect(
      module.registerMainShortcut('core.test.customized', 'CommandOrControl+Shift+A', vi.fn(), {
        owner: 'test',
        legacyDefaultAccelerators: ['CommandOrControl+Shift+S']
      })
    ).toBe(true)

    expect(storage.getShortcutById('core.test.legacy-default')?.accelerator).toBe(
      'CommandOrControl+Shift+A'
    )
    expect(storage.getShortcutById('core.test.customized')?.accelerator).toBe(
      'CommandOrControl+Option+7'
    )

    module.unregisterMainShortcut('core.test.legacy-default')
    module.unregisterMainShortcut('core.test.customized')
    module.onDestroy()
  })

  it('keeps persisted trigger but skips registration after runtime unregister', () => {
    const { module, storage } = createModule()

    const onStateChange = vi.fn()
    expect(
      module.registerMainTrigger('core.test.trigger', ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS, {
        enabled: true,
        onStateChange,
        owner: 'test'
      })
    ).toBe(true)
    onStateChange.mockClear()
    electronMocks.register.mockClear()
    electronMocks.unregisterAll.mockClear()

    expect(module.unregisterMainTrigger('core.test.trigger')).toBe(true)
    expect(storage.getShortcutById('core.test.trigger')).toBeDefined()
    expect(electronMocks.unregisterAll).toHaveBeenCalledTimes(1)
    expect(electronMocks.register).not.toHaveBeenCalled()
    expect(onStateChange).not.toHaveBeenCalled()

    const status = module.shortcutStatusMap?.get('core.test.trigger')
    expect(status?.state).toBe('unavailable')
    expect(status?.reason).toBe('runtime-missing')

    module.onDestroy()
  })

  it('tears down runtime registrations on BEFORE_APP_QUIT without firing trigger callbacks', () => {
    const { module } = createModule()

    const onStateChange = vi.fn()
    module.registerMainTrigger('core.test.beforequit', ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS, {
      enabled: true,
      onStateChange,
      owner: 'test'
    })
    onStateChange.mockClear()

    module.registerBeforeQuitTeardownListener?.()
    touchEventBus.emit(TalexEvents.BEFORE_APP_QUIT, { name: TalexEvents.BEFORE_APP_QUIT })

    expect(onStateChange).not.toHaveBeenCalled()
    expect(module.unregisterMainTrigger('core.test.beforequit')).toBe(false)
    expect(electronMocks.unregisterAll).toHaveBeenCalled()

    module.onDestroy()
  })

  it('tears down runtime registrations on onDestroy without firing trigger callbacks', () => {
    const { module } = createModule()

    const onStateChange = vi.fn()
    module.registerMainTrigger('core.test.ondestroy', ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS, {
      enabled: true,
      onStateChange,
      owner: 'test'
    })
    onStateChange.mockClear()
    electronMocks.unregisterAll.mockClear()

    module.onDestroy()

    expect(onStateChange).not.toHaveBeenCalled()
    expect(electronMocks.unregisterAll).toHaveBeenCalled()
    expect(module.unregisterMainTrigger('core.test.ondestroy')).toBe(false)
  })

  it('does not register persisted MAIN/TRIGGER shortcuts when runtime handlers are missing', () => {
    const { module, storage } = createModule()

    storage.addShortcut({
      id: 'core.test.missing-main',
      accelerator: 'CommandOrControl+M',
      type: ShortcutType.MAIN,
      meta: {
        creationTime: Date.now(),
        modificationTime: Date.now(),
        author: 'system',
        enabled: true
      }
    })
    storage.addShortcut({
      id: 'core.test.missing-trigger',
      accelerator: ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS,
      type: ShortcutType.TRIGGER,
      meta: {
        creationTime: Date.now(),
        modificationTime: Date.now(),
        author: 'system',
        enabled: true,
        triggerKind: ShortcutTriggerKind.MOUSE_RIGHT_LONG_PRESS
      }
    })

    module.reregisterAllShortcuts?.()

    expect(electronMocks.register).not.toHaveBeenCalled()
    expect(module.shortcutStatusMap?.get('core.test.missing-main')?.reason).toBe('runtime-missing')
    expect(module.shortcutStatusMap?.get('core.test.missing-trigger')?.reason).toBe(
      'runtime-missing'
    )

    module.onDestroy()
  })
})

describe('ShortcutModule plugin shortcuts follow their plugin', () => {
  type PluginShortcutHarness = {
    registerPluginStatusListener: () => void
    shortcutStatusMap?: Map<string, { state?: string; reason?: string }>
  }

  const RENDERER_ID = 'plugin.demo.toggle'
  const FEATURE_ID = buildFeatureShortcutId('demo', 'translate')
  const RENDERER_KEY = 'CommandOrControl+Shift+D'
  const FEATURE_KEY = 'CommandOrControl+Shift+F'

  /**
   * Stands in for the plugin manager: plugin name to status, or no entry for an uninstalled one.
   * Keyed by folder, which is the manifest name unless `folders` says otherwise.
   */
  function setPlugins(
    statuses: Record<string, PluginStatus>,
    folders: Record<string, string> = {}
  ): void {
    const plugins = new Map(
      Object.entries(statuses).map(([name, status]) => [folders[name] ?? name, { name, status }])
    )
    ;(pluginModule as { pluginManager: unknown }).pluginManager = { plugins }
  }

  function emitStatus(previousStatus: PluginStatus, status: PluginStatus): void {
    touchEventBus.emit(TalexEvents.PLUGIN_STATUS_CHANGED, {
      pluginName: 'demo',
      previousStatus,
      status
    } as never)
  }

  function seedPluginShortcuts(storage: InMemoryShortcutStorage, enabled = true): void {
    const now = Date.now()
    storage.addShortcut({
      id: RENDERER_ID,
      accelerator: RENDERER_KEY,
      type: ShortcutType.RENDERER,
      meta: { creationTime: now, modificationTime: now, author: 'demo', enabled }
    })
    storage.addShortcut({
      id: FEATURE_ID,
      accelerator: FEATURE_KEY,
      type: ShortcutType.FEATURE,
      meta: { creationTime: now, modificationTime: now, author: 'demo', enabled }
    })
  }

  function registeredKeys(): string[] {
    return electronMocks.register.mock.calls.map(([accelerator]) => accelerator)
  }

  afterEach(() => {
    vi.useRealTimers()
    ;(pluginModule as { pluginManager: unknown }).pluginManager = null
  })

  it.each([
    ['disabled', { demo: PluginStatus.DISABLED }],
    ['crashed', { demo: PluginStatus.CRASHED }],
    ['still loading', { demo: PluginStatus.LOADING }],
    ['uninstalled', {}]
  ] as const)('holds no key for a plugin that is %s', (_, plugins) => {
    const { module, storage } = createModule()
    seedPluginShortcuts(storage)
    setPlugins(plugins)

    module.reregisterAllShortcuts?.()

    expect(registeredKeys()).toEqual([])
    for (const id of [RENDERER_ID, FEATURE_ID]) {
      expect(module.shortcutStatusMap?.get(id)).toEqual({
        state: 'unavailable',
        reason: 'runtime-missing'
      })
    }
    module.onDestroy()
  })

  it.each([
    ['ENABLED', PluginStatus.ENABLED],
    ['ACTIVE', PluginStatus.ACTIVE]
  ] as const)('registers both kinds while the plugin runs (%s)', (_, status) => {
    const { module, storage } = createModule()
    seedPluginShortcuts(storage)
    setPlugins({ demo: status })

    module.reregisterAllShortcuts?.()

    expect(registeredKeys().sort()).toEqual([FEATURE_KEY, RENDERER_KEY].sort())
    expect(module.shortcutStatusMap?.get(RENDERER_ID)?.state).toBe('active')
    expect(module.shortcutStatusMap?.get(FEATURE_ID)?.state).toBe('active')
    module.onDestroy()
  })

  it('keeps a record the user switched off disabled, whatever the plugin does', () => {
    const { module, storage } = createModule()
    seedPluginShortcuts(storage, false)
    setPlugins({})

    module.reregisterAllShortcuts?.()

    expect(module.shortcutStatusMap?.get(RENDERER_ID)?.state).toBe('disabled')
    expect(module.shortcutStatusMap?.get(FEATURE_ID)?.state).toBe('disabled')
    module.onDestroy()
  })

  it('leaves the key to a system shortcut while the plugin that shares it is not running', () => {
    const { module, storage } = createModule()
    seedPluginShortcuts(storage)
    setPlugins({ demo: PluginStatus.DISABLED })
    const callback = vi.fn()

    module.registerMainShortcut('core.test.shared', RENDERER_KEY, callback, { owner: 'test' })

    expect(module.shortcutStatusMap?.get('core.test.shared')?.state).toBe('active')
    expect(module.shortcutStatusMap?.get(RENDERER_ID)?.reason).toBe('runtime-missing')
    expect(electronMocks.register.mock.calls.at(-1)?.[0]).toBe(RENDERER_KEY)
    module.onDestroy()
  })

  it('registers two plugins once in the first settle window and reclassifies the next window', () => {
    vi.useFakeTimers()
    const { module, storage } = createModule()
    const secondId = buildFeatureShortcutId('second', 'search')
    const secondKey = 'CommandOrControl+Shift+S'
    storage.addShortcut({
      id: secondId,
      accelerator: secondKey,
      type: ShortcutType.FEATURE,
      meta: { creationTime: 1, modificationTime: 1, author: 'second', enabled: true }
    })
    storage.addShortcut({
      id: RENDERER_ID,
      accelerator: RENDERER_KEY,
      type: ShortcutType.RENDERER,
      meta: { creationTime: 1, modificationTime: 1, author: 'demo', enabled: true }
    })
    const plugins = new Map([
      ['demo', { name: 'demo', status: PluginStatus.DISABLED }],
      ['second', { name: 'second', status: PluginStatus.CRASHED }]
    ])
    ;(pluginModule as { pluginManager: unknown }).pluginManager = { plugins }
    ;(module as unknown as PluginShortcutHarness).registerPluginStatusListener()
    module.reregisterAllShortcuts?.()
    expect(registeredKeys()).toEqual([])
    electronMocks.unregisterAll.mockClear()

    try {
      plugins.get('demo')!.status = PluginStatus.ENABLED
      emitStatus(PluginStatus.DISABLED, PluginStatus.ENABLED)
      vi.advanceTimersByTime(40)
      plugins.get('second')!.status = PluginStatus.ACTIVE
      touchEventBus.emit(TalexEvents.PLUGIN_STATUS_CHANGED, {
        pluginName: 'second',
        previousStatus: PluginStatus.CRASHED,
        status: PluginStatus.ACTIVE
      } as never)
      vi.advanceTimersByTime(59)
      expect(electronMocks.unregisterAll).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(electronMocks.unregisterAll).toHaveBeenCalledTimes(1)
      expect(registeredKeys().sort()).toEqual([RENDERER_KEY, secondKey].sort())
      expect(module.shortcutStatusMap?.get(RENDERER_ID)?.state).toBe('active')
      expect(module.shortcutStatusMap?.get(secondId)?.state).toBe('active')

      // Drain the rest of this window: removing the timer guard schedules a second pass at 140ms.
      vi.advanceTimersByTime(100)
      expect(electronMocks.unregisterAll).toHaveBeenCalledTimes(1)
      electronMocks.register.mockClear()
      electronMocks.unregisterAll.mockClear()
      plugins.get('second')!.status = PluginStatus.DISABLED
      touchEventBus.emit(TalexEvents.PLUGIN_STATUS_CHANGED, {
        pluginName: 'second',
        previousStatus: PluginStatus.ACTIVE,
        status: PluginStatus.DISABLED
      } as never)
      vi.advanceTimersByTime(100)
      expect(electronMocks.unregisterAll).toHaveBeenCalledTimes(1)
      expect(registeredKeys()).toEqual([RENDERER_KEY])
      expect(module.shortcutStatusMap?.get(secondId)).toEqual({
        state: 'unavailable',
        reason: 'runtime-missing'
      })
    } finally {
      module.onDestroy()
    }
  })

  it('leaves every key alone while a plugin moves between ENABLED and ACTIVE', () => {
    vi.useFakeTimers()
    const { module, storage } = createModule()
    seedPluginShortcuts(storage)
    setPlugins({ demo: PluginStatus.ENABLED })
    ;(module as unknown as PluginShortcutHarness).registerPluginStatusListener()
    module.reregisterAllShortcuts?.()
    electronMocks.unregisterAll.mockClear()
    electronMocks.register.mockClear()

    // CoreBox opening and then leaving one of the plugin's views.
    setPlugins({ demo: PluginStatus.ACTIVE })
    emitStatus(PluginStatus.ENABLED, PluginStatus.ACTIVE)
    setPlugins({ demo: PluginStatus.ENABLED })
    emitStatus(PluginStatus.ACTIVE, PluginStatus.ENABLED)
    vi.advanceTimersByTime(1_000)

    expect(electronMocks.unregisterAll).not.toHaveBeenCalled()
    expect(electronMocks.register).not.toHaveBeenCalled()
    module.onDestroy()
  })

  it('finds a running plugin by its manifest name when its folder is named otherwise', () => {
    const { module, storage } = createModule()
    seedPluginShortcuts(storage)
    setPlugins({ demo: PluginStatus.ENABLED }, { demo: 'demo-folder' })

    module.reregisterAllShortcuts?.()

    // The plugin's own key is delivered by manifest name, so it holds its key.
    expect(module.shortcutStatusMap?.get(RENDERER_ID)?.state).toBe('active')
    expect(registeredKeys()).toEqual([RENDERER_KEY])
    // A feature binding is triggered by the plugin key its id names, which is not loaded here.
    expect(module.shortcutStatusMap?.get(FEATURE_ID)?.reason).toBe('runtime-missing')
    module.onDestroy()
  })

  it('stops following plugin status once torn down for quit', () => {
    vi.useFakeTimers()
    const { module, storage } = createModule()
    seedPluginShortcuts(storage)
    setPlugins({ demo: PluginStatus.ENABLED })
    ;(module as unknown as PluginShortcutHarness).registerPluginStatusListener()
    module.onDestroy()
    electronMocks.unregisterAll.mockClear()
    electronMocks.register.mockClear()

    emitStatus(PluginStatus.ENABLED, PluginStatus.DISABLED)
    vi.advanceTimersByTime(1_000)

    expect(electronMocks.unregisterAll).not.toHaveBeenCalled()
    expect(electronMocks.register).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', undefined],
    ['disabled', PluginStatus.DISABLED],
    ['crashed', PluginStatus.CRASHED]
  ] as const)('allows application bindings over two different %s plugin owners', (_, status) => {
    const { module, storage } = createModule()
    const featureId = buildFeatureShortcutId('feature-owner', 'translate')
    storage.addShortcut({
      id: featureId,
      accelerator: FEATURE_KEY,
      type: ShortcutType.FEATURE,
      meta: { creationTime: 1, modificationTime: 1, author: 'feature-owner', enabled: true }
    })
    storage.addShortcut({
      id: RENDERER_ID,
      accelerator: RENDERER_KEY,
      type: ShortcutType.RENDERER,
      meta: { creationTime: 1, modificationTime: 1, author: 'renderer-owner', enabled: true }
    })
    setPlugins(
      status === undefined
        ? {}
        : {
            'feature-owner': status,
            'renderer-owner': status
          }
    )
    const featureCallback = vi.fn()
    const rendererCallback = vi.fn()
    try {
      module.reregisterAllShortcuts?.()
      expect(module.setAppShortcut('app.test.feature-key', FEATURE_KEY, featureCallback)).toEqual({
        ok: true
      })
      expect(
        module.setAppShortcut('app.test.renderer-key', RENDERER_KEY, rendererCallback)
      ).toEqual({ ok: true })
      expect(module.getEffectiveAccelerator('app.test.feature-key')).toBe(FEATURE_KEY)
      expect(module.getEffectiveAccelerator('app.test.renderer-key')).toBe(RENDERER_KEY)
      for (const id of [featureId, RENDERER_ID]) {
        expect(module.shortcutStatusMap?.get(id)).toEqual({
          state: 'unavailable',
          reason: 'runtime-missing'
        })
      }
      const dispatch = new Map(electronMocks.register.mock.calls)
      dispatch.get(FEATURE_KEY)?.()
      dispatch.get(RENDERER_KEY)?.()
      expect(featureCallback).toHaveBeenCalledTimes(1)
      expect(rendererCallback).toHaveBeenCalledTimes(1)
    } finally {
      module.onDestroy()
    }
  })

  it.each([PluginStatus.ENABLED, PluginStatus.ACTIVE])(
    'still asks before taking keys from running plugin owners (%s)',
    (status) => {
      const { module, storage } = createModule()
      seedPluginShortcuts(storage)
      setPlugins({ demo: status })
      try {
        module.reregisterAllShortcuts?.()
        for (const [id, key] of [
          [FEATURE_ID, FEATURE_KEY],
          [RENDERER_ID, RENDERER_KEY]
        ]) {
          expect(module.setAppShortcut('app.test.take-plugin', key, vi.fn())).toEqual({
            ok: false,
            reason: 'conflict',
            holders: [{ id, label: id }]
          })
          expect(storage.getShortcutById('app.test.take-plugin')).toBeUndefined()
        }
        const callback = vi.fn()
        expect(
          module.setAppShortcut('app.test.take-plugin', FEATURE_KEY, callback, { force: true })
        ).toEqual({ ok: true })
        expect(module.getEffectiveAccelerator('app.test.take-plugin')).toBe(FEATURE_KEY)
        expect(module.getEffectiveAccelerator(FEATURE_ID)).toBeNull()
        const registeredCallbacks = new Map(electronMocks.register.mock.calls)
        registeredCallbacks.get(FEATURE_KEY)?.()
        expect(callback).toHaveBeenCalledTimes(1)
      } finally {
        module.onDestroy()
      }
    }
  )
  it('cancels a pending registration batch when destroyed', () => {
    vi.useFakeTimers()
    const { module, storage } = createModule()
    seedPluginShortcuts(storage)
    setPlugins({ demo: PluginStatus.DISABLED })
    ;(module as unknown as PluginShortcutHarness).registerPluginStatusListener()
    module.reregisterAllShortcuts?.()
    setPlugins({ demo: PluginStatus.ENABLED })
    emitStatus(PluginStatus.DISABLED, PluginStatus.ENABLED)
    vi.advanceTimersByTime(50)
    module.onDestroy()
    electronMocks.unregisterAll.mockClear()
    electronMocks.register.mockClear()
    vi.advanceTimersByTime(1_000)
    expect(electronMocks.unregisterAll).not.toHaveBeenCalled()
    expect(electronMocks.register).not.toHaveBeenCalled()
  })
})

describe('ShortcutModule app shortcut rebind', () => {
  /**
   * `setAppShortcut` writes the new accelerator and callback before the OS has judged the key, so
   * by the time the verdict arrives the binding the user was on has already been replaced. What a
   * caller can observe afterwards is the stored accelerator and the callback
   * `globalShortcut.register` would fire, so both are asserted: a rollback that restores only one
   * of them still leaves the user pressing a key that does nothing.
   */
  const ACCELERATOR_A = 'CommandOrControl+Shift+A'
  const ACCELERATOR_B = 'CommandOrControl+Shift+B'

  /**
   * A fake for `globalShortcut.register` that refuses the listed accelerators the way the OS does
   * -- returning false -- and hands back the callbacks it accepted, keyed by accelerator.
   */
  function installRegisterMock(refused: readonly string[]): Map<string, () => void> {
    const dispatch = new Map<string, () => void>()
    electronMocks.register.mockImplementation((accelerator: string, callback: () => void) => {
      if (refused.includes(accelerator)) return false
      dispatch.set(accelerator, callback)
      return true
    })
    return dispatch
  }

  afterEach(() => {
    electronMocks.register.mockImplementation(() => true)
  })

  it('a rebind the runtime refuses keeps the previous accelerator firing the previous callback', () => {
    const { module } = createModule()
    const dispatch = installRegisterMock([ACCELERATOR_B])
    const previousCallback = vi.fn()
    const refusedCallback = vi.fn()

    expect(module.setAppShortcut('app.test.rebind', ACCELERATOR_A, previousCallback)).toEqual({
      ok: true
    })
    expect(module.setAppShortcut('app.test.rebind', ACCELERATOR_B, refusedCallback)).toEqual({
      ok: false,
      reason: 'unavailable'
    })

    // The store must be back on the key that still works, not left on the refused one.
    expect(module.getShortcutAccelerator('app.test.rebind')).toBe(ACCELERATOR_A)

    dispatch.get(ACCELERATOR_A)?.()
    expect(previousCallback).toHaveBeenCalledTimes(1)
    expect(refusedCallback).not.toHaveBeenCalled()

    module.onDestroy()
  })

  it('a first binding the runtime refuses leaves no record behind', () => {
    const { module, storage } = createModule()
    installRegisterMock([ACCELERATOR_B])

    expect(module.setAppShortcut('app.test.first', ACCELERATOR_B, vi.fn())).toEqual({
      ok: false,
      reason: 'unavailable'
    })

    expect(module.getShortcutAccelerator('app.test.first')).toBeNull()
    expect(storage.getShortcutById('app.test.first')).toBeUndefined()

    module.onDestroy()
  })

  /**
   * A key another binding holds is refused and named, and nothing is written: the surface asks the
   * user with those names, then writes again with `force` if they say yes. Taking the key quietly,
   * or writing it and rolling back, would both leave the answer to the question up to timing.
   */
  it('a second app binding to a taken key names the holder and writes nothing', () => {
    const { module, storage } = createModule()
    installRegisterMock([])
    const firstCallback = vi.fn()

    expect(module.setAppShortcut('app.test.owner', ACCELERATOR_A, firstCallback)).toEqual({
      ok: true
    })
    expect(module.setAppShortcut('app.test.duplicate', ACCELERATOR_A, vi.fn())).toEqual({
      ok: false,
      reason: 'conflict',
      holders: [{ id: 'app.test.owner', label: 'app.test.owner' }]
    })

    expect(module.getShortcutAccelerator('app.test.duplicate')).toBeNull()
    expect(storage.getShortcutById('app.test.duplicate')).toBeUndefined()
    // The binding that already worked is untouched.
    expect(module.getShortcutAccelerator('app.test.owner')).toBe(ACCELERATOR_A)

    module.onDestroy()
  })

  /**
   * `holders` is what the confirmation surface prints as the reason the key cannot be taken, so each
   * name must be the one settings shows on that row: the resolved label where the locale has copy
   * for the id, the raw id where it does not. A caller that gets the id for a labelled shortcut, or
   * an unresolved key, asks the user to take a key from something they cannot recognise.
   */
  it('names each holder with its settings label, falling back to the id only where there is none', () => {
    const { module } = createModule()
    installRegisterMock([])
    module.registerMainShortcut('screenshot.tool.start', ACCELERATOR_A, vi.fn())
    module.registerMainShortcut('app.test.unlabelled', ACCELERATOR_A, vi.fn())

    expect(module.setAppShortcut('app.test.latecomer', ACCELERATOR_A, vi.fn())).toEqual({
      ok: false,
      reason: 'conflict',
      holders: [
        { id: 'screenshot.tool.start', label: 'Take a screenshot' },
        { id: 'app.test.unlabelled', label: 'app.test.unlabelled' }
      ]
    })

    module.onDestroy()
  })

  /**
   * The other half of the same question: `force` is the user's answer, so the key is taken and the
   * previous holder is left without it — the pass decides who owns it, not the write order.
   */
  it('a forced bind takes a key another binding holds and leaves that one without it', () => {
    const { module } = createModule()
    const dispatch = installRegisterMock([])
    const ownerCallback = vi.fn()
    const takerCallback = vi.fn()

    expect(module.setAppShortcut('app.test.owner', ACCELERATOR_A, ownerCallback)).toEqual({
      ok: true
    })
    expect(
      module.setAppShortcut('app.test.taker', ACCELERATOR_A, takerCallback, { force: true })
    ).toEqual({ ok: true })

    expect(module.getShortcutAccelerator('app.test.taker')).toBe(ACCELERATOR_A)

    dispatch.get(ACCELERATOR_A)?.()
    expect(takerCallback).toHaveBeenCalledTimes(1)
    expect(ownerCallback).not.toHaveBeenCalled()

    module.onDestroy()
  })

  it('a rebind the runtime accepts stores the new accelerator and fires the new callback', () => {
    const { module } = createModule()
    const dispatch = installRegisterMock([])
    const previousCallback = vi.fn()
    const acceptedCallback = vi.fn()

    module.setAppShortcut('app.test.accepted', ACCELERATOR_A, previousCallback)
    expect(module.setAppShortcut('app.test.accepted', ACCELERATOR_B, acceptedCallback)).toEqual({
      ok: true
    })

    expect(module.getShortcutAccelerator('app.test.accepted')).toBe(ACCELERATOR_B)

    dispatch.get(ACCELERATOR_B)?.()
    expect(acceptedCallback).toHaveBeenCalledTimes(1)
    expect(previousCallback).not.toHaveBeenCalled()

    module.onDestroy()
  })
})

describe('ShortcutModule CoreBox default, and CoreBox left without a key', () => {
  /**
   * CoreBox moved from ⌘E to ⌥Space, which Raycast and Alfred ship on. The contracts pinned here:
   * a binding still on the old default moves and one the user chose stays. When ⌥Space cannot be
   * had -- the OS refuses it, or a built-in shortcut stored before CoreBox is set to it -- no other
   * key stands in: CoreBox has no key, the stored value stays ⌥Space so the next pass and launch try
   * it again, and the user is told once per launch why. A key the user chose gets no notice.
   */
  const COREBOX_ID = 'core.box.toggle'
  const DEFAULT_ACCELERATOR = 'Alt+Space'
  const COREBOX_OPTIONS = {
    enabled: true,
    owner: 'module.corebox',
    legacyDefaultAccelerators: ['CommandOrControl+E'],
    unavailableNotice: {
      titleKey: 'notifications.coreBoxShortcutUnavailableTitle',
      refusedBodyKey: 'notifications.coreBoxShortcutRefusedBody',
      conflictBodyKey: 'notifications.coreBoxShortcutConflictBody',
      conflictNamedBodyKey: 'notifications.coreBoxShortcutConflictNamedBody'
    }
  }

  /** The body of every notice shown, in order: which copy was chosen, and what went into it. */
  function shownBodies(): string[] {
    return noticeMocks.showInternalSystemNotification.mock.calls.map(([request]) =>
      String((request as { message?: string }).message)
    )
  }

  /** Every accelerator handed to `globalShortcut.register` since the last clear, in order. */
  function registeredAccelerators(): string[] {
    return electronMocks.register.mock.calls.map(([accelerator]) => accelerator)
  }

  const liveModules: Array<{ onDestroy: () => unknown }> = []

  /**
   * A fake `globalShortcut.register` that refuses the listed accelerators, as Windows does for a key
   * another app holds (macOS registers it anyway), and -- like Electron -- refuses an accelerator
   * this process already holds until `unregisterAll`. Returns the callbacks it accepted, keyed by
   * accelerator.
   */
  function installRegisterMock(refused: readonly string[]): Map<string, () => void> {
    const dispatch = new Map<string, () => void>()
    electronMocks.register.mockImplementation((accelerator: string, callback: () => void) => {
      if (refused.includes(accelerator) || dispatch.has(accelerator)) return false
      dispatch.set(accelerator, callback)
      return true
    })
    electronMocks.unregisterAll.mockImplementation(() => {
      dispatch.clear()
    })
    return dispatch
  }

  function createTrackedModule() {
    const created = createModule()
    liveModules.push(created.module)
    return created
  }

  function storeSystemBinding(
    storage: InMemoryShortcutStorage,
    id: string,
    accelerator: string
  ): void {
    const timestamp = Date.now()
    storage.addShortcut({
      id,
      accelerator,
      type: ShortcutType.MAIN,
      // Rebinding in settings keeps the system author, so a user's key is told apart by its value.
      meta: {
        creationTime: timestamp,
        modificationTime: timestamp,
        author: 'system',
        enabled: true
      }
    })
  }

  afterEach(() => {
    for (const module of liveModules.splice(0)) module.onDestroy()
    electronMocks.register.mockImplementation(() => true)
    electronMocks.unregisterAll.mockImplementation(() => undefined)
    noticeMocks.showInternalSystemNotification.mockReset()
  })

  it('moves a system binding still on the old ⌘E default to ⌥Space', () => {
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, COREBOX_ID, 'CommandOrControl+E')

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    expect(storage.getShortcutById(COREBOX_ID)?.accelerator).toBe(DEFAULT_ACCELERATOR)
    expect(electronMocks.register).toHaveBeenCalledWith(DEFAULT_ACCELERATOR, expect.any(Function))
  })

  it('leaves a key the user chose where it is', () => {
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, COREBOX_ID, 'Command+K')

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    expect(storage.getShortcutById(COREBOX_ID)?.accelerator).toBe('Command+K')
    expect(module.getEffectiveAccelerator(COREBOX_ID)).toBe('Command+K')
  })

  it('reads the old default through the normaliser, and only the old default', () => {
    // Other spellings of the stored `CommandOrControl+E` are still the default nobody chose.
    for (const spelling of ['CmdOrCtrl+E', 'commandorcontrol+e']) {
      const { module, storage } = createTrackedModule()
      storeSystemBinding(storage, COREBOX_ID, spelling)

      module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

      expect(storage.getShortcutById(COREBOX_ID)?.accelerator).toBe(DEFAULT_ACCELERATOR)
      module.onDestroy()
    }

    // ⌘E on a Mac too, but only the recorder writes `Command+E`: the user picked it.
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, COREBOX_ID, 'Command+E')

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    expect(storage.getShortcutById(COREBOX_ID)?.accelerator).toBe('Command+E')
  })

  it('leaves CoreBox with no key when the OS refuses ⌥Space, and registers nothing in its place', () => {
    const { module, storage } = createTrackedModule()
    const dispatch = installRegisterMock([DEFAULT_ACCELERATOR])

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    // ⌥Space was asked for and refused, and no other key was tried: ⌘E least of all.
    expect(registeredAccelerators()).toEqual([DEFAULT_ACCELERATOR])
    expect(dispatch.size).toBe(0)
    expect(module.getEffectiveAccelerator(COREBOX_ID)).toBeNull()
    expect(module.getShortcutBinding(COREBOX_ID)).toEqual({
      configured: DEFAULT_ACCELERATOR,
      effective: null
    })
    expect(module.shortcutStatusMap?.get(COREBOX_ID)).toEqual({
      state: 'unavailable',
      reason: 'register-failed'
    })
    // Nothing was written: the next launch tries ⌥Space again.
    expect(storage.getShortcutById(COREBOX_ID)?.accelerator).toBe(DEFAULT_ACCELERATOR)
  })

  it('tells the user CoreBox has no key because ⌥Space could not be registered', () => {
    const { module } = createTrackedModule()
    installRegisterMock([DEFAULT_ACCELERATOR])

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    expect(noticeMocks.showInternalSystemNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 'shortcut-unavailable:core.box.toggle',
        level: 'error',
        title: 'notifications.coreBoxShortcutUnavailableTitle {"shortcut":"⌥Space"}',
        message: 'notifications.coreBoxShortcutRefusedBody {"shortcut":"⌥Space"}'
      })
    )
  })

  it('says the same when `register` throws', () => {
    const { module } = createTrackedModule()
    electronMocks.register.mockImplementation((accelerator: string) => {
      if (accelerator === DEFAULT_ACCELERATOR) throw new Error('refused')
      return true
    })

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    expect(module.shortcutStatusMap?.get(COREBOX_ID)?.reason).toBe('register-error')
    expect(shownBodies()).toEqual([
      'notifications.coreBoxShortcutRefusedBody {"shortcut":"⌥Space"}'
    ])
  })

  it('tells the user once per launch, however many passes find ⌥Space refused again', () => {
    const { module } = createTrackedModule()
    installRegisterMock([DEFAULT_ACCELERATOR])
    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    // Every module registering at startup, and every edit in settings, runs a pass.
    module.registerMainShortcut('core.test.other', 'CommandOrControl+Shift+K', vi.fn())
    module.reregisterAllShortcuts?.()
    module.disableAll()
    module.enableAll()

    expect(module.getEffectiveAccelerator(COREBOX_ID)).toBeNull()
    expect(noticeMocks.showInternalSystemNotification).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when a key the user chose is refused', () => {
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, COREBOX_ID, 'Command+K')
    installRegisterMock(['Command+K'])

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    // Their own key, and settings shows the refusal on the row where they set it.
    expect(registeredAccelerators()).toEqual(['Command+K'])
    expect(module.getEffectiveAccelerator(COREBOX_ID)).toBeNull()
    expect(noticeMocks.showInternalSystemNotification).not.toHaveBeenCalled()
  })

  it('names the built-in shortcut stored before CoreBox that takes ⌥Space', () => {
    const { module, storage } = createTrackedModule()
    // A fresh profile stores built-in shortcuts in module load order, and the screenshot module
    // (like voice and local AI) loads before CoreBox. Within a conflict group of built-in
    // shortcuts the first in storage order keeps the key, so here CoreBox is the one that loses.
    storeSystemBinding(storage, 'screenshot.tool.start', 'CommandOrControl+Shift+A')
    storeSystemBinding(storage, COREBOX_ID, DEFAULT_ACCELERATOR)
    const dispatch = installRegisterMock([])
    const screenshot = vi.fn()
    module.registerMainShortcut('screenshot.tool.start', 'CommandOrControl+Shift+A', screenshot)
    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)
    expect(noticeMocks.showInternalSystemNotification).not.toHaveBeenCalled()

    // The user gives ⌥Space to the screenshot in settings; a Mac's recorder writes `Option+Space`.
    electronMocks.register.mockClear()
    module.updateShortcut('screenshot.tool.start', 'Option+Space')

    expect(module.shortcutStatusMap?.get(COREBOX_ID)).toEqual({
      state: 'conflict',
      reason: 'conflict-system',
      conflictWith: ['screenshot.tool.start']
    })
    expect(module.getEffectiveAccelerator(COREBOX_ID)).toBeNull()
    // The key is the screenshot's now, and nothing was registered for CoreBox in its place.
    expect(registeredAccelerators()).toEqual(['Option+Space'])
    dispatch.get('Option+Space')?.()
    expect(screenshot).toHaveBeenCalledTimes(1)
    expect(noticeMocks.showInternalSystemNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: 'shortcut-unavailable:core.box.toggle',
        level: 'error',
        title: 'notifications.coreBoxShortcutUnavailableTitle {"shortcut":"⌥Space"}',
        message:
          'notifications.coreBoxShortcutConflictNamedBody {"shortcut":"⌥Space","other":"Take a screenshot"}'
      })
    )

    module.reregisterAllShortcuts?.()
    expect(noticeMocks.showInternalSystemNotification).toHaveBeenCalledTimes(1)
  })

  it('says another shortcut holds ⌥Space when that one has no settings label', () => {
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, 'core.test.unlabelled', DEFAULT_ACCELERATOR)
    storeSystemBinding(storage, COREBOX_ID, DEFAULT_ACCELERATOR)
    installRegisterMock([])

    module.registerMainShortcut('core.test.unlabelled', 'CommandOrControl+Shift+U', vi.fn())
    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    // Settings prints the raw id for a shortcut it has no label for; in a sentence that is noise.
    expect(module.shortcutStatusMap?.get(COREBOX_ID)?.state).toBe('conflict')
    expect(shownBodies()).toEqual([
      'notifications.coreBoxShortcutConflictBody {"shortcut":"⌥Space"}'
    ])
  })

  it('tells the user once per launch, whichever way CoreBox loses its key', () => {
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, 'screenshot.tool.start', 'CommandOrControl+Shift+A')
    storeSystemBinding(storage, COREBOX_ID, DEFAULT_ACCELERATOR)
    installRegisterMock([DEFAULT_ACCELERATOR])
    module.registerMainShortcut('screenshot.tool.start', 'CommandOrControl+Shift+A', vi.fn())
    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)
    expect(shownBodies()).toEqual([
      'notifications.coreBoxShortcutRefusedBody {"shortcut":"⌥Space"}'
    ])

    // Refused first, then lost to the screenshot later in the run: the user already knows.
    module.updateShortcut('screenshot.tool.start', 'Option+Space')

    expect(module.shortcutStatusMap?.get(COREBOX_ID)?.state).toBe('conflict')
    expect(noticeMocks.showInternalSystemNotification).toHaveBeenCalledTimes(1)
  })

  it('finishes the pass when the notice throws, and does not show it again', () => {
    const { module } = createTrackedModule()
    installRegisterMock([DEFAULT_ACCELERATOR])
    noticeMocks.showInternalSystemNotification.mockImplementationOnce(() => {
      throw new Error('no notification centre')
    })
    module.registerMainShortcut('core.test.other', 'CommandOrControl+Shift+K', vi.fn())

    expect(() =>
      module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)
    ).not.toThrow()
    // The pass that threw still published its statuses.
    expect(module.shortcutStatusMap?.get(COREBOX_ID)?.state).toBe('unavailable')
    expect(module.getEffectiveAccelerator('core.test.other')).toBe('CommandOrControl+Shift+K')

    module.reregisterAllShortcuts?.()
    expect(noticeMocks.showInternalSystemNotification).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when a key the user chose for CoreBox loses a conflict', () => {
    const { module, storage } = createTrackedModule()
    // CoreBox was put on Command+K first, the screenshot tool after it: between two keys the user
    // chose, the later binding owns the key (see `orderByOwnership`).
    storeSystemBinding(storage, COREBOX_ID, 'Command+K')
    storeSystemBinding(storage, 'screenshot.tool.start', 'Command+K')
    installRegisterMock([])

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)
    module.registerMainShortcut('screenshot.tool.start', 'CommandOrControl+Shift+A', vi.fn())

    // Their own key, and settings already shows the conflict on it: no notice, as for a refusal.
    expect(module.shortcutStatusMap?.get(COREBOX_ID)?.state).toBe('conflict')
    expect(noticeMocks.showInternalSystemNotification).not.toHaveBeenCalled()
  })

  /**
   * Two binds can land in the same millisecond — the recorder writes the new value the instant the
   * user finishes a capture, and a pass that writes two records back to back does not leave the
   * clock any room. `meta.modificationTime` cannot separate those two, so the store's own order has
   * to: records are appended, so the later position is the later write, and it owns the key.
   *
   * The clock is frozen so the tie is real: without that this test would pass on the timestamp
   * comparison alone and stop pinning the fallback the moment the two writes straddled a
   * millisecond.
   */
  it('gives a key two bindings chose in the same millisecond to the later record', () => {
    const { module, storage } = createTrackedModule()
    const dispatch = installRegisterMock([])
    const corebox = vi.fn()
    const screenshot = vi.fn()
    const frozen = new Date('2026-01-01T00:00:00.000Z').getTime()

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(frozen)
      storeSystemBinding(storage, COREBOX_ID, 'Command+K')
      storeSystemBinding(storage, 'screenshot.tool.start', 'Command+K')
    } finally {
      vi.useRealTimers()
    }
    expect(storage.getShortcutById(COREBOX_ID)?.meta?.modificationTime).toBe(frozen)
    expect(storage.getShortcutById('screenshot.tool.start')?.meta?.modificationTime).toBe(frozen)

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, corebox, COREBOX_OPTIONS)
    module.registerMainShortcut('screenshot.tool.start', 'CommandOrControl+Shift+A', screenshot)

    expect(module.shortcutStatusMap?.get('screenshot.tool.start')?.state).toBe('active')
    expect(module.shortcutStatusMap?.get(COREBOX_ID)).toEqual({
      state: 'conflict',
      reason: 'conflict-system',
      conflictWith: ['screenshot.tool.start']
    })
    dispatch.get('Command+K')?.()
    expect(screenshot).toHaveBeenCalledTimes(1)
    expect(corebox).not.toHaveBeenCalled()
  })

  /**
   * The same rule seen from the other side: the record written *first* takes the key when it was
   * rebound later, which is what makes moving a shortcut onto a key another one holds work in
   * settings. Ownership is the last write, not the position the store happens to hold.
   */
  it('lets the binding stored first take the key when it was rebound onto it later', () => {
    const { module, storage } = createTrackedModule()
    const dispatch = installRegisterMock([])
    const corebox = vi.fn()
    const screenshot = vi.fn()

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime())
      storeSystemBinding(storage, COREBOX_ID, 'Command+J')
      storeSystemBinding(storage, 'screenshot.tool.start', 'Command+K')
      module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, corebox, COREBOX_OPTIONS)
      module.registerMainShortcut('screenshot.tool.start', 'CommandOrControl+Shift+A', screenshot)
      expect(module.shortcutStatusMap?.get('screenshot.tool.start')?.state).toBe('active')

      // A minute later the user moves CoreBox onto the screenshot's key.
      vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z').getTime())
      module.updateShortcut(COREBOX_ID, 'Command+K')
    } finally {
      vi.useRealTimers()
    }

    expect(module.shortcutStatusMap?.get(COREBOX_ID)?.state).toBe('active')
    expect(module.shortcutStatusMap?.get('screenshot.tool.start')).toEqual({
      state: 'conflict',
      reason: 'conflict-system',
      conflictWith: [COREBOX_ID]
    })
    dispatch.get('Command+K')?.()
    expect(corebox).toHaveBeenCalledTimes(1)
    expect(screenshot).not.toHaveBeenCalled()
  })

  /**
   * The other side of the same rule: a key someone chose takes precedence over a default, so a
   * screenshot tool the user moved to ⌥Space keeps it and CoreBox is left keyless. That is the
   * one case CoreBox announces, and the message names what took the key.
   */
  it('loses its default to a key the user chose elsewhere, and says so once', () => {
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, COREBOX_ID, DEFAULT_ACCELERATOR)
    storeSystemBinding(storage, 'screenshot.tool.start', 'Option+Space')
    installRegisterMock([])

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)
    module.registerMainShortcut('screenshot.tool.start', 'CommandOrControl+Shift+A', vi.fn())

    expect(module.getEffectiveAccelerator(COREBOX_ID)).toBeNull()
    expect(module.shortcutStatusMap?.get('screenshot.tool.start')?.state).toBe('active')
    // Named, because settings has a label for the shortcut that took the key.
    expect(shownBodies()).toEqual([
      'notifications.coreBoxShortcutConflictNamedBody {"shortcut":"⌥Space","other":"Take a screenshot"}'
    ])
  })

  it('keeps its default key when the other binding is on a default too', () => {
    const { module, storage } = createTrackedModule()
    storeSystemBinding(storage, COREBOX_ID, DEFAULT_ACCELERATOR)
    storeSystemBinding(storage, 'screenshot.tool.start', 'Option+Space')
    installRegisterMock([])

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)
    // Registered on the value it is already stored with, so neither binding is one the user chose
    // and the store's own order decides — CoreBox was there first.
    module.registerMainShortcut('screenshot.tool.start', 'Option+Space', vi.fn())

    expect(module.getEffectiveAccelerator(COREBOX_ID)).toBe(DEFAULT_ACCELERATOR)
    expect(module.shortcutStatusMap?.get('screenshot.tool.start')?.state).toBe('conflict')
    expect(noticeMocks.showInternalSystemNotification).not.toHaveBeenCalled()
  })

  it('answers the binding query and publishes only a pass that changed a key', () => {
    const module = new ShortcutModule()
    liveModules.push(module)
    module.onInit({
      app: {},
      runtime: { channel: {} }
    } as unknown as Parameters<ShortcutModule['onInit']>[0])
    const listener = vi.fn()
    module.onBindingsChanged(listener)
    transportMocks.broadcast.mockClear()

    module.registerMainShortcut(COREBOX_ID, DEFAULT_ACCELERATOR, vi.fn(), COREBOX_OPTIONS)

    // Looked up by the shared event object: a copy defined inside the module would not be found.
    const getBinding = transportMocks.handlers.get(shortconGetBindingEvent)
    expect(getBinding?.({ id: COREBOX_ID })).toEqual({
      configured: DEFAULT_ACCELERATOR,
      effective: DEFAULT_ACCELERATOR
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(transportMocks.broadcast).toHaveBeenCalledTimes(1)
    expect(transportMocks.broadcast.mock.calls[0]?.[0]).toBe(shortconChangedEvent)

    // A pass that changes nothing a surface prints stays quiet.
    module.registerMainShortcut('core.test.quiet', 'CommandOrControl+Shift+Q', vi.fn())
    listener.mockClear()
    transportMocks.broadcast.mockClear()
    module.enableAll()
    module.updateShortcut('core.test.quiet', undefined, true)
    expect(listener).not.toHaveBeenCalled()
    expect(transportMocks.broadcast).not.toHaveBeenCalled()

    // A rebind in settings is a change.
    module.updateShortcut(COREBOX_ID, 'Command+K')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getBinding?.({ id: COREBOX_ID })).toEqual({
      configured: 'Command+K',
      effective: 'Command+K'
    })
  })
})

describe('ShortcutModule renames the macOS modifier names the recorder stored off macOS', () => {
  /**
   * The settings recorder used to write the Windows key as `Command` and Alt as `Option` on every
   * platform. At startup, off macOS, the user's recorded values move to `Super` / `Alt`; anything
   * cross-platform (`CommandOrControl`), a plugin's own spelling, and every macOS value stay put.
   */
  const liveModules: Array<{ onDestroy: () => unknown }> = []

  function record(
    id: string,
    accelerator: string,
    type: ShortcutType = ShortcutType.MAIN,
    author = 'system'
  ): Shortcut {
    return {
      id,
      accelerator,
      type,
      meta: { creationTime: 0, modificationTime: 0, author, enabled: true }
    }
  }

  const STORED: Shortcut[] = [
    record('core.box.toggle', 'Command+E'),
    record('feature:plugin-a:search', 'Option+K', ShortcutType.FEATURE, 'plugin-a'),
    record('core.omniPanel.toggle', 'CommandOrControl+Shift+P'),
    record('app-launch:editor', 'CmdOrCtrl+Alt+O'),
    record('core.test.doubled', 'Command+Super+E'),
    record('plugin.plugin-b.run', 'Command+X', ShortcutType.RENDERER, 'plugin-b'),
    record('core.test.trigger', 'mouse:right-long-press', ShortcutType.TRIGGER),
    // Registered by the first pass itself (a feature binding needs no module to register it), and
    // spelled with `Command`, which the pass's own normaliser keeps: only the rename moves it.
    record('feature:plugin-a:open', 'Command+Shift+O', ShortcutType.FEATURE, 'plugin-a')
  ]

  /** A fresh module evaluated on `platform`: the module reads its platform when it is imported. */
  async function importShortcutModule(platform: string): Promise<typeof ShortcutModule> {
    const previous = process.platform
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    vi.resetModules()
    try {
      return (await import('./global-shortcon')).ShortcutModule
    } finally {
      Object.defineProperty(process, 'platform', { value: previous, configurable: true })
    }
  }

  function start(Module: typeof ShortcutModule, stored: Shortcut[]): ShortcutModule {
    mainStorageMocks.getConfig.mockReturnValue(structuredClone(stored))
    const module = new Module()
    liveModules.push(module)
    module.onInit({
      app: {},
      runtime: { channel: {} }
    } as unknown as Parameters<ShortcutModule['onInit']>[0])
    return module
  }

  /** The store as last written, by id. */
  function persisted(): Record<string, string> {
    const json = mainStorageMocks.saveConfig.mock.calls.at(-1)?.[1]
    const shortcuts = JSON.parse(String(json)) as Shortcut[]
    return Object.fromEntries(shortcuts.map((shortcut) => [shortcut.id, shortcut.accelerator]))
  }

  afterEach(() => {
    for (const module of liveModules.splice(0)) module.onDestroy()
  })

  it.each(['win32', 'linux'])('on %s moves Command and Option to Super and Alt', async (os) => {
    const Module = await importShortcutModule(os)

    start(Module, STORED)

    expect(persisted()).toEqual({
      'core.box.toggle': 'Super+E',
      'feature:plugin-a:search': 'Alt+K',
      // Cross-platform on purpose, and not the recorder's.
      'core.omniPanel.toggle': 'CommandOrControl+Shift+P',
      'app-launch:editor': 'CmdOrCtrl+Alt+O',
      // Renaming would give two Super keys: left for the user to see and fix.
      'core.test.doubled': 'Command+Super+E',
      // A plugin's spelling, which the plugin writes back on every load.
      'plugin.plugin-b.run': 'Command+X',
      'core.test.trigger': 'mouse:right-long-press',
      'feature:plugin-a:open': 'Super+Shift+O'
    })
    // Renamed before the first pass, so the binding registers under its new name and never under
    // the old one. `Option` cannot show this: the pass's normaliser turns it into `Alt` by itself.
    expect(electronMocks.register).toHaveBeenCalledWith('Super+Shift+O', expect.any(Function))
    expect(electronMocks.register).not.toHaveBeenCalledWith('Command+Shift+O', expect.any(Function))
    expect(electronMocks.register).toHaveBeenCalledWith('Alt+K', expect.any(Function))
  })

  it('does nothing on a second launch', async () => {
    const Module = await importShortcutModule('win32')
    start(Module, STORED)
    const migrated = persisted()
    for (const module of liveModules.splice(0)) module.onDestroy()
    mainStorageMocks.saveConfig.mockClear()

    const again = start(
      Module,
      STORED.map((shortcut) => ({ ...shortcut, accelerator: migrated[shortcut.id]! }))
    )

    expect(mainStorageMocks.saveConfig).not.toHaveBeenCalled()
    expect(again.getShortcutAccelerator('core.box.toggle')).toBe('Super+E')
    expect(again.getShortcutAccelerator('feature:plugin-a:search')).toBe('Alt+K')
  })

  it('leaves macOS alone, where Command and Option are the right names', async () => {
    const Module = await importShortcutModule('darwin')

    const module = start(Module, STORED)

    expect(mainStorageMocks.saveConfig).not.toHaveBeenCalled()
    expect(module.getShortcutAccelerator('core.box.toggle')).toBe('Command+E')
    expect(module.getShortcutAccelerator('feature:plugin-a:search')).toBe('Option+K')
  })

  it('keeps the old value when its write fails, and still moves the rest', async () => {
    const Module = await importShortcutModule('win32')
    mainStorageMocks.saveConfig.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    const module = start(Module, STORED)

    expect(module.getShortcutAccelerator('core.box.toggle')).toBe('Command+E')
    expect(persisted()['core.box.toggle']).toBe('Command+E')
    expect(module.getShortcutAccelerator('feature:plugin-a:search')).toBe('Alt+K')
    expect(persisted()['feature:plugin-a:search']).toBe('Alt+K')
  })

  it('keeps the old value, and still starts, when putting it back fails too', async () => {
    const Module = await importShortcutModule('win32')
    const diskFull = (): never => {
      throw new Error('disk full')
    }
    // The rename's own write, then the write that puts the old value back. A throw escaping the
    // rename would fail the shortcut module's init, and with it the app's startup.
    mainStorageMocks.saveConfig.mockImplementationOnce(diskFull).mockImplementationOnce(diskFull)

    const module = start(Module, STORED)

    expect(module.getShortcutAccelerator('core.box.toggle')).toBe('Command+E')
    // The next record's write carries the whole store, with the old value back in it.
    expect(persisted()['core.box.toggle']).toBe('Command+E')
    expect(persisted()['feature:plugin-a:search']).toBe('Alt+K')
  })
})

describe('ShortcutModule reports two spellings of one key as a conflict', () => {
  /**
   * Conflicts are grouped by the key the platform presses (`acceleratorsMatch`). Grouped by string,
   * `Option+Space` beside `Alt+Space` on macOS both reached `register`: Electron refused the later
   * one, and settings showed "registration failed" instead of the conflict.
   */
  const liveModules: Array<{ onDestroy: () => unknown }> = []
  /** The file's pinned platform (darwin), put back after each case switches it. */
  const pinnedPlatform = process.platform

  afterEach(() => {
    for (const module of liveModules.splice(0)) module.onDestroy()
    Object.defineProperty(process, 'platform', { value: pinnedPlatform, configurable: true })
  })

  /** A fresh module, imported and run on `platform`: it reads the platform at both times. */
  async function moduleOn(platform: string): Promise<ShortcutModuleHarness> {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
    vi.resetModules()
    const { ShortcutModule: Module } = await import('./global-shortcon')
    const module = new Module() as unknown as ShortcutModuleHarness
    module.storage = new InMemoryShortcutStorage()
    liveModules.push(module)
    return module
  }

  function registered(): string[] {
    return electronMocks.register.mock.calls.map(([accelerator]) => accelerator)
  }

  it('on macOS flags Option+Space beside Alt+Space, and registers the key once', async () => {
    const module = await moduleOn('darwin')

    module.registerMainShortcut('core.test.first', 'Alt+Space', vi.fn())
    module.registerMainShortcut('core.test.second', 'Option+Space', vi.fn())

    expect(module.shortcutStatusMap?.get('core.test.first')).toEqual({ state: 'active' })
    expect(module.shortcutStatusMap?.get('core.test.second')).toEqual({
      state: 'conflict',
      reason: 'conflict-system',
      conflictWith: ['core.test.first']
    })
    expect(registered()).not.toContain('Option+Space')
  })

  it.each(['win32', 'linux'])(
    'on %s groups the recorded spellings the way acceleratorsMatch reads them',
    async (os) => {
      const module = await moduleOn(os)
      const pairs = [
        // The old recorder's name for the Windows key beside the right one: one key off macOS.
        ['Super+E', 'Command+E'],
        // What CommandOrControl presses off macOS, spelled as the recorder writes it.
        ['Control+K', 'CommandOrControl+K'],
        // The Windows key and Ctrl: two keys here, one key on a Mac.
        ['Command+J', 'CommandOrControl+J']
      ] as const

      pairs.forEach(([first, second], index) => {
        module.registerMainShortcut(`core.test.${index}.first`, first, vi.fn())
        module.registerMainShortcut(`core.test.${index}.second`, second, vi.fn())
      })

      pairs.forEach(([first, second], index) => {
        const status = module.shortcutStatusMap?.get(`core.test.${index}.second`)
        expect(status?.state, `${first} / ${second}`).toBe(
          acceleratorsMatch(first, second, os) ? 'conflict' : 'active'
        )
      })
      expect(module.shortcutStatusMap?.get('core.test.0.second')?.state).toBe('conflict')
      expect(module.shortcutStatusMap?.get('core.test.1.second')?.state).toBe('conflict')
      expect(module.shortcutStatusMap?.get('core.test.2.second')?.state).toBe('active')
    }
  )

  it('leaves different keys alone', async () => {
    const module = await moduleOn('darwin')

    module.registerMainShortcut('core.test.plain', 'Alt+Space', vi.fn())
    module.registerMainShortcut('core.test.shifted', 'Alt+Shift+Space', vi.fn())
    module.registerMainShortcut('core.test.other', 'Command+K', vi.fn())

    for (const id of ['core.test.plain', 'core.test.shifted', 'core.test.other']) {
      expect(module.shortcutStatusMap?.get(id), id).toEqual({ state: 'active' })
    }
    expect(registered()).toEqual(
      expect.arrayContaining(['Alt+Space', 'Alt+Shift+Space', 'Command+K'])
    )
  })
})

describe('ShortcutModule with global shortcut registration disabled by environment', () => {
  /**
   * An isolated Electron probe that coexists with another Tuff instance sets
   * `TUFF_DISABLE_GLOBAL_SHORTCUTS=1`, and the module reads the variable at import: a fresh
   * instance is the only way to see the gate, hence the dynamic import after the stub. The
   * process must still start (storage, transport, teardown wiring) - only the OS registration
   * pass is off, and `enableAll()` may not switch it back on.
   */
  const liveModules: Array<{ onDestroy: () => unknown }> = []

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    for (const module of liveModules.splice(0)) module.onDestroy()
  })

  async function gatedModule(): Promise<ShortcutModuleHarness> {
    vi.stubEnv('TUFF_DISABLE_GLOBAL_SHORTCUTS', '1')
    vi.resetModules()
    const { ShortcutModule: Module } = await import('./global-shortcon')
    const module = new Module() as unknown as ShortcutModuleHarness
    module.storage = new InMemoryShortcutStorage()
    liveModules.push(module)
    return module
  }

  function registered(): string[] {
    return electronMocks.register.mock.calls.map(([accelerator]) => accelerator)
  }

  it('registers nothing at init or on a later pass, and enableAll cannot override the gate', async () => {
    const id = 'core.test.gated'
    const accelerator = 'CommandOrControl+Shift+G'
    const module = await gatedModule()

    // The callback has to be in the registry for a pass to treat the stored record as live, so a
    // gate that is missing shows up as a real registration rather than as `runtime-missing`.
    module.registerMainShortcut(id, accelerator, vi.fn())
    mainStorageMocks.getConfig.mockReturnValue([
      {
        id,
        accelerator,
        type: ShortcutType.MAIN,
        meta: { creationTime: 0, modificationTime: 0, author: 'system', enabled: true }
      }
    ])

    electronMocks.register.mockClear()
    module.onInit({
      app: {},
      runtime: { channel: {} }
    } as unknown as Parameters<ShortcutModule['onInit']>[0])

    // Init ran the registration pass and called Electron no more than the disabled pass may.
    expect(registered()).toEqual([])

    // A later registration runs another pass; the process-level gate still holds.
    module.registerMainShortcut('core.test.gated.later', 'CommandOrControl+Shift+H', vi.fn())
    expect(registered()).toEqual([])

    // enableAll() re-enables and re-registers in a normal process; under the gate it must not.
    module.enableAll()
    expect(registered()).toEqual([])
    expect(module.getEffectiveAccelerator(id)).toBeNull()
    expect(noticeMocks.showInternalSystemNotification).not.toHaveBeenCalled()
  })
})

describe('ShortcutModule publishes status changes without an effective key', () => {
  it('notifies an open consumer when runtime-missing becomes disabled then register-failed', () => {
    const id = buildFeatureShortcutId('demo', 'translate')
    const key = 'CommandOrControl+Shift+F'
    mainStorageMocks.getConfig.mockReturnValue([
      {
        id,
        accelerator: key,
        type: ShortcutType.FEATURE,
        meta: { creationTime: 1, modificationTime: 1, author: 'demo', enabled: true }
      }
    ])
    const module = new ShortcutModule()
    const pluginHarness = pluginModule as unknown as { pluginManager: unknown }
    pluginHarness.pluginManager = {
      plugins: new Map([['demo', { name: 'demo', status: PluginStatus.DISABLED }]])
    }
    module.onInit({ app: {}, runtime: { channel: {} } } as Parameters<ShortcutModule['onInit']>[0])
    const changed = vi.fn(() => module.getFeatureShortcuts('demo').translate)
    const dispose = module.onBindingsChanged(changed)
    transportMocks.broadcast.mockClear()
    try {
      expect(module.getEffectiveAccelerator(id)).toBeNull()
      expect(module.getFeatureShortcuts('demo').translate.status).toEqual({
        state: 'unavailable',
        reason: 'runtime-missing'
      })
      module.updateShortcut(id, undefined, false)
      expect(module.getEffectiveAccelerator(id)).toBeNull()
      expect(changed.mock.results.at(-1)?.value).toMatchObject({
        meta: { enabled: false },
        status: { state: 'disabled' }
      })
      expect(transportMocks.broadcast).toHaveBeenCalledExactlyOnceWith(
        shortconChangedEvent,
        undefined
      )

      changed.mockClear()
      transportMocks.broadcast.mockClear()
      pluginHarness.pluginManager = {
        plugins: new Map([['demo', { name: 'demo', status: PluginStatus.ENABLED }]])
      }
      electronMocks.register.mockImplementation(() => false)
      module.updateShortcut(id, undefined, true)
      expect(module.getEffectiveAccelerator(id)).toBeNull()
      expect(changed.mock.results.at(-1)?.value).toMatchObject({
        meta: { enabled: true },
        status: { state: 'unavailable', reason: 'register-failed' }
      })
      expect(transportMocks.broadcast).toHaveBeenCalledExactlyOnceWith(
        shortconChangedEvent,
        undefined
      )
    } finally {
      dispose()
      module.onDestroy()
      pluginHarness.pluginManager = null
      electronMocks.register.mockImplementation(() => true)
    }
  })
})

describe('ShortcutModule restores durable user choices', () => {
  const systemId = 'core.test.persisted'
  const systemKey = 'CommandOrControl+Shift+K'
  const featureId = buildFeatureShortcutId('demo', 'translate')

  function persistence() {
    let serialized = JSON.stringify([
      {
        id: systemId,
        accelerator: systemKey,
        type: ShortcutType.MAIN,
        meta: { creationTime: 1, modificationTime: 1, author: 'system', enabled: true }
      }
    ])
    mainStorageMocks.getConfig.mockImplementation(() => JSON.parse(serialized))
    mainStorageMocks.saveConfig.mockImplementation((_name: string, content?: string) => {
      serialized = String(content)
      return { success: true }
    })
    const live: ShortcutModule[] = []
    const reopen = () => {
      const module = new ShortcutModule()
      live.push(module)
      module.onInit({ app: {}, runtime: { channel: {} } } as Parameters<
        ShortcutModule['onInit']
      >[0])
      module.registerMainShortcut(systemId, systemKey, vi.fn(), { enabled: true })
      return module
    }
    const close = (module: ShortcutModule) => {
      module.onDestroy()
      live.splice(live.indexOf(module), 1)
    }
    return {
      reopen,
      close,
      records: (): Shortcut[] => JSON.parse(serialized),
      cleanup: () => live.splice(0).forEach((module) => module.onDestroy())
    }
  }

  it('restores an explicitly disabled system key and preserves it across recorder suspension', () => {
    const disk = persistence()
    try {
      let module = disk.reopen()
      expect(module.updateShortcut(systemId, undefined, false)).toBe(true)
      disk.close(module)
      electronMocks.register.mockClear()
      module = disk.reopen()
      expect(disk.records().find((row) => row.id === systemId)?.meta.enabled).toBe(false)
      expect(module.getEffectiveAccelerator(systemId)).toBeNull()
      const restartedStatus = module as unknown as Pick<ShortcutModuleHarness, 'shortcutStatusMap'>
      expect(restartedStatus.shortcutStatusMap?.get(systemId)?.state).toBe('disabled')
      expect(electronMocks.register).not.toHaveBeenCalledWith(systemKey, expect.any(Function))
      mainStorageMocks.saveConfig.mockClear()
      module.disableAll()
      module.enableAll()
      expect(mainStorageMocks.saveConfig).not.toHaveBeenCalled()
      expect(disk.records().find((row) => row.id === systemId)?.meta.enabled).toBe(false)
      expect(module.getEffectiveAccelerator(systemId)).toBeNull()

      module.updateShortcut(systemId, undefined, true)
      disk.close(module)
      module = disk.reopen()
      expect(disk.records().find((row) => row.id === systemId)?.meta.enabled).toBe(true)
      expect(module.getEffectiveAccelerator(systemId)).toBe(systemKey)
    } finally {
      disk.cleanup()
    }
  })

  it('restores each feature bind/rebind/clear and keeps the binding while its plugin is stopped', () => {
    const disk = persistence()
    const pluginHarness = pluginModule as unknown as { pluginManager: unknown }
    pluginHarness.pluginManager = {
      plugins: new Map([['demo', { name: 'demo', status: PluginStatus.ENABLED }]])
    }
    try {
      let module = disk.reopen()
      for (const key of ['CommandOrControl+Shift+F', 'CommandOrControl+Shift+J']) {
        if (module.getFeatureShortcuts('demo').translate)
          module.updateShortcut(featureId, undefined, false)
        mainStorageMocks.saveConfig.mockClear()
        expect(module.setFeatureShortcut('demo', 'translate', key)).toBe(true)
        expect(mainStorageMocks.saveConfig).toHaveBeenCalledTimes(1)
        disk.close(module)
        module = disk.reopen()
        expect(module.getFeatureShortcuts('demo').translate).toMatchObject({
          accelerator: key,
          meta: { enabled: true },
          status: { state: 'active' }
        })
        expect(module.getEffectiveAccelerator(featureId)).toBe(key)
      }
      const saved = disk.records().find((row) => row.id === featureId)
      disk.close(module)
      pluginHarness.pluginManager = {
        plugins: new Map([['demo', { name: 'demo', status: PluginStatus.DISABLED }]])
      }
      module = disk.reopen()
      expect(module.getFeatureShortcuts('demo').translate).toMatchObject({
        status: { state: 'unavailable', reason: 'runtime-missing' }
      })
      expect(disk.records().find((row) => row.id === featureId)).toEqual(saved)
      disk.close(module)
      pluginHarness.pluginManager = {
        plugins: new Map([['demo', { name: 'demo', status: PluginStatus.ACTIVE }]])
      }
      module = disk.reopen()
      expect(module.getEffectiveAccelerator(featureId)).toBe(saved?.accelerator)
      expect(module.setFeatureShortcut('demo', 'translate', '')).toBe(true)
      disk.close(module)
      module = disk.reopen()
      expect(module.getFeatureShortcuts('demo').translate).toBeUndefined()
      expect(disk.records().find((row) => row.id === featureId)).toBeUndefined()
    } finally {
      disk.cleanup()
      pluginHarness.pluginManager = null
    }
  })

  it.each(['throw', 'false'] as const)(
    'a rejected feature/app multi-field save (%s) preserves the prior binding and callback',
    (failure) => {
      const disk = persistence()
      const pluginHarness = pluginModule as unknown as { pluginManager: unknown }
      pluginHarness.pluginManager = {
        plugins: new Map([['demo', { name: 'demo', status: PluginStatus.ENABLED }]])
      }
      try {
        const module = disk.reopen()
        module.setFeatureShortcut('demo', 'translate', 'CommandOrControl+Shift+F')
        module.updateShortcut(featureId, undefined, false)
        const featureBefore = disk.records().find((row) => row.id === featureId)
        const rejectSave = () =>
          mainStorageMocks.saveConfig.mockImplementationOnce(() => {
            if (failure === 'throw') throw new Error('disk unavailable')
            return { success: false }
          })
        rejectSave()
        expect(() =>
          module.setFeatureShortcut('demo', 'translate', 'CommandOrControl+Shift+J')
        ).toThrow()
        expect(module.getFeatureShortcuts('demo').translate).toMatchObject(featureBefore!)
        module.updateShortcut(systemId, undefined, false)
        expect(disk.records().find((row) => row.id === featureId)).toEqual(featureBefore)

        const previousCallback = vi.fn()
        const rejectedCallback = vi.fn()
        const appKey = 'CommandOrControl+Shift+A'
        module.setAppShortcut('app.test.persisted', appKey, previousCallback)
        electronMocks.register.mockClear()
        rejectSave()
        expect(() =>
          module.setAppShortcut('app.test.persisted', 'CommandOrControl+Shift+B', rejectedCallback)
        ).toThrow()
        expect(module.getShortcutAccelerator('app.test.persisted')).toBe(appKey)
        module.disableAll()
        module.enableAll()
        const callbacks = new Map(electronMocks.register.mock.calls)
        callbacks.get(appKey)?.()
        expect(previousCallback).toHaveBeenCalledTimes(1)
        expect(rejectedCallback).not.toHaveBeenCalled()
        disk.close(module)
        const restarted = disk.reopen()
        expect(restarted.getFeatureShortcuts('demo').translate).toMatchObject(featureBefore!)
        expect(restarted.getShortcutAccelerator('app.test.persisted')).toBe(appKey)
      } finally {
        disk.cleanup()
        pluginHarness.pluginManager = null
      }
    }
  )
})
