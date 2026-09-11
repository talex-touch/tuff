import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils'
import {
  migrateTuffNexusRuntimeServer,
  NEXUS_BASE_URL,
  resolveTuffNexusBaseUrl,
  validateNexusBaseUrl,
  type TuffNexusRuntimeServer
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

/**
 * The user-chosen Nexus base URL, or '' when it is unset or no longer valid.
 *
 * A stored value that stopped validating is dropped instead of used: the settings page rejects
 * such an address, so main must not route signed requests to an origin the user cannot see or
 * correct from the UI.
 */
function readUserNexusBaseUrl(appSettings: AppSetting): string {
  const stored = appSettings.auth?.nexusBaseUrl
  if (typeof stored !== 'string' || !stored.trim()) {
    return ''
  }
  const validation = validateNexusBaseUrl(stored)
  return validation.ok ? validation.value : ''
}

interface RuntimeNexusSettings {
  runtimeServer: TuffNexusRuntimeServer
  customBaseUrl: string
}

/**
 * Reads both inputs that decide the Nexus origin in one pass.
 *
 * The legacy `authServer` migration is part of the read: main persists `dev` only when it changed,
 * so writing the mutation back *is* the migration, and resolving twice would repeat it.
 */
function readRuntimeNexusSettings(): RuntimeNexusSettings {
  const appSettings = getMainConfig(StorageList.APP_SETTING) as AppSetting
  const before = JSON.stringify(appSettings.dev ?? {})
  const runtimeServer = ensureRuntimeServerSettings(appSettings)
  if (JSON.stringify(appSettings.dev ?? {}) !== before) {
    saveMainConfig(StorageList.APP_SETTING, appSettings)
  }
  return { runtimeServer, customBaseUrl: readUserNexusBaseUrl(appSettings) }
}

export function getRuntimeServerMode(): TuffNexusRuntimeServer {
  return readRuntimeNexusSettings().runtimeServer
}

export function getRuntimeNexusBaseUrl(): string {
  const { runtimeServer, customBaseUrl } = readRuntimeNexusSettings()
  return resolveTuffNexusBaseUrl({ runtimeServer, customBaseUrl })
}

export function getOfficialNexusBaseUrl(): string {
  return NEXUS_BASE_URL
}
