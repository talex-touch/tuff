import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

const APP_ICON_CACHE_SUBDIR = ['cache', 'app-icons'] as const

function hashCacheKey(cacheKey: string): string {
  return crypto.createHash('sha256').update(cacheKey).digest('hex').slice(0, 32)
}

function resolveBaseCacheDir(): string {
  try {
    const userDataPath = app?.getPath?.('userData')
    if (userDataPath) {
      return path.join(userDataPath, ...APP_ICON_CACHE_SUBDIR)
    }
  } catch {
    // Electron app is unavailable in some unit test environments.
  }

  return path.join(os.tmpdir(), 'talex-touch-test-cache', 'app-icons')
}

export function getAppIconCacheDir(platform = process.platform): string {
  return path.join(resolveBaseCacheDir(), platform)
}

export function getAppIconCachePath(cacheKey: string, platform = process.platform): string {
  return path.join(getAppIconCacheDir(platform), `${hashCacheKey(cacheKey)}.png`)
}

export const __test__ = {
  hashCacheKey
}
