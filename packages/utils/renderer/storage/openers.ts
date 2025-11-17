import { TouchStorage, getOrCreateStorageSingleton } from '.'
import { openersOriginData, StorageList, type OpenersMap } from '../..'

class OpenersStorage extends TouchStorage<OpenersMap> {
  constructor() {
    super(StorageList.OPENERS, JSON.parse(JSON.stringify(openersOriginData)))
    this.setAutoSave(true)
  }
}

const OPENERS_STORAGE_KEY = `storage:${StorageList.OPENERS}`

export const openersStorage = getOrCreateStorageSingleton<OpenersStorage>(
  OPENERS_STORAGE_KEY,
  () => new OpenersStorage()
)
