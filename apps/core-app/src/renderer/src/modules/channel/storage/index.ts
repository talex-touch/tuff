import { storages } from '@talex-touch/utils/renderer'
import { appSettings } from '@talex-touch/utils/renderer/storage/app-settings'
import { openersStorage } from '@talex-touch/utils/renderer/storage/openers'
import { reactive, toRaw, unref } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { AccountStorage } from '~/modules/channel/storage/accounter'
import '~/modules/channel/storage/base'

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
    this.account = reactive(new AccountStorage())
    void this.loadAccountFromStorage()
  }

  private async loadAccountFromStorage(): Promise<void> {
    const startAt = performance.now()
    try {
      const data = await touchChannel.send('storage:get', 'account.ini')
      this.account.analyzeFromObj(data)
    } catch (error) {
      console.warn('[StorageManager] Failed to load account storage:', error)
    } finally {
      const duration = performance.now() - startAt
      if (duration > 200) {
        console.warn(`[StorageManager] account.ini load took ${duration.toFixed(1)}ms`)
      }
    }
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
      value: toRaw(unref(data) as object),
      clear,
    })
  }
}

// Auto-save all registered storages before the app closes
window.onbeforeunload = () => {
  for (const storage of storages.values()) {
    // Use synchronous save to ensure data is persisted before window closes
    storage.saveSync()
  }
}

/**
 * Global instance of the StorageManager
 */
export const storageManager = new StorageManager()

/**
 * Application settings storage instance.
 * Access reactive data via `appSetting`.
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

/**
 * Openers storage instance.
 * Access reactive data via `openers.data`.
 */
export const openers = openersStorage.data
