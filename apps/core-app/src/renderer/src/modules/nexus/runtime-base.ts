import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import {
  NEXUS_BASE_URL,
  type TuffNexusRuntimeServer,
  resolveTuffNexusBaseUrl
} from '@talex-touch/utils/env'
import { appSetting } from '~/modules/storage/app-storage'

type LegacyDevSettings = AppSetting['dev'] & {
  authServer?: TuffNexusRuntimeServer
  runtimeServer?: TuffNexusRuntimeServer
}

function normalizeRuntimeServer(value: unknown): TuffNexusRuntimeServer {
  return value === 'local' ? 'local' : 'production'
}

export function ensureRuntimeServerSettings(): TuffNexusRuntimeServer {
  if (!appSetting.dev) {
    appSetting.dev = {
      autoCloseDev: true,
      runtimeServer: 'production',
      developerMode: false,
      advancedSettings: false
    }
  }

  const dev = appSetting.dev as LegacyDevSettings
  const current = dev.runtimeServer
  const next = current ?? dev.authServer ?? 'production'
  dev.runtimeServer = normalizeRuntimeServer(next)
  delete dev.authServer
  appSetting.dev = dev
  return dev.runtimeServer
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
