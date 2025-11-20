/**
 * Shared startup metadata contract consumed by both preload and renderer.
 */
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

/**
 * Main-process information captured during renderer bootstrap.
 */
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
    /** Process creation time from Electron. */
    _s: number
    /** Renderer process start time. */
    s: number
    /** Timestamp when the main process acknowledged startup. */
    e: number
    /** Process uptime in seconds. */
    p: number
    /** High-resolution process time. */
    h: number[]
  }
  appUpdate?: boolean
}
