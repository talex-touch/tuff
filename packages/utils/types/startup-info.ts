export interface StartupPaths {
  appDataPath: string
  appPath: string
  configPath: string
  exePath: string
  homePath: string
  modulePath: string
  pluginPath: string
  rootPath: string
  tempPath: string
  userDataPath: string
}

export interface StartupInfo {
  id: number
  version: string
  path: StartupPaths
  isPackaged: boolean
  isDev: boolean
  isRelease: boolean
  platform: string
  arch: string
  platformWarning?: string
  t: {
    _s: number
    s: number
    e: number
    p: number
    h: number[]
  }
  appUpdate?: boolean
}
