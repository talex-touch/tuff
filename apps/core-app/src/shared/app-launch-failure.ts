/**
 * The failures an app launch reports, and how they read.
 *
 * The launch adapter reports a failure it detects itself as one of these codes, and a failure the
 * system reports - a path the OS would not open, a protocol handler that refused - as the system's
 * own text. Main's launch notification and the app index page both word a failure from here, so
 * they say the same thing.
 */

type AppLaunchFailureTranslate = (key: string, params?: Record<string, string | number>) => string

export const AppLaunchFailureCode = {
  ProtocolNotAllowed: 'APP_LAUNCH_PROTOCOL_NOT_ALLOWED',
  UwpUnsupported: 'APP_LAUNCH_UWP_UNSUPPORTED',
  PlatformUnsupported: 'APP_LAUNCH_PLATFORM_UNSUPPORTED',
  ShortcutFailed: 'APP_LAUNCH_SHORTCUT_FAILED',
  CommandInvalid: 'APP_LAUNCH_COMMAND_INVALID'
} as const

// A process that quit before the launch was handed over, with its exit code or the signal that
// stopped it; and one the system could not start, with the system's error code (ENOENT, EACCES).
const EXIT_CODE_PREFIX = 'APP_LAUNCH_EXIT_CODE_'
const EXIT_SIGNAL_PREFIX = 'APP_LAUNCH_EXIT_SIGNAL_'
const SPAWN_PREFIX = 'APP_LAUNCH_SPAWN_'

const FAILURE_KEYS: Record<string, string> = {
  [AppLaunchFailureCode.ProtocolNotAllowed]: 'protocolNotAllowed',
  [AppLaunchFailureCode.UwpUnsupported]: 'uwpUnsupported',
  [AppLaunchFailureCode.PlatformUnsupported]: 'platformUnsupported',
  [AppLaunchFailureCode.ShortcutFailed]: 'shortcutFailed',
  [AppLaunchFailureCode.CommandInvalid]: 'commandInvalid'
}

export function appLaunchExitCodeFailure(code: number | string): string {
  return `${EXIT_CODE_PREFIX}${code}`
}

export function appLaunchExitSignalFailure(signal: string): string {
  return `${EXIT_SIGNAL_PREFIX}${signal}`
}

export function appLaunchSpawnFailure(code: string): string {
  return `${SPAWN_PREFIX}${code}`
}

/** A launch failure in the interface language; the system's own text is returned as it is. */
export function describeAppLaunchFailure(
  error: string | null | undefined,
  t: AppLaunchFailureTranslate
): string {
  const normalized = error?.trim() ?? ''

  const key = FAILURE_KEYS[normalized]
  if (key) return t(`notifications.appLaunchFailure.${key}`)

  if (normalized.startsWith(EXIT_CODE_PREFIX)) {
    return t('notifications.appLaunchFailure.exitedWithCode', {
      code: normalized.slice(EXIT_CODE_PREFIX.length)
    })
  }

  if (normalized.startsWith(EXIT_SIGNAL_PREFIX)) {
    return t('notifications.appLaunchFailure.exitedWithSignal', {
      signal: normalized.slice(EXIT_SIGNAL_PREFIX.length)
    })
  }

  if (normalized.startsWith(SPAWN_PREFIX)) {
    const code = normalized.slice(SPAWN_PREFIX.length)
    if (code === 'ENOENT') return t('notifications.appLaunchFailure.fileNotFound')
    if (code === 'EACCES' || code === 'EPERM') {
      return t('notifications.appLaunchFailure.notPermitted')
    }
    return t('notifications.appLaunchFailure.startFailed', { code })
  }

  return normalized
}
