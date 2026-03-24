import path from 'node:path'
import process from 'node:process'

export function getWatchDepthForPath(watchPath: string): number {
  const lower = watchPath.toLowerCase()
  if (process.platform === 'darwin') {
    if (lower.endsWith('/applications') || lower.endsWith('/downloads')) {
      return 1
    }
    return 2
  }
  if (process.platform === 'win32') {
    return 4
  }
  return 3
}

export function normalizeWatchPath(rawPath: string, isCaseInsensitiveFs: boolean): string {
  const normalized = path.normalize(rawPath)
  return isCaseInsensitiveFs ? normalized.toLowerCase() : normalized
}
