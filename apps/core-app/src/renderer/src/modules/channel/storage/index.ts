import { storages } from '@talex-touch/utils/renderer'
import { appSettingsData, openersData } from '@talex-touch/utils/renderer/storage'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { StorageEvents } from '@talex-touch/utils/transport/events'
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
/**
 * StorageManager handles the reactive data storages of the app,
 * such as theme settings and user accounts.
 * It also ensures data persistence through transport-based sync and save operations.
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
  private transport = useTuffTransport()

  constructor() {
    this.account = reactive(new AccountStorage())
    void this.loadAccountFromStorage()
  }

  private async loadAccountFromStorage(): Promise<void> {
    const startAt = performance.now()
    try {
      const data = await this.transport.send(StorageEvents.app.get, { key: 'account.ini' })
      if (data && typeof data === 'object') {
        this.account.analyzeFromObj(data as Parameters<typeof this.account.analyzeFromObj>[0])
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
    await this.transport.send(StorageEvents.app.save, {
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
 * // Read a setting
 * console.log(appSetting.autoStart);
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
