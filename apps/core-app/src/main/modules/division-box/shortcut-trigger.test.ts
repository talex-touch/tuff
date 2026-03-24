import { afterEach, describe, expect, it, vi } from 'vitest'

const shortcutMocks = vi.hoisted(() => ({
  registerMainShortcut: vi.fn(() => true),
  unregisterMainShortcut: vi.fn(() => true)
}))

const divisionManagerMocks = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({ sessionId: 'session-1' }))
}))

vi.mock('../global-shortcon', () => ({
  shortcutModule: {
    registerMainShortcut: shortcutMocks.registerMainShortcut,
    unregisterMainShortcut: shortcutMocks.unregisterMainShortcut
  }
}))

vi.mock('./manager', () => ({
  DivisionBoxManager: {
    getInstance: () => ({
      createSession: divisionManagerMocks.createSession
    })
  }
}))

import { shortcutTriggerManager } from './shortcut-trigger'

function createMapping(id: string) {
  return {
    id,
    defaultAccelerator: 'CommandOrControl+Shift+D',
    config: {
      url: 'plugin://demo-plugin/index.html',
      title: 'Demo Plugin',
      size: 'medium' as const,
      keepAlive: true
    }
  }
}

afterEach(() => {
  shortcutTriggerManager.clear()
  shortcutMocks.registerMainShortcut.mockClear()
  shortcutMocks.unregisterMainShortcut.mockClear()
  divisionManagerMocks.createSession.mockClear()
})

describe('ShortcutTriggerManager', () => {
  it('registers shortcut with owner and unregisters runtime binding', () => {
    const mapping = createMapping('plugin.demo.division-box')

    const success = shortcutTriggerManager.registerShortcut(mapping)
    expect(success).toBe(true)
    expect(shortcutMocks.registerMainShortcut).toHaveBeenCalledWith(
      mapping.id,
      mapping.defaultAccelerator,
      expect.any(Function),
      { owner: 'module.division-box.shortcut-trigger' }
    )

    const removed = shortcutTriggerManager.unregisterShortcut(mapping.id)
    expect(removed).toBe(true)
    expect(shortcutMocks.unregisterMainShortcut).toHaveBeenCalledWith(mapping.id)
    expect(shortcutTriggerManager.getMapping(mapping.id)).toBeUndefined()
  })

  it('clear unregisters all runtime shortcuts', () => {
    const first = createMapping('plugin.demo.first')
    const second = createMapping('plugin.demo.second')

    expect(shortcutTriggerManager.registerShortcut(first)).toBe(true)
    expect(shortcutTriggerManager.registerShortcut(second)).toBe(true)
    shortcutMocks.unregisterMainShortcut.mockClear()

    shortcutTriggerManager.clear()

    expect(shortcutTriggerManager.getAllMappings()).toHaveLength(0)
    expect(shortcutMocks.unregisterMainShortcut).toHaveBeenCalledTimes(2)
    expect(shortcutMocks.unregisterMainShortcut).toHaveBeenCalledWith(first.id)
    expect(shortcutMocks.unregisterMainShortcut).toHaveBeenCalledWith(second.id)
  })
})
