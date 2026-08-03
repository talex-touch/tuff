import { describe, expect, it, vi } from 'vitest'
import { ShortcutType } from '../common/storage/entity/shortcut-settings'
import ShortcutStorage from '../common/storage/shortcut-storage'

function createShortcut(id: string) {
  return {
    id,
    accelerator: 'CommandOrControl+Shift+K',
    type: ShortcutType.MAIN,
    meta: {
      creationTime: 1,
      modificationTime: 1,
      author: 'system',
      enabled: true,
    },
  }
}

describe('shortcutStorage.removeShortcuts', () => {
  it('removes retired shortcuts in one persisted update and preserves unrelated entries', () => {
    const saveConfig = vi.fn()
    const storage = new ShortcutStorage({
      getConfig: () => [
        createShortcut('core.box.aiQuickCall'),
        createShortcut('flow:detach-to-divisionbox'),
        createShortcut('flow:transfer-to-plugin'),
        createShortcut('core.box.toggle'),
      ],
      saveConfig,
    })

    const removedCount = storage.removeShortcuts([
      'core.box.aiQuickCall',
      'flow:detach-to-divisionbox',
      'flow:transfer-to-plugin',
    ])

    expect(removedCount).toBe(3)
    expect(storage.getAllShortcuts().map(shortcut => shortcut.id)).toEqual(['core.box.toggle'])
    expect(saveConfig).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(saveConfig.mock.calls[0]?.[1]))).toEqual([
      createShortcut('core.box.toggle'),
    ])
  })

  it('does not persist when no shortcut matches', () => {
    const saveConfig = vi.fn()
    const storage = new ShortcutStorage({
      getConfig: () => [createShortcut('core.box.toggle')],
      saveConfig,
    })

    expect(storage.removeShortcuts(['core.box.aiQuickCall'])).toBe(0)
    expect(saveConfig).not.toHaveBeenCalled()
  })
})
