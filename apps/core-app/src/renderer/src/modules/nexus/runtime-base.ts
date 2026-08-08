import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import {
  applyTuffNexusRuntimeServerMigration,
  NEXUS_BASE_URL,
  type TuffNexusRuntimeServer,
  type TuffNexusRuntimeServerSettings,
  resolveTuffNexusBaseUrl
} from '@talex-touch/utils/env'
import { appSetting } from '~/modules/storage/app-storage'

/**
 * Only the storage plumbing lives here -- the renderer mutates the reactive settings store, and
 * seeds `dev` when it is absent, which the main-process copy has no need to do. The migration
 * policy itself is shared via @talex-touch/utils/env (#522).
 */
export function ensureRuntimeServerSettings(): TuffNexusRuntimeServer {
  if (!appSetting.dev) {
    appSetting.dev = {
      autoCloseDev: true,
      runtimeServer: 'production',
      developerMode: false
    }
  }

  const dev = appSetting.dev as AppSetting['dev'] & TuffNexusRuntimeServerSettings
  const runtimeServer = applyTuffNexusRuntimeServerMigration(dev)
  appSetting.dev = dev
  return runtimeServer
}

export function getRuntimeServerMode(): TuffNexusRuntimeServer {
  return ensureRuntimeServerSettings()
}

export function setRuntimeServerMode(mode: TuffNexusRuntimeServer): void {
  ensureRuntimeServerSettings()
  appSetting.dev.runtimeServer = mode
}

export function getRuntimeNexusBaseUrl(): string {
  return resolveTuffNexusBaseUrl({
    runtimeServer: getRuntimeServerMode()
  })
}

export function getOfficialNexusBaseUrl(): string {
  return NEXUS_BASE_URL
}
