import process from 'node:process'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'

export const SILENT_LAUNCH_ARG = '--silent'
export const HIDDEN_LAUNCH_ARG = '--hidden'

export interface SilentLaunchSettings {
  beginner?: {
    init?: boolean
  }
  window?: {
    startSilent?: boolean
  }
}

export interface SilentLaunchIntent {
  silent: boolean
  source: 'setting' | 'argv' | 'login-item' | 'secondary-data' | 'none'
}

interface SilentLaunchAppLike {
  getLoginItemSettings?: () => { wasOpenedAsHidden?: boolean }
}

export function argvHasSilentLaunchFlag(argv: readonly string[] = process.argv): boolean {
  return argv.includes(SILENT_LAUNCH_ARG) || argv.includes(HIDDEN_LAUNCH_ARG)
}

export function dataHasSilentLaunchFlag(data?: Record<string, unknown> | null): boolean {
  return data?.silent === true || data?.hidden === true || data?.startSilent === true
}

export function isConfigSilentLaunchEnabled(settings?: SilentLaunchSettings | null): boolean {
  if (!settings) return false

  const storedStartSilent = settings.window?.startSilent
  const startSilent =
    typeof storedStartSilent === 'boolean'
      ? storedStartSilent
      : appSettingOriginData.window.startSilent

  return settings.beginner?.init === true && startSilent
}

export function resolveSilentLaunchIntent(options: {
  app?: SilentLaunchAppLike
  argv?: readonly string[]
  data?: Record<string, unknown> | null
  settings?: SilentLaunchSettings | null
}): SilentLaunchIntent {
  if (dataHasSilentLaunchFlag(options.data)) {
    return { silent: true, source: 'secondary-data' }
  }

  if (argvHasSilentLaunchFlag(options.argv)) {
    return { silent: true, source: 'argv' }
  }

  try {
    if (options.app?.getLoginItemSettings?.().wasOpenedAsHidden === true) {
      return { silent: true, source: 'login-item' }
    }
  } catch {
    // Electron may throw in unsupported environments; keep falling back to settings.
  }

  if (isConfigSilentLaunchEnabled(options.settings)) {
    return { silent: true, source: 'setting' }
  }

  return { silent: false, source: 'none' }
}
