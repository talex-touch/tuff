export interface FileIndexSettings {
  autoScanEnabled: boolean
  autoScanIntervalMs: number
  autoScanIdleThresholdMs: number
  autoScanCheckIntervalMs: number
  extraPaths: string[]
}

export interface ScannedFileInfo {
  path: string
  name: string
  extension: string
  size: number
  ctime: Date
  mtime: Date
}
