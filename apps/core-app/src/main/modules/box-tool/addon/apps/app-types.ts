export interface ScannedAppInfo {
  name: string
  path: string
  icon: string
  bundleId: string
  uniqueId: string
  lastModified: Date
  displayName?: string
  fileName?: string
  description?: string
  launchPath?: string
  shortcutPath?: string
  shortcutArgs?: string
  shortcutCwd?: string
  appUserModelId?: string
  launchKind?: 'path' | 'shortcut' | 'appx' | 'url'
}
