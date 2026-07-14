import { Buffer } from 'node:buffer'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core/alias'
import type { DbUtils } from '../../../../../db/utils'
import { fileExtensions, files as filesSchema } from '../../../../../db/schema'
import {
  THUMBNAIL_EXTENSIONS,
  getThumbnailUnsupportedReason,
  isThumbnailCandidate
} from '../thumbnail-config'
import type { IconWorkerClient } from '../workers/icon-worker-client'
import type {
  ThumbnailWorkerClient,
  ThumbnailGenerationResult
} from '../workers/thumbnail-worker-client'
import {
  FILE_ICON_META_EXTENSION_KEY,
  persistFileIconCache,
  type FileIconCacheMeta
} from './file-provider-icon-cache-service'

const THUMBNAIL_STATUS_KEY = 'thumbnailStatus'

interface IconCacheEntry {
  icon?: string | null
  meta?: FileIconCacheMeta
}

interface ThumbnailStatusPayload {
  status: 'failed' | 'unsupported'
  reason: string
  mtime: number | null
  size: number | null
  at: number
}

type FileRecord = typeof filesSchema.$inferSelect
type ThumbnailFileSnapshot = Pick<FileRecord, 'mtime' | 'size'>

type LogMeta = Record<string, unknown>

export interface FileProviderAssetServiceDeps {
  iconWorker: Pick<IconWorkerClient, 'extract' | 'getStatus'>
  thumbnailWorker: Pick<ThumbnailWorkerClient, 'generate' | 'getStatus'>
  getDbUtils: () => DbUtils | null
  withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  waitForWriteCapacity: (maxQueued: number, label: string) => Promise<boolean>
  waitForIdle: () => Promise<void>
  yieldToEventLoop: () => Promise<void>
  toTimestamp: (value: Date | number | string | null | undefined) => number | null
  isValidBase64DataUrl: (value: string) => boolean
  logDebug: (message: string, meta?: LogMeta) => void
  logWarn: (message: string, error?: unknown, meta?: LogMeta) => void
  now?: () => number
  enableIconExtraction: boolean
  iconWriteMaxQueue: number
}
export class FileProviderAssetService {
  private readonly iconExtractionPending = new Map<string, Promise<Buffer | null>>()
  private readonly pendingIconExtractions = new Set<number>()
  private readonly pendingThumbnailExtractions = new Set<number>()
  private thumbnailTaskRunning = false
  private readonly now: () => number

  constructor(private readonly deps: FileProviderAssetServiceDeps) {
    this.now = deps.now ?? Date.now
  }

  getWorkerStatuses() {
    return [this.deps.iconWorker.getStatus(), this.deps.thumbnailWorker.getStatus()] as const
  }

  extractIconQueued(filePath: string): Promise<Buffer | null> {
    const existing = this.iconExtractionPending.get(filePath)
    if (existing) return existing

    const task = (async () => {
      await this.deps.waitForIdle()
      try {
        return await this.deps.iconWorker.extract(filePath)
      } catch (error) {
        this.deps.logWarn('Icon worker extraction failed; skipping icon', error, { path: filePath })
        return null
      }
    })()

    this.iconExtractionPending.set(filePath, task)
    task.finally(() => this.iconExtractionPending.delete(filePath))
    return task
  }

  async ensureIcon(fileId: number, filePath: string, file?: FileRecord): Promise<void> {
    if (this.pendingIconExtractions.has(fileId)) return

    this.pendingIconExtractions.add(fileId)
    try {
      if (
        !(await this.deps.waitForWriteCapacity(this.deps.iconWriteMaxQueue, 'file-icon.persist'))
      ) {
        return
      }

      const icon = await this.extractIconQueued(filePath)
      if (!icon || icon.length === 0) return

      const iconBuffer = Buffer.isBuffer(icon) ? icon : Buffer.from(icon)
      const iconValue = `data:image/png;base64,${iconBuffer.toString('base64')}`
      if (!this.deps.isValidBase64DataUrl(iconValue)) {
        this.deps.logWarn('Invalid base64 icon generated, skipping persist', undefined, {
          fileId,
          path: filePath
        })
        return
      }

      const dbUtils = this.deps.getDbUtils()
      if (!dbUtils) return

      await persistFileIconCache(
        { dbUtils, withDbWrite: this.deps.withDbWrite },
        fileId,
        iconValue,
        {
          mtime: file ? this.deps.toTimestamp(file.mtime) : this.now(),
          size: file && typeof file.size === 'number' ? file.size : null
        }
      )
    } catch (error) {
      this.deps.logWarn('Failed to extract icon', error, { path: filePath })
    } finally {
      this.pendingIconExtractions.delete(fileId)
    }
  }

