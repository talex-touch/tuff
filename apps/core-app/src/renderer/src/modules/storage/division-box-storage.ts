import { createStorageProxy, TouchStorage } from '@talex-touch/utils/renderer/storage/base-storage'

interface DivisionBoxPreferences {
  version: number
  pinnedSessionIds: string[]
}

const DIVISION_BOX_STORAGE_KEY = 'division-box/preferences'
const DIVISION_BOX_SINGLETON_KEY = `storage:${DIVISION_BOX_STORAGE_KEY}`

const defaultPreferences: DivisionBoxPreferences = {
  version: 1,
  pinnedSessionIds: []
}

class DivisionBoxStorage extends TouchStorage<DivisionBoxPreferences> {
  constructor() {
    super(DIVISION_BOX_STORAGE_KEY, { ...defaultPreferences })
    this.setAutoSave(true)
  }

  setPinnedSessionIds(sessionIds: string[]): void {
    this.data.pinnedSessionIds = [...sessionIds]
  }

  getPinnedSessionIds(): string[] {
    return this.data.pinnedSessionIds
  }
}

export const divisionBoxStorage = createStorageProxy(
  DIVISION_BOX_SINGLETON_KEY,
  () => new DivisionBoxStorage()
)
