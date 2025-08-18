import '~/modules/channel/storage/base'
import { reactive, unref } from 'vue'
import { AccountStorage } from '~/modules/channel/storage/accounter'
import { touchChannel } from '~/modules/channel/channel-core'
import { storages } from '@talex-touch/utils/renderer'
import { appSettings } from '@talex-touch/utils/renderer/storage/app-settings'

/**
 * StorageManager handles the reactive data storages of the app,
 * such as theme settings, application preferences, and user accounts.
 * It also ensures data persistence through touchChannel sync and save operations.
 *
 * @example
 * ```ts
 * import { storageManager } from './storage-manager';
 * const appSetting = storageManager.appSetting;
 * ```
 */
/**
 * StorageManager handles the reactive data storages of the app,
 * such as theme settings and user accounts.
 * It also ensures data persistence through touchChannel sync and save operations.
 *
 * @example
 * ```ts
 * import { storageManager } from './storage-manager';
 * const account = storageManager.account;
 * ```
 */
export class StorageManager {
  /** Reactive theme configuration */
  themeStyle: object = {}

  /** Reactive user account information */
  account: AccountStorage

  constructor() {
    this.account = reactive(new AccountStorage(touchChannel.sendSync('storage:get', 'account.ini')))
  }

  /**
   * Persists data to the backend channel.
   *
   * @param name The key name used for storage.
   * @param data The data to be serialized and saved.
   * @param clear Whether to clear previous content before saving.
   * @returns A Promise indicating when save is complete.
   *
   * @example
   * ```ts
   * await manager._save('example.ini', { key: 'value' }, true);
   * ```
   */
  async _save(name: string, data: object, clear: boolean = false): Promise<void> {
    await touchChannel.send('storage:save', {
      key: name,
      content: JSON.stringify(unref(data)),
      clear
    })
  }
}

// Auto-save all registered storages before the app closes
window.onbeforeunload = () => {
  for (const storage of storages.values()) {
    touchChannel.send('storage:save', {
      key: storage.getQualifiedName(),
      content: JSON.stringify(unref(storage.data) || storage.originalData),
      clear: true
    })
  }
}

/**
 * Global instance of the StorageManager
 */
export const storageManager = new StorageManager()

/**
 * Convenient access to application settings, powered by TouchStorage
 *
 * @example
 * ```ts
 * import { appSetting } from './storage';
 *
 * // Read a setting
 * console.log(appSetting.autoStart);
 *
 * // Modify a setting (automatically persisted)
 * appSetting.autoStart = true;
 * ```
 */
export const appSetting = appSettings.data

console.log(appSettings, appSetting)
