import type { Shortcut, ShortcutSetting } from './entity/shortcut-settings'
import { StorageList } from './constants'
import { shortcutSettingOriginData } from './entity/shortcut-settings'

class ShortcutStorage {
  private _config: ShortcutSetting = []

  constructor(
    private readonly storage: {
      getConfig: (name: string) => any
      saveConfig: (name: string, content?: string) => void | { success: boolean }
    },
  ) {
    this.init()
  }

  private init() {
    const config = this.storage.getConfig(StorageList.SHORTCUT_SETTING)
    if (!config || !Array.isArray(config) || config.length === 0) {
      this._config = [...shortcutSettingOriginData]
      this._save()
    } else {
      this._config = config
    }
  }

  private _save(config: ShortcutSetting = this._config) {
    const result = this.storage.saveConfig(StorageList.SHORTCUT_SETTING, JSON.stringify(config, null, 2))
    if (result && !result.success) {
      throw new Error('Shortcut configuration save failed')
    }
    this._config = config
  }

  /**
   * The current element, for internal mutators only.
   *
   * Public reads return clones. Mutators build replacement values and publish them only after
   * storage accepts the save, so a rejected edit cannot leak into a later successful write.
   */
  private _findShortcut(id: string): Shortcut | undefined {
    return this._config.find(s => s.id === id)
  }

  /**
   * A deep copy. Callers used to receive the live array, so `getAllShortcuts().sort(byName)`
   * reordered internal state with nothing written, and the reorder was then persisted by the
   * next unrelated `_save()` -- a transient UI sort silently became the saved order (#888).
   */
  getAllShortcuts(): Shortcut[] {
    return this._config.map(shortcut => structuredClone(shortcut))
  }

  /** A deep copy, for the same reason as {@link getAllShortcuts}. */
  getShortcutById(id: string): Shortcut | undefined {
    const shortcut = this._findShortcut(id)
    return shortcut ? structuredClone(shortcut) : undefined
  }

  addShortcut(shortcut: Shortcut): boolean {
    if (this._findShortcut(shortcut.id)) {
      console.warn(`Shortcut with ID ${shortcut.id} already exists.`)
      return false
    }
    // Stored by value, not by reference: keeping the caller's object would leave them holding
    // a handle to internal state, which is the same defect as the accessors had, just inbound.
    this._save([...this._config, structuredClone(shortcut)])
    return true
  }

  updateShortcutAccelerator(id: string, newAccelerator: string, enabled?: boolean): boolean {
    const shortcut = this._findShortcut(id)
    if (!shortcut) {
      return false
    }
    const updated = {
      ...shortcut,
      accelerator: newAccelerator,
      meta: { ...shortcut.meta, modificationTime: Date.now() },
    }
    if (typeof enabled === 'boolean') updated.meta.enabled = enabled
    this._save(this._config.map(current => (current === shortcut ? updated : current)))
    return true
  }

  updateShortcutEnabled(id: string, enabled: boolean): boolean {
    const shortcut = this._findShortcut(id)
    if (!shortcut) {
      return false
    }
    const updated = {
      ...shortcut,
      meta: { ...shortcut.meta, enabled, modificationTime: Date.now() },
    }
    this._save(this._config.map(current => (current === shortcut ? updated : current)))
    return true
  }

  removeShortcuts(ids: readonly string[]): number {
    if (ids.length === 0) {
      return 0
    }

    const retiredIds = new Set(ids)
    const nextConfig = this._config.filter(shortcut => !retiredIds.has(shortcut.id))
    const removedCount = this._config.length - nextConfig.length
    if (removedCount === 0) {
      return 0
    }

    this._save(nextConfig)
    return removedCount
  }
}

export default ShortcutStorage
