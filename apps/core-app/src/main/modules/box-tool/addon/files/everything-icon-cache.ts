import { Buffer } from 'node:buffer'
import { getLogger } from '@talex-touch/utils/common/logger'
import { appTaskGate } from '../../../../service/app-task-gate'
import { IconWorkerClient } from './workers/icon-worker-client'

const fileProviderLog = getLogger('file-provider')
const EVERYTHING_ICON_CACHE_LIMIT = 256

export class EverythingIconCache {
  private readonly iconWorker = new IconWorkerClient()
  private readonly iconCache = new Map<string, string>()
  private readonly iconExtractions = new Map<string, Promise<string | null>>()

  get(filePath: string): string | null {
    const cached = this.iconCache.get(filePath)
    if (!cached) {
      return null
    }

    this.iconCache.delete(filePath)
    this.iconCache.set(filePath, cached)
    return cached
  }

  delete(filePath: string): void {
    this.iconCache.delete(filePath)
  }

  clear(): void {
    this.iconCache.clear()
    this.iconExtractions.clear()
  }

  async ensure(filePath: string): Promise<string | null> {
    const cached = this.get(filePath)
    if (cached) {
      return cached
    }

    const pending = this.iconExtractions.get(filePath)
    if (pending) {
      return pending
    }

    const task = this.extract(filePath)
      .then((iconValue) => {
        if (iconValue) {
          this.set(filePath, iconValue)
        }
        return iconValue
      })
      .catch((error) => {
        fileProviderLog.warn('[Everything] Failed to warm icon for Everything result', {
          path: filePath,
          error
        })
        return null
      })
      .finally(() => {
        this.iconExtractions.delete(filePath)
      })

    this.iconExtractions.set(filePath, task)
    return task
  }

  private set(filePath: string, iconValue: string): void {
    if (this.iconCache.has(filePath)) {
      this.iconCache.delete(filePath)
    }

    this.iconCache.set(filePath, iconValue)

    while (this.iconCache.size > EVERYTHING_ICON_CACHE_LIMIT) {
      const oldestKey = this.iconCache.keys().next().value
      if (!oldestKey) {
        break
      }
      this.iconCache.delete(oldestKey)
    }
  }

  private async extract(filePath: string): Promise<string | null> {
    await appTaskGate.waitForIdle()

    const icon = await this.iconWorker.extract(filePath)
    if (!icon || icon.length === 0) {
      return null
    }

    return `data:image/png;base64,${Buffer.from(icon).toString('base64')}`
  }
}
