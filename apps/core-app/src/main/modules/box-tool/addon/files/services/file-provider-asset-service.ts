import fs from 'node:fs/promises'
import path from 'node:path'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core/alias'
import type { DbUtils } from '../../../../../db/utils'
import { fileExtensions, files as filesSchema } from '../../../../../db/schema'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import {
  THUMBNAIL_EXTENSIONS,
  getThumbnailUnsupportedReason,
  isThumbnailCandidate
} from '../thumbnail-config'
import type { IconService } from '../../../../../service/icon-service'
import type {
  ThumbnailWorkerClient,
  ThumbnailGenerationResult
} from '../workers/thumbnail-worker-client'
import { persistFileIconCache } from './file-provider-icon-cache-service'
import { FileProviderIconMigrationService } from './file-provider-icon-migration-service'

const THUMBNAIL_STATUS_KEY = 'thumbnailStatus'

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
  iconService: Pick<
    IconService,
    'getFileIconPath' | 'getFileIconWorkerStatus' | 'getFileIconCacheDirectory'
  >
  thumbnailWorker: Pick<ThumbnailWorkerClient, 'generate' | 'getStatus'>
  getDbUtils: () => DbUtils | null
  withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  waitForWriteCapacity: (maxQueued: number, label: string) => Promise<boolean>
  waitForIdle: () => Promise<void>
  yieldToEventLoop: () => Promise<void>
  toTimestamp: (value: Date | number | string | null | undefined) => number | null
  logDebug: (message: string, meta?: LogMeta) => void
  logWarn: (message: string, error?: unknown, meta?: LogMeta) => void
  now?: () => number
  enableIconExtraction: boolean
  iconWriteMaxQueue: number
}

/** Bound this provider's optional extraction and persistence ownership. */
const MAX_PENDING_ICON_EXTRACTIONS = 64
const ICON_SHED_LOG_THROTTLE_MS = 30_000

export class FileProviderAssetService {
  private readonly pendingIconExtractions = new Set<number>()
  private readonly pendingThumbnailExtractions = new Set<number>()
  private thumbnailTaskRunning = false
  private shedIconExtractions = 0
  private lastIconShedLogAt = 0
  private readonly now: () => number
  private closed = false
  private readonly ownedWrites = new Set<Promise<unknown>>()
  private readonly iconMigration: FileProviderIconMigrationService
  private iconMigrationScheduled = false
  private iconMigrationTimer: NodeJS.Timeout | null = null

  constructor(private readonly deps: FileProviderAssetServiceDeps) {
    this.now = deps.now ?? Date.now
    this.iconMigration = new FileProviderIconMigrationService({
      getDbUtils: deps.getDbUtils,
      getCacheDirectory: () => deps.iconService.getFileIconCacheDirectory(),
      withDbWrite: async (label, operation) =>
        (await this.trackWrite(() => deps.withDbWrite(label, operation))) ?? false,
      isStopping: () => this.closed,
      waitForIdle: deps.waitForIdle,
      yieldToEventLoop: deps.yieldToEventLoop,
      logInfo: deps.logDebug,
      logWarn: deps.logWarn
    })
  }

  getWorkerStatuses() {
    return [
      this.deps.iconService.getFileIconWorkerStatus(),
      this.deps.thumbnailWorker.getStatus()
    ] as const
  }

