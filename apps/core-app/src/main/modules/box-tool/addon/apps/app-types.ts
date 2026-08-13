export type AppLaunchKind = 'path' | 'shortcut' | 'uwp' | 'protocol'
export type AppIdentityKind =
  | 'macos-path'
  | 'macos-bundle'
  | 'windows-uwp'
  | 'windows-shortcut'
  | 'windows-path'
  | 'windows-protocol'
  | 'linux-desktop'
  | 'fallback'
export type AppDisplayNameQuality =
  | 'localized'
  | 'system'
  | 'manifest'
  | 'registry'
  | 'filename'
  | 'fallback'

export interface ScannedAppInfo {
  name: string
  path: string
  icon: string
  iconSourcePath?: string
  bundleId: string
  uniqueId: string
  stableId: string
  launchKind: AppLaunchKind
  launchTarget: string
  launchArgs?: string
  workingDirectory?: string
  displayPath?: string
  lastModified: Date
  /**
   * Filesystem birth time of the app on this machine, when the platform reports a usable one.
   * Feeds the `installedAt` index extension, which is written once and never refreshed — an app
   * that rebuilds its bundle on self-update would otherwise look freshly installed.
   */
  createdAt?: Date
  displayName?: string
  displayNameSource?: string
  displayNameQuality?: AppDisplayNameQuality
  identityKind?: AppIdentityKind
  fileName?: string
  alternateNames?: string[]
  description?: string
}

/** Clock skew tolerance for a reported birth time before it is treated as unusable. */
const SCANNED_APP_CREATED_AT_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000

/**
 * Normalizes a stat birth time into `ScannedAppInfo.createdAt`.
 *
 * Filesystems that cannot report one hand back the epoch (or, on some Linux setups, a date derived
 * from a clock that has since been corrected), so anything at or before the epoch and anything
 * implausibly far in the future is dropped rather than persisted as an install time.
 */
export function resolveScannedAppCreatedAt(stats: { birthtime?: Date | null }): Date | undefined {
  const birthtime = stats.birthtime
  if (!birthtime) return undefined

  const birthtimeMs = birthtime.getTime()
  if (!Number.isFinite(birthtimeMs) || birthtimeMs <= 0) return undefined
  if (birthtimeMs > Date.now() + SCANNED_APP_CREATED_AT_FUTURE_TOLERANCE_MS) return undefined

  return birthtime
}
