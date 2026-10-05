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
    expect(JSON.parse(String(saveConfig.mock.calls[0]?.[1]))).toEqual([createShortcut('core.box.toggle')])
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

describe('shortcutStorage durable replacement writes', () => {
  function diskBoundary() {
    let serialized = JSON.stringify([createShortcut('system'), createShortcut('unrelated')])
    const saveConfig = vi.fn((_name: string, content?: string): void | { success: boolean } => {
      serialized = String(content)
      return { success: true }
    })
    const reopen = () =>
      new ShortcutStorage({
        getConfig: () => JSON.parse(serialized),
        saveConfig,
      })
    return { reopen, saveConfig }
  }

  it('reopens with both the changed key and enablement committed together', () => {
    const disk = diskBoundary()
    const storage = disk.reopen()
    expect(storage.updateShortcutAccelerator('system', 'CommandOrControl+J', false)).toBe(true)
    expect(disk.saveConfig).toHaveBeenCalledTimes(1)
    expect(disk.reopen().getShortcutById('system')).toMatchObject({
      accelerator: 'CommandOrControl+J',
      meta: { enabled: false },
    })
    const reopened = disk.reopen()
    reopened.updateShortcutEnabled('system', true)
    expect(disk.reopen().getShortcutById('system')).toMatchObject({
      accelerator: 'CommandOrControl+J',
      meta: { enabled: true },
    })
  })

  it.each(['throw', 'false'] as const)(
    'rejects a two-field %s save without leaking it into the next successful write',
    failure => {
      const disk = diskBoundary()
      const storage = disk.reopen()
      const before = storage.getShortcutById('system')
      disk.saveConfig.mockImplementationOnce(() => {
        if (failure === 'throw') throw new Error('disk unavailable')
        return { success: false }
      })
      expect(() => storage.updateShortcutAccelerator('system', 'CommandOrControl+J', false)).toThrow()
      expect(storage.getShortcutById('system')).toEqual(before)
      expect(disk.reopen().getShortcutById('system')).toEqual(before)
      storage.updateShortcutEnabled('unrelated', false)
      expect(disk.reopen().getShortcutById('system')).toEqual(before)
      expect(disk.reopen().getShortcutById('unrelated')?.meta.enabled).toBe(false)
    },
  )

  it.each([
    ['add', (storage: ShortcutStorage) => storage.addShortcut(createShortcut('new'))],
    ['disable', (storage: ShortcutStorage) => storage.updateShortcutEnabled('system', false)],
    ['remove', (storage: ShortcutStorage) => storage.removeShortcuts(['system'])],
  ] as const)('a rejected %s does not become durable through an unrelated edit', (_name, mutate) => {
    for (const failure of ['throw', 'false']) {
      const disk = diskBoundary()
      const storage = disk.reopen()
      const before = storage.getAllShortcuts()
      disk.saveConfig.mockImplementationOnce(() => {
        if (failure === 'throw') throw new Error('disk unavailable')
        return { success: false }
      })
      expect(() => mutate(storage)).toThrow()
      expect(storage.getAllShortcuts()).toEqual(before)
      storage.updateShortcutAccelerator('unrelated', 'CommandOrControl+U')
      const restarted = disk.reopen()
      expect(restarted.getShortcutById('system')).toEqual(before[0])
      expect(restarted.getShortcutById('new')).toBeUndefined()
      expect(restarted.getShortcutById('unrelated')?.accelerator).toBe('CommandOrControl+U')
    }
  })

  it('does not persist mutations of either public read, including nested array entries', () => {
    const disk = diskBoundary()
    const storage = disk.reopen()
    const rows = storage.getAllShortcuts()
    rows[0].accelerator = 'CommandOrControl+X'
    rows[0].meta.enabled = false
    rows.reverse()
    rows.push(createShortcut('injected'))
    const item = storage.getShortcutById('system')!
    item.meta.author = 'intruder'
    storage.updateShortcutEnabled('unrelated', false)
    expect(disk.reopen().getAllShortcuts()).toEqual([
      createShortcut('system'),
      expect.objectContaining({ id: 'unrelated', meta: expect.objectContaining({ enabled: false }) }),
    ])
  })
})
