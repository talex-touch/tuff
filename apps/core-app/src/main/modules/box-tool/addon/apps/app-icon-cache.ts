import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

const APP_ICON_CACHE_SUBDIR = ['cache', 'app-icons'] as const
const APP_ICON_CACHE_DIRNAME = ['Cache', 'app-icons'] as const

function hashCacheKey(cacheKey: string): string {
  return crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 32)
}

function resolveBaseCacheDirs(): string[] {
  const dirs: string[] = []

  try {
    const cachePath = app?.getPath?.('cache')
    if (cachePath) {
      dirs.push(path.join(cachePath, 'app-icons'))
    }

    const userDataPath = app?.getPath?.('userData')
    if (userDataPath) {
      dirs.push(path.join(userDataPath, ...APP_ICON_CACHE_SUBDIR))
      dirs.push(path.join(userDataPath, '..', ...APP_ICON_CACHE_DIRNAME))
      dirs.push(path.join(userDataPath, '..', 'core-app', ...APP_ICON_CACHE_DIRNAME))
    }
  } catch {
    // Electron app is unavailable in some unit test environments.
  }

  dirs.push(path.join(os.tmpdir(), 'talex-touch-test-cache', 'app-icons'))

  return [...new Set(dirs)]
}

function resolveBaseCacheDir(): string {
  return resolveBaseCacheDirs()[0]
}

export function getAppIconCacheDir(platform = process.platform): string {
  return path.join(resolveBaseCacheDir(), platform)
}

export function getAppIconCacheDirs(platform = process.platform): string[] {
  return resolveBaseCacheDirs().map((dir) => path.join(dir, platform))
}

export function getAppIconCachePath(cacheKey: string, platform = process.platform): string {
  return path.join(getAppIconCacheDir(platform), `${hashCacheKey(cacheKey)}.png`)
}

export const __test__ = {
  hashCacheKey
}
