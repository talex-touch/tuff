export type AppLaunchKind = 'path' | 'shortcut' | 'uwp'
export type AppIdentityKind =
  | 'macos-path'
  | 'macos-bundle'
  | 'windows-uwp'
  | 'windows-shortcut'
  | 'windows-path'
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
  bundleId: string
  uniqueId: string
  stableId: string
  launchKind: AppLaunchKind
  launchTarget: string
  launchArgs?: string
  workingDirectory?: string
  displayPath?: string
  lastModified: Date
  displayName?: string
  displayNameSource?: string
  displayNameQuality?: AppDisplayNameQuality
  identityKind?: AppIdentityKind
  fileName?: string
  alternateNames?: string[]
  description?: string
}
