import { existsSync } from 'node:fs'
import { getLogger } from '@talex-touch/utils/common/logger'
import { appTaskGate } from '../../../../service/app-task-gate'
import { iconService } from '../../../../service/icon-service'

const fileProviderLog = getLogger('file-provider')
const EVERYTHING_ICON_CACHE_LIMIT = 256
const EVERYTHING_ICON_INFLIGHT_LIMIT = 64

export interface FileIconSourceVersion {
  mtimeMs: number
  size: number | null
}

interface CachedFileIcon {
  path: string
  source?: FileIconSourceVersion
}

export class EverythingIconCache {
  private readonly iconCache = new Map<string, CachedFileIcon>()
  private readonly iconExtractions = new Map<string, Promise<string | null>>()
  private generation = 0

  get(filePath: string, source?: FileIconSourceVersion): string | null {
    const cached = this.iconCache.get(filePath)
    if (!cached) return null
    if (
      !existsSync(cached.path) ||
      (source && (cached.source?.mtimeMs !== source.mtimeMs || cached.source?.size !== source.size))
    ) {
      this.iconCache.delete(filePath)
      return null
    }
    this.iconCache.delete(filePath)
    this.iconCache.set(filePath, cached)
    return cached.path
  }

  delete(filePath: string): void {
    this.iconCache.delete(filePath)
  }

  clear(): void {
    this.generation += 1
    this.iconCache.clear()
    this.iconExtractions.clear()
  }

  ensure(filePath: string, source?: FileIconSourceVersion): Promise<string | null> {
    const cached = this.get(filePath, source)
    if (cached) return Promise.resolve(cached)
    const pending = this.iconExtractions.get(filePath)
    if (pending) return pending
    if (this.iconExtractions.size >= EVERYTHING_ICON_INFLIGHT_LIMIT) return Promise.resolve(null)

    const generation = this.generation
    const version = source ? { mtimeMs: source.mtimeMs, size: source.size } : undefined
    const task = (async () => {
      await appTaskGate.waitForIdle()
      if (generation !== this.generation) return null
      const iconPath = await iconService.getFileIconPath(filePath)
      if (iconPath && generation === this.generation) {
        this.iconCache.delete(filePath)
        this.iconCache.set(filePath, { path: iconPath, source: version })
        while (this.iconCache.size > EVERYTHING_ICON_CACHE_LIMIT) {
          const oldestKey = this.iconCache.keys().next().value
          if (oldestKey === undefined) break
          this.iconCache.delete(oldestKey)
        }
      }
      return generation === this.generation ? iconPath : null
    })()
      .catch((error) => {
        fileProviderLog.warn('[Everything] Failed to warm icon for search result', { error })
        return null
      })
      .finally(() => {
        if (this.iconExtractions.get(filePath) === task) this.iconExtractions.delete(filePath)
      })
    this.iconExtractions.set(filePath, task)
    return task
  }
}