  async ensureThumbnail(
    fileId: number,
    filePath: string,
    file?: FileRecord,
    extensions?: Record<string, string>
  ): Promise<void> {
    if (this.pendingThumbnailExtractions.has(fileId)) return
    if (file && this.shouldSkipThumbnailGeneration(file, extensions)) return

    if (file && !isThumbnailCandidate(file.extension, file.size)) {
      const reason = getThumbnailUnsupportedReason(file.extension, file.size)
      if (reason) {
        await this.persistThumbnailStatus(fileId, file, {
          status: 'unsupported',
          reason,
          durationMs: 0
        })
      }
      return
    }

    this.pendingThumbnailExtractions.add(fileId)
    try {
      const thumbnail = await this.deps.thumbnailWorker.generate(filePath, {
        extension: file?.extension,
        sizeBytes: file?.size
      })
      if (thumbnail.status === 'generated') {
        await this.persistGeneratedThumbnail(fileId, thumbnail.path, 'thumbnail.worker')
        return
      }
      await this.persistThumbnailStatus(fileId, file, thumbnail)
      this.deps.logDebug('Thumbnail generation skipped', {
        path: filePath,
        status: thumbnail.status,
        reason: thumbnail.reason
      })
    } catch (error) {
      this.deps.logWarn('Failed to generate thumbnail', error, { path: filePath })
    } finally {
      this.pendingThumbnailExtractions.delete(fileId)
    }
  }

  async generateMissingThumbnails(): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (this.thumbnailTaskRunning || !dbUtils) return
    this.thumbnailTaskRunning = true

