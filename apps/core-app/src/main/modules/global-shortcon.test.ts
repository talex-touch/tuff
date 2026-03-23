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
  useMainStorage: () => ({
    getConfig: vi.fn(),
    saveConfig: vi.fn()
  })
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

function createModule() {
  const module: any = new ShortcutModule()
  const storage = new InMemoryShortcutStorage()
  module.storage = storage
  return { module, storage }
}

afterEach(() => {
  electronMocks.register.mockClear()
  electronMocks.unregisterAll.mockClear()
  electronMocks.getAllWindows.mockClear()
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
