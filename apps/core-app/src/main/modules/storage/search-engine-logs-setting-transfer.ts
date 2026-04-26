import type { AppSetting } from '@talex-touch/utils'
import { StorageList } from '@talex-touch/utils'
import { resolveMainStorageValue } from './main-storage-registry'

interface PlainObject {
  [key: string]: unknown
}

export interface SearchEngineLogsSettingMigrationPlan {
  nextAppSetting: AppSetting
  writeAppSetting: boolean
  removeHistoricalSetting: boolean
}

function isPlainObject(value: unknown): value is PlainObject {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function hasExplicitLogsEnabled(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false
  }

  const searchEngine = value.searchEngine
  return isPlainObject(searchEngine) && typeof searchEngine.logsEnabled === 'boolean'
}

function normalizeHistoricalLogsEnabled(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function buildSearchEngineLogsSettingMigrationPlan(
  rawAppSetting: unknown,
  rawHistoricalSetting: unknown
): SearchEngineLogsSettingMigrationPlan {
  const nextAppSetting = resolveMainStorageValue(StorageList.APP_SETTING, rawAppSetting)
  const historicalLogsEnabled = normalizeHistoricalLogsEnabled(rawHistoricalSetting)
  const hasExplicitLogsSetting = hasExplicitLogsEnabled(rawAppSetting)
  const currentLogsEnabled = nextAppSetting.searchEngine?.logsEnabled

  if (historicalLogsEnabled === undefined) {
    return {
      nextAppSetting,
      writeAppSetting: false,
      removeHistoricalSetting: false
    }
  }

  const shouldWriteAppSetting =
    !hasExplicitLogsSetting && historicalLogsEnabled === true && currentLogsEnabled !== true

  if (!shouldWriteAppSetting) {
    return {
      nextAppSetting,
      writeAppSetting: false,
      removeHistoricalSetting: true
    }
  }

  return {
    nextAppSetting: {
      ...nextAppSetting,
      searchEngine: {
        ...nextAppSetting.searchEngine,
        logsEnabled: historicalLogsEnabled
      }
    },
    writeAppSetting: true,
    removeHistoricalSetting: true
  }
}
