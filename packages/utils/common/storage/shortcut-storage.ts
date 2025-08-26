import { StorageList } from './constants'
import { shortcutSettingOriginData, ShortcutSetting, Shortcut } from './entity/shortcut-settings'

class ShortcutStorage {
  private _config: ShortcutSetting = []

  constructor(private readonly storage: {
    getConfig: (name: string) => any,
    saveConfig: (name: string, content?: string) => void,
  }) {
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

  private _save() {
    this.storage.saveConfig(StorageList.SHORTCUT_SETTING, JSON.stringify(this._config, null, 2))
  }

  getAllShortcuts(): Shortcut[] {
    return this._config
  }

  getShortcutById(id: string): Shortcut | undefined {
    return this._config.find(s => s.id === id)
  }

  addShortcut(shortcut: Shortcut): boolean {
    if (this.getShortcutById(shortcut.id)) {
      console.warn(`Shortcut with ID ${shortcut.id} already exists.`)
      return false
    }
    this._config.push(shortcut)
    this._save()
    return true
  }

  updateShortcutAccelerator(id: string, newAccelerator: string): boolean {
    const shortcut = this.getShortcutById(id)
    if (!shortcut) {
      return false
    }
    shortcut.accelerator = newAccelerator
    shortcut.meta.modificationTime = Date.now()
    this._save()
    return true
  }
}

export default ShortcutStorage