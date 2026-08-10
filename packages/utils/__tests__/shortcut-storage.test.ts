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

/**
 * The accessors handed back the live `_config` array and live elements, so
 * `getAllShortcuts().sort(byName)` reordered internal state with nothing written, and the next
 * unrelated `_save()` silently persisted it (#888).
 *
 * The obvious fix -- "return a copy from both accessors" -- would have broken the mutators,
 * which read through getShortcutById and assign to the object they get back. Hence the private
 * live lookup; these tests pin both halves.
 */
describe('shortcutStorage encapsulation', () => {
  function createStorage() {
    const saveConfig = vi.fn()
    const storage = new ShortcutStorage({
      getConfig: () => [createShortcut('a'), createShortcut('b')],
      saveConfig,
    })
    return { storage, saveConfig }
  }

  it('does not let a caller reorder internal state through getAllShortcuts', () => {
    const { storage } = createStorage()

    storage.getAllShortcuts().reverse()

    expect(storage.getAllShortcuts().map(s => s.id)).toEqual(['a', 'b'])
  })

  it('does not let a caller append to internal state through getAllShortcuts', () => {
    const { storage } = createStorage()

    storage.getAllShortcuts().push(createShortcut('injected'))

    expect(storage.getAllShortcuts()).toHaveLength(2)
  })

  it('does not let a caller edit a nested field through getShortcutById', () => {
    const { storage } = createStorage()

    const shortcut = storage.getShortcutById('a')!
    shortcut.accelerator = 'Tampered'
    shortcut.meta.enabled = false

    expect(storage.getShortcutById('a')!.accelerator).toBe('CommandOrControl+Shift+K')
    expect(storage.getShortcutById('a')!.meta.enabled).toBe(true)
  })

  it('does not retain the caller object passed to addShortcut', () => {
    const { storage } = createStorage()
    const incoming = createShortcut('c')

    storage.addShortcut(incoming)
    incoming.accelerator = 'Tampered'

    expect(storage.getShortcutById('c')!.accelerator).toBe('CommandOrControl+Shift+K')
  })

  it('still applies updateShortcutAccelerator, which reads through the live lookup', () => {
    const { storage, saveConfig } = createStorage()

    expect(storage.updateShortcutAccelerator('a', 'CommandOrControl+J')).toBe(true)

    // The trap in the issue's suggested fix: routing mutators through a copying accessor makes
    // this silently no-op while still reporting success and still writing the file.
    expect(storage.getShortcutById('a')!.accelerator).toBe('CommandOrControl+J')
    expect(saveConfig).toHaveBeenCalled()
  })

  it('still applies updateShortcutEnabled, which reads through the live lookup', () => {
    const { storage } = createStorage()

    expect(storage.updateShortcutEnabled('b', false)).toBe(true)

    expect(storage.getShortcutById('b')!.meta.enabled).toBe(false)
  })
})
