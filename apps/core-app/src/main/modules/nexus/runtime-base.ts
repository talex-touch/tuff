import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils'
import {
  applyTuffNexusRuntimeServerMigration,
  NEXUS_BASE_URL,
  type TuffNexusRuntimeServer,
  type TuffNexusRuntimeServerSettings,
  resolveTuffNexusBaseUrl
} from '@talex-touch/utils/env'
import { getMainConfig, saveMainConfig } from '../storage'

/**
 * Only the storage plumbing lives here. The migration policy itself is shared with the renderer
 * copy of this module via @talex-touch/utils/env -- the two had drifted while claiming to decide
 * the same thing (#522).
 */
export function ensureRuntimeServerSettings(appSettings: AppSetting): TuffNexusRuntimeServer {
  const dev = (appSettings.dev ?? {}) as AppSetting['dev'] & TuffNexusRuntimeServerSettings
  const runtimeServer = applyTuffNexusRuntimeServerMigration(dev)
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
