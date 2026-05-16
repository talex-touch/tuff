import { StorageList } from '@talex-touch/utils'
import { storages, useStorageSdk } from '@talex-touch/utils/renderer'
import { appSettingsData, openersData } from '@talex-touch/utils/renderer/storage'
import { reactive, toRaw, unref } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { AccountStorage } from './account-storage'

const storageLog = createRendererLogger('StorageManager')

/**
 * Renderer app storage facade.
 *
 * Feature code should import from this module instead of the low-level channel
 * storage bootstrap namespace.
 */
export class StorageManager {
  themeStyle: object = {}
  account: AccountStorage
  private storageSdk = useStorageSdk()

  constructor() {
    this.account = reactive(new AccountStorage())
    void this.loadAccountFromStorage()
  }

  private async loadAccountFromStorage(): Promise<void> {
    const startAt = performance.now()
    try {
      const data = await this.storageSdk.app.get<Parameters<typeof this.account.analyzeFromObj>[0]>(
        StorageList.ACCOUNT
      )
      if (data && typeof data === 'object') {
        this.account.analyzeFromObj(data, { persist: false })
      }
    } catch (error) {
      storageLog.warn('Failed to load account storage:', error)
    } finally {
      const duration = performance.now() - startAt
      if (duration > 200) {
        storageLog.warn(`account.ini load took ${duration.toFixed(1)}ms`)
      }
    }
  }

  async _save(name: string, data: object, clear: boolean = false): Promise<void> {
    await this.storageSdk.app.save({
      key: name,
      value: toRaw(unref(data) as object),
      clear
    })
  }
}

window.onbeforeunload = () => {
  for (const storage of storages.values()) {
    storage.saveSync()
  }
}

export const storageManager = new StorageManager()
export const appSetting = appSettingsData
export const openers = openersData
