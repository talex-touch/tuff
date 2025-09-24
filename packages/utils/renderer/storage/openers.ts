import { TouchStorage } from '.'
import { openersOriginData, StorageList, type OpenersMap } from '../..'

class OpenersStorage extends TouchStorage<OpenersMap> {
  constructor() {
    super(StorageList.OPENERS, JSON.parse(JSON.stringify(openersOriginData)))
    this.setAutoSave(true)
  }
}

export const openersStorage = new OpenersStorage()
