import process from 'node:process'
import {
  getIndexedWatchDepthForPath,
  normalizeIndexedWatchPath,
  type IndexedWatchPathPlatform
} from '@talex-touch/utils/search'

export function getWatchDepthForPath(watchPath: string): number {
  return getIndexedWatchDepthForPath({
    platform: resolveIndexedWatchPathPlatform(process.platform),
    watchPath
  })
}

export function normalizeWatchPath(rawPath: string, isCaseInsensitiveFs: boolean): string {
  return normalizeIndexedWatchPath(rawPath, isCaseInsensitiveFs)
}

function resolveIndexedWatchPathPlatform(platform: NodeJS.Platform): IndexedWatchPathPlatform {
  return platform === 'darwin' || platform === 'win32' || platform === 'linux' ? platform : 'linux'
}
