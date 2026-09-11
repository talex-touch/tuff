import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import {
  migrateTuffNexusRuntimeServer,
  NEXUS_BASE_URL,
  resolveTuffNexusBaseUrl,
  validateNexusBaseUrl,
  type NexusBaseUrlValidationError,
  type TuffNexusRuntimeServer
} from '@talex-touch/utils/env'
import { toRaw } from 'vue'
import { appSetting, appSettingStore } from '~/modules/storage/app-storage'

type LegacyDevSettings = AppSetting['dev'] & {
  authServer?: TuffNexusRuntimeServer
  runtimeServer?: TuffNexusRuntimeServer
}

export function ensureRuntimeServerSettings(): TuffNexusRuntimeServer {
  if (!appSetting.dev) {
    appSetting.dev = {
      autoCloseDev: true,
      runtimeServer: 'production',
      developerMode: false
    }
  }

  const dev = appSetting.dev as LegacyDevSettings
  const runtimeServer = migrateTuffNexusRuntimeServer(dev)
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

/**
 * The stored user address, or '' when it is unset or no longer valid.
 *
 * An address that stopped validating is not offered to the resolver: it would send signed requests
 * to an origin the settings page itself refuses to accept.
 */
function readUserNexusBaseUrl(): string {
  const stored = appSetting.auth?.nexusBaseUrl
  if (typeof stored !== 'string' || !stored.trim()) {
    return ''
  }
  const validation = validateNexusBaseUrl(stored)
  return validation.ok ? validation.value : ''
}

export function getRuntimeNexusBaseUrl(): string {
  return resolveTuffNexusBaseUrl({
    runtimeServer: getRuntimeServerMode(),
    customBaseUrl: readUserNexusBaseUrl()
  })
}

export function getOfficialNexusBaseUrl(): string {
  return NEXUS_BASE_URL
}

export type NexusBaseUrlSaveError = NexusBaseUrlValidationError | 'save-failed'

export type NexusBaseUrlSaveResult =
  | { ok: true; value: string; changed: boolean }
  | { ok: false; error: NexusBaseUrlSaveError }

async function persistUserNexusBaseUrl(value: string): Promise<boolean> {
  // Mirrors the settings store's own "persist a detached snapshot" flow: the reactive data must not
  // change before the write lands, because the caller drops the account session as soon as it does.
  const auth = { ...appSetting.auth, nexusBaseUrl: value }
  try {
    const result = await appSettingStore.saveDurable({ ...toRaw(appSetting), auth })
    if (!result.success) {
      return false
    }
  } catch {
    // Reported to the user as a save failure; the caller must not treat it as applied.
    return false
  }
  appSetting.auth = auth
  return true
}

/**
 * Stores a user-chosen Nexus base URL.
 *
 * The write is durable rather than the settings store's debounced autosave: the caller signs the
 * account out the moment this resolves, and a debounce would leave a window where main still sends
 * credentialed requests to the previous origin.
 */
export async function setUserNexusBaseUrl(input: string): Promise<NexusBaseUrlSaveResult> {
  const validation = validateNexusBaseUrl(input)
  if (!validation.ok) {
    return { ok: false, error: validation.error }
  }

  const value = validation.value
  if (value === readUserNexusBaseUrl()) {
    return { ok: true, value, changed: false }
  }

  if (!(await persistUserNexusBaseUrl(value))) {
    return { ok: false, error: 'save-failed' }
  }
  return { ok: true, value, changed: true }
}

/**
 * Drops the user-chosen address so the resolver falls back to the runtime server mode.
 *
 * The raw stored value, not the validated one, decides whether there is anything to clear: an
 * address that stopped validating is exactly what a user has to be able to remove.
 */
export async function resetUserNexusBaseUrl(): Promise<NexusBaseUrlSaveResult> {
  if (!appSetting.auth?.nexusBaseUrl) {
    return { ok: true, value: '', changed: false }
  }

  if (!(await persistUserNexusBaseUrl(''))) {
    return { ok: false, error: 'save-failed' }
  }
  return { ok: true, value: '', changed: true }
}
