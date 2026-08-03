import type { Shortcut } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import {
  ShortcutTriggerKind,
  ShortcutType
} from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
  register: vi.fn(() => true),
  unregisterAll: vi.fn(),
  getAllWindows: vi.fn(() => [])
}))

const mainStorageMocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn()
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
      BEFORE_APP_QUIT: 'app-before-quit'
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

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => ({
    on: vi.fn(() => () => {})
  })
}))

import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { ShortcutModule } from './global-shortcon'

type MutableShortcut = Shortcut & {
  meta: NonNullable<Shortcut['meta']> & {
    triggerKind?: string
    shortcutId?: string
  }
}

class InMemoryShortcutStorage {
  private readonly shortcuts = new Map<string, MutableShortcut>()

  getShortcutById(id: string): MutableShortcut | undefined {
    return this.shortcuts.get(id)
  }

  addShortcut(shortcut: Shortcut): void {
    this.shortcuts.set(shortcut.id, shortcut as MutableShortcut)
  }

  getAllShortcuts(): MutableShortcut[] {
    return Array.from(this.shortcuts.values())
  }

  updateShortcutAccelerator(id: string, accelerator: string): boolean {
    const shortcut = this.shortcuts.get(id)
    if (!shortcut) return false
    shortcut.accelerator = accelerator
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
  shortcutStatusMap?: Map<string, { state?: string; reason?: string }>
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