    try {
      const thumbnailExtension = alias(fileExtensions, 'thumbnail_extension')
      const thumbnailStatusExtension = alias(fileExtensions, 'thumbnail_status_extension')
      const candidates = await dbUtils
        .getDb()
        .select({
          id: filesSchema.id,
          path: filesSchema.path,
          extension: filesSchema.extension,
          size: filesSchema.size,
          mtime: filesSchema.mtime,
          statusValue: thumbnailStatusExtension.value
        })
        .from(filesSchema)
        .leftJoin(
          thumbnailExtension,
          and(
            eq(thumbnailExtension.fileId, filesSchema.id),
            eq(thumbnailExtension.key, 'thumbnail')
          )
        )
        .leftJoin(
          thumbnailStatusExtension,
          and(
            eq(thumbnailStatusExtension.fileId, filesSchema.id),
            eq(thumbnailStatusExtension.key, THUMBNAIL_STATUS_KEY)
          )
        )
        .where(
          and(
            isNull(thumbnailExtension.value),
            inArray(
              filesSchema.extension,
              [...THUMBNAIL_EXTENSIONS].map((extension) => `.${extension}`)
            )
          )
        )
        .limit(1000)

      if (candidates.length === 0) return
      this.deps.logDebug('Starting deferred thumbnail generation', { count: candidates.length })

      let generated = 0
      let skipped = 0
      for (const file of candidates) {
        if (!this.thumbnailTaskRunning) break
        if (
          this.shouldSkipThumbnailGeneration(file, {
            [THUMBNAIL_STATUS_KEY]: file.statusValue ?? ''
          })
        ) {
          skipped++
          continue
        }
        if (!isThumbnailCandidate(file.extension, file.size)) {
          const reason = getThumbnailUnsupportedReason(file.extension, file.size)
          if (typeof file.id === 'number' && reason) {
            await this.persistThumbnailStatus(file.id, file, {
              status: 'unsupported',
              reason,
              durationMs: 0
            })
          }
          skipped++
          continue
        }

        await this.deps.yieldToEventLoop()
        await this.deps.waitForIdle()
        try {
          const thumbnail = await this.deps.thumbnailWorker.generate(file.path, {
            extension: file.extension,
            sizeBytes: file.size
          })
          if (typeof file.id !== 'number') continue
          if (thumbnail.status === 'generated') {
            await this.persistGeneratedThumbnail(file.id, thumbnail.path, 'thumbnail.deferred')
            generated++
          } else {
            await this.persistThumbnailStatus(file.id, file, thumbnail)
            skipped++
          }
        } catch (error) {
          this.deps.logWarn('Thumbnail worker failed', error, { path: file.path })
        }
      }

      this.deps.logDebug('Deferred thumbnail generation completed', {
        generated,
        skipped,
        total: candidates.length
      })
    } catch (error) {
      this.deps.logWarn('Deferred thumbnail generation failed', error)
    } finally {
      this.thumbnailTaskRunning = false
    }
  }

  async buildIconCache(files: FileRecord[]): Promise<Map<number, IconCacheEntry>> {
    const cache = new Map<number, IconCacheEntry>()
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return cache

    const fileIds = files
      .map((file) => file.id)
      .filter((id): id is number => typeof id === 'number')
    if (fileIds.length === 0) return cache

    const rows = await dbUtils.getFileExtensionsByFileIds(fileIds, [
      'icon',
      FILE_ICON_META_EXTENSION_KEY
    ])
    const invalidIconFileIds: number[] = []
    for (const row of rows) {
      const entry = cache.get(row.fileId) ?? {}
      if (row.key === 'icon') {
        if (row.value && !this.deps.isValidBase64DataUrl(row.value)) {
          invalidIconFileIds.push(row.fileId)
        } else {
          entry.icon = row.value
        }
      } else if (row.key === FILE_ICON_META_EXTENSION_KEY && row.value) {
        try {
          const parsed = JSON.parse(row.value) as FileIconCacheMeta
          entry.meta = {
            mtime: typeof parsed.mtime === 'number' ? parsed.mtime : null,
            size: typeof parsed.size === 'number' ? parsed.size : null
          }
        } catch {
          entry.meta = undefined
        }
      }
      cache.set(row.fileId, entry)
    }

    if (invalidIconFileIds.length > 0) {
      this.deps.logWarn('Invalid icon cache detected, will re-extract', undefined, {
        count: invalidIconFileIds.length,
        sample: invalidIconFileIds.slice(0, 3)
      })
    }
    return cache
  }

  needsIconExtraction(file: FileRecord, cached?: IconCacheEntry): boolean {
    if (!this.deps.enableIconExtraction || !cached?.icon || !cached.meta) return true
    const cachedMtime = typeof cached.meta.mtime === 'number' ? cached.meta.mtime : null
    if (cachedMtime !== this.deps.toTimestamp(file.mtime)) return true
    const cachedSize = typeof cached.meta.size === 'number' ? cached.meta.size : null
    return cachedSize !== (typeof file.size === 'number' ? file.size : null)
  }

  private shouldSkipThumbnailGeneration(
    file: ThumbnailFileSnapshot,
    extensions?: Record<string, string>
  ): boolean {
    const status = this.parseThumbnailStatus(extensions?.[THUMBNAIL_STATUS_KEY])
    if (!status) return false
    return (
      status.mtime === this.deps.toTimestamp(file.mtime) &&
      status.size === (typeof file.size === 'number' ? file.size : null)
    )
  }

  private parseThumbnailStatus(value: string | undefined): ThumbnailStatusPayload | null {
    if (!value) return null
    try {
      const parsed = JSON.parse(value) as Partial<ThumbnailStatusPayload>
      if (
        (parsed.status !== 'failed' && parsed.status !== 'unsupported') ||
        typeof parsed.reason !== 'string'
      ) {
        return null
      }
      return {
        status: parsed.status,
        reason: parsed.reason,
        mtime: typeof parsed.mtime === 'number' ? parsed.mtime : null,
        size: typeof parsed.size === 'number' ? parsed.size : null,
        at: typeof parsed.at === 'number' ? parsed.at : 0
      }
    } catch {
      return null
    }
  }

  private async persistGeneratedThumbnail(
    fileId: number,
    thumbnailPath: string,
    label: string
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    await this.deps.withDbWrite(label, () =>
      dbUtils.addFileExtensions([
        { fileId, key: 'thumbnail', value: thumbnailPath },
        {
          fileId,
          key: THUMBNAIL_STATUS_KEY,
          value: JSON.stringify({ status: 'generated', at: this.now() })
        }
      ])
    )
  }

  private async persistThumbnailStatus(
    fileId: number,
    file: ThumbnailFileSnapshot | undefined,
    result: Extract<ThumbnailGenerationResult, { status: 'failed' | 'unsupported' }>
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    await this.deps.withDbWrite('thumbnail.status', () =>
      dbUtils.addFileExtensions([
        {
          fileId,
          key: THUMBNAIL_STATUS_KEY,
          value: JSON.stringify({
            status: result.status,
            reason: result.reason,
            mtime: file ? this.deps.toTimestamp(file.mtime) : null,
            size: file && typeof file.size === 'number' ? file.size : null,
            at: this.now()
          })
        }
      ])
    )
  }
}
