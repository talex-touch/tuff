import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils'
import {
  migrateTuffNexusRuntimeServer,
  NEXUS_BASE_URL,
  type TuffNexusRuntimeServer,
  resolveTuffNexusBaseUrl
} from '@talex-touch/utils/env'
import { getMainConfig, saveMainConfig } from '../storage'

type LegacyDevSettings = AppSetting['dev'] & {
  authServer?: TuffNexusRuntimeServer
  runtimeServer?: TuffNexusRuntimeServer
}

export function ensureRuntimeServerSettings(appSettings: AppSetting): TuffNexusRuntimeServer {
  const dev = (appSettings.dev ?? {}) as LegacyDevSettings
  const runtimeServer = migrateTuffNexusRuntimeServer(dev)
  appSettings.dev = dev
  return runtimeServer
}

export function getRuntimeServerMode(): TuffNexusRuntimeServer {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const before = JSON.stringify(appSettings.dev ?? {})
  const runtimeServer = ensureRuntimeServerSettings(appSettings)
  if (JSON.stringify(appSettings.dev ?? {}) !== before) {
    saveMainConfig(StorageList.APP_SETTING, appSettings)
  }
  return runtimeServer
}

export function getRuntimeNexusBaseUrl(): string {
  return resolveTuffNexusBaseUrl({
    runtimeServer: getRuntimeServerMode()
  })
}

export function getOfficialNexusBaseUrl(): string {
  return NEXUS_BASE_URL
}
