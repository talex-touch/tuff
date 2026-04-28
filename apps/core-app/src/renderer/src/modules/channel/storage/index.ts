import { storages, useStorageSdk } from '@talex-touch/utils/renderer'
import { appSettingsData, openersData } from '@talex-touch/utils/renderer/storage'
import { reactive, toRaw, unref } from 'vue'
import { AccountStorage } from '~/modules/channel/storage/accounter'
import '~/modules/channel/storage/base'

/**
 * StorageManager handles the reactive data storages of the app,
 * such as theme settings, application preferences, and user accounts.
 * It also ensures data persistence through transport-based sync and save operations.
 *
 * @example
 * ```ts
 * import { storageManager } from './storage-manager';
 * const appSetting = storageManager.appSetting;
 * ```
 */
export class StorageManager {
  /** Reactive theme configuration */
  themeStyle: object = {}

  /** Reactive user account information */
  account: AccountStorage
  private storageSdk = useStorageSdk()

  constructor() {
    this.account = reactive(new AccountStorage())
    void this.loadAccountFromStorage()
  }

  private async loadAccountFromStorage(): Promise<void> {
    const startAt = performance.now()
    try {
      const data =
        await this.storageSdk.app.get<Parameters<typeof this.account.analyzeFromObj>[0]>(
          'account.ini'
        )
      if (data && typeof data === 'object') {
        this.account.analyzeFromObj(data)
      }
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
   * Persists data through the renderer storage SDK.
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
    await this.storageSdk.app.save({
      key: name,
      value: toRaw(unref(data) as object),
      clear
    })
  }
}

// Auto-save all registered storages before the app closes
window.onbeforeunload = () => {
  for (const storage of storages.values()) {
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
 * // Modify a setting (automatically persisted)
 * appSetting.autoStart = true;
 * ```
 */
export const appSetting = appSettingsData

/**
 * Openers storage instance.
 * Access reactive data via `openers`.
 */
export const openers = openersData
