import { StorageList } from '@talex-touch/utils'
import { normalizeAutoResumeOnStartup } from '@talex-touch/utils/common/storage/entity/app-settings'

export type AutoResumeSettingReader = () => boolean

let autoResumeOnStartupReader: AutoResumeSettingReader | null = null

export function resolveAutoResumeOnStartupFromSettings(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object') {
    return true
  }
  const conversation = (settings as { conversation?: unknown }).conversation
  if (!conversation || typeof conversation !== 'object') {
    return true
  }
  return normalizeAutoResumeOnStartup(
    (conversation as { autoResumeOnStartup?: unknown }).autoResumeOnStartup
  )
}

export function createMainStorageAutoResumeReader(deps: {
  isMainStorageReady: () => boolean
  getMainConfig: (key: StorageList.APP_SETTING) => unknown
}): AutoResumeSettingReader {
  return () => {
    try {
      if (!deps.isMainStorageReady()) {
        return true
      }
      return resolveAutoResumeOnStartupFromSettings(deps.getMainConfig(StorageList.APP_SETTING))
    } catch {
      return true
    }
  }
}

export function setAutoResumeOnStartupReader(reader: AutoResumeSettingReader | null): void {
  autoResumeOnStartupReader = reader
}

export function isAutoResumeOnStartupEnabled(): boolean {
  if (!autoResumeOnStartupReader) {
    return true
  }
  try {
    return normalizeAutoResumeOnStartup(autoResumeOnStartupReader())
  } catch {
    return true
  }
}
