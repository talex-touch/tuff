export type AppLaunchKind = 'path' | 'shortcut' | 'uwp'

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
  fileName?: string
  alternateNames?: string[]
  description?: string
}