  /**
   * Resolves only an indexed live ordinary file for a renderer preview grant.
   * The database row is authoritative; the final stat closes the stale-path
   * window before the protocol layer receives the resource path.
   */
  async resolvePreviewResourcePath(rawPath: string): Promise<string | null> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || typeof rawPath !== 'string') return null

    const candidate = normalizeFsPath(rawPath.trim())
    if (!candidate || !path.isAbsolute(candidate)) return null

    const indexed = await dbUtils
      .getFileIndexReadDb()
      .select({ path: filesSchema.path, type: filesSchema.type })
      .from(filesSchema)
      .where(eq(filesSchema.path, candidate))
      .limit(1)
      .then((rows) => rows[0])
    if (!indexed || indexed.type !== 'file') return null

    try {
      const realPath = normalizeFsPath(await fs.realpath(indexed.path))
      const canonical = await dbUtils
        .getFileIndexReadDb()
        .select({ type: filesSchema.type })
        .from(filesSchema)
        .where(eq(filesSchema.path, realPath))
        .limit(1)
        .then((rows) => rows[0])
      return canonical?.type === 'file' && (await fs.stat(realPath)).isFile() ? realPath : null
    } catch {
      return null
    }
  }

  async ensureIcon(fileId: number, filePath: string, file?: FileRecord): Promise<void> {
    if (this.closed || !this.deps.enableIconExtraction || this.pendingIconExtractions.has(fileId))
      return
    if (this.pendingIconExtractions.size >= MAX_PENDING_ICON_EXTRACTIONS) {
      this.shedIconExtractions += 1
      const now = this.now()
      if (now - this.lastIconShedLogAt >= ICON_SHED_LOG_THROTTLE_MS) {
        this.lastIconShedLogAt = now
        this.deps.logWarn(
          `Deferring icon extraction: ${this.pendingIconExtractions.size} already in flight`,
          undefined,
          { shedTotal: this.shedIconExtractions, maxInFlight: MAX_PENDING_ICON_EXTRACTIONS }
        )
      }
      return
    }

    this.pendingIconExtractions.add(fileId)
    try {
      if (
        !(await this.deps.waitForWriteCapacity(this.deps.iconWriteMaxQueue, 'file-icon.persist'))
      ) {
        return
      }

      await this.deps.waitForIdle()
      if (this.closed) return
      const iconPath = await this.deps.iconService.getFileIconPath(filePath)
      if (!iconPath || this.closed) return

      const dbUtils = this.deps.getDbUtils()
      if (!dbUtils) return

      await this.trackWrite(() =>
        persistFileIconCache({ dbUtils, withDbWrite: this.deps.withDbWrite }, fileId, iconPath, {
          mtime: file ? this.deps.toTimestamp(file.mtime) : this.now(),
          size: file && typeof file.size === 'number' ? file.size : null
        })
      )
    } catch (error) {
      this.deps.logWarn('Failed to extract icon', error, { path: filePath })
    } finally {
      this.pendingIconExtractions.delete(fileId)
    }
  }

  scheduleLegacyIconMigration(delayMs: number): void {
    if (this.closed || this.iconMigrationScheduled) return
    this.iconMigrationScheduled = true
    this.iconMigrationTimer = setTimeout(() => {
      this.iconMigrationTimer = null
      if (this.closed) return
      void this.iconMigration.run().catch(() => {
        this.deps.logWarn('File icon migration paused; remaining values retry on next startup')
      })
    }, delayMs)
    this.iconMigrationTimer.unref?.()
  }

  async close(): Promise<void> {
    this.closed = true
    if (this.iconMigrationTimer) {
      clearTimeout(this.iconMigrationTimer)
      this.iconMigrationTimer = null
    }
    this.thumbnailTaskRunning = false
    await Promise.allSettled([...this.ownedWrites])
  }

  private async trackWrite<T>(operation: () => Promise<T>): Promise<T | undefined> {
    if (this.closed) return
    const write = operation()
    this.ownedWrites.add(write)
    try {
      return await write
    } finally {
      this.ownedWrites.delete(write)
    }
  }

  async ensureThumbnail(
    fileId: number,
    filePath: string,
    file?: FileRecord,
    extensions?: Record<string, string>
  ): Promise<void> {
    if (this.closed || this.pendingThumbnailExtractions.has(fileId)) return
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
    if (this.closed || this.thumbnailTaskRunning || !dbUtils) return
    this.thumbnailTaskRunning = true

    try {
      const thumbnailExtension = alias(fileExtensions, 'thumbnail_extension')
      const thumbnailStatusExtension = alias(fileExtensions, 'thumbnail_status_extension')
      // Candidate ids feed thumbnail extension WRITES (routed to the worker's
      // home under the split) — the ids must come from that same home.
      const candidates = await dbUtils
        .getFileIndexReadDb()
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
    await this.trackWrite(() =>
      this.deps.withDbWrite(label, () =>
        dbUtils.addFileExtensions([
          { fileId, key: 'thumbnail', value: thumbnailPath },
          {
            fileId,
            key: THUMBNAIL_STATUS_KEY,
            value: JSON.stringify({ status: 'generated', at: this.now() })
          }
        ])
      )
    )
  }

  private async persistThumbnailStatus(
    fileId: number,
    file: ThumbnailFileSnapshot | undefined,
    result: Extract<ThumbnailGenerationResult, { status: 'failed' | 'unsupported' }>
  ): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return
    await this.trackWrite(() =>
      this.deps.withDbWrite('thumbnail.status', () =>
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
    )
  }
}
