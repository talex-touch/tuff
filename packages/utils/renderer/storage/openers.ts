import { TouchStorage, getOrCreateStorageSingleton } from '.'
import { openersOriginData, StorageList, type OpenersMap } from '../..'

class OpenersStorage extends TouchStorage<OpenersMap> {
  constructor() {
    super(StorageList.OPENERS, JSON.parse(JSON.stringify(openersOriginData)))
    this.setAutoSave(true)
  }
}

const OPENERS_STORAGE_KEY = `storage:${StorageList.OPENERS}`

/**
 * Lazy-initialized openers storage.
 * The actual instance is created only when first accessed AND after initStorageChannel() is called.
 */
export const openersStorage = new Proxy({} as OpenersStorage, {
  get(_target, prop) {
    const instance = getOrCreateStorageSingleton<OpenersStorage>(
      OPENERS_STORAGE_KEY,
      () => new OpenersStorage()
    );
    return instance[prop as keyof OpenersStorage];
  }
});
