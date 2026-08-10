import type { Shortcut, ShortcutSetting } from './entity/shortcut-settings'
import { StorageList } from './constants'
import { shortcutSettingOriginData } from './entity/shortcut-settings'

class ShortcutStorage {
  private _config: ShortcutSetting = []

  constructor(private readonly storage: {
    getConfig: (name: string) => any
    saveConfig: (name: string, content?: string) => void
  }) {
    this.init()
  }

  private init() {
    const config = this.storage.getConfig(StorageList.SHORTCUT_SETTING)
    if (!config || !Array.isArray(config) || config.length === 0) {
      this._config = [...shortcutSettingOriginData]
      this._save()
    }
    else {
      this._config = config
    }
  }

  private _save() {
    this.storage.saveConfig(StorageList.SHORTCUT_SETTING, JSON.stringify(this._config, null, 2))
  }

  /**
   * The live element, for internal mutators only.
   *
   * The public accessors below hand out clones, but `updateShortcutAccelerator` and
   * `updateShortcutEnabled` work by assigning to the returned object and then calling
   * `_save()`. Routing them through the public accessor would have them mutate a throwaway
   * copy and persist the unchanged config -- the shortcut editor would appear to accept a
   * change that never took effect.
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
    this._config.push(structuredClone(shortcut))
    this._save()
    return true
  }

  updateShortcutAccelerator(id: string, newAccelerator: string): boolean {
    const shortcut = this._findShortcut(id)
    if (!shortcut) {
      return false
    }
    shortcut.accelerator = newAccelerator
    shortcut.meta.modificationTime = Date.now()
    this._save()
    return true
  }

  updateShortcutEnabled(id: string, enabled: boolean): boolean {
    const shortcut = this._findShortcut(id)
    if (!shortcut) {
      return false
    }
    shortcut.meta.enabled = enabled
    shortcut.meta.modificationTime = Date.now()
    this._save()
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

    this._config = nextConfig
    this._save()
    return removedCount
  }
}

export default ShortcutStorage
