import type {
  ClipboardReadImageRequest,
  ClipboardReadImageResponse
} from '@talex-touch/utils/transport/events/types'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { NativeImage } from 'electron'
import type * as schema from '../../db/schema'
import type { LogOptions } from '../../utils/logger'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { toTfileUrl } from '@talex-touch/utils/network'
import { and, eq } from 'drizzle-orm'
import { clipboard, nativeImage } from 'electron'
import { clipboardHistory } from '../../db/schema'
import { tempFileService } from '../../service/temp-file.service'
import { isDataUrl, isLikelyLocalPath } from './clipboard-history-persistence'

const CLIPBOARD_IMAGE_NAMESPACE = 'clipboard/images'
const CLIPBOARD_LIVE_IMAGE_NAMESPACE = 'clipboard/live-images'
const CLIPBOARD_IMAGE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000

export interface ClipboardImagePersistenceOptions {
  getDatabase: () => LibSQLDatabase<typeof schema> | undefined
  logInfo: (message: string, data?: LogOptions) => void
  logWarn: (message: string, data?: LogOptions) => void
}

export function createNativeImageFromClipboardSource(source: string): NativeImage {
  if (!source) {
    return nativeImage.createEmpty()
  }

  if (isDataUrl(source)) {
    return nativeImage.createFromDataURL(source)
  }

  if (source.startsWith('tfile:')) {
    const normalizedUrl = toTfileUrl(source)
    const rawPath = normalizedUrl.slice('tfile://'.length)
    try {
      return nativeImage.createFromPath(decodeURIComponent(rawPath))
    } catch {
      return nativeImage.createFromPath(rawPath)
    }
  }

  if (source.startsWith('file://')) {
    try {
      return nativeImage.createFromPath(fileURLToPath(source))
    } catch {
      return nativeImage.createEmpty()
    }
  }

  return nativeImage.createFromPath(source)
}

async function collectFiles(
  root: string,
  maxRows: number,
  signal?: AbortSignal,
  afterPath?: string
): Promise<{ files: string[]; bounded: boolean; cancelled: boolean; failedCount: number }> {
  const files: string[] = []
  let bounded = false
  let cancelled = false
  let failedCount = 0

  const visit = async (directory: string): Promise<void> => {
    if (signal?.aborted) {
      cancelled = true
      return
    }
    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedCount += 1
      return
    }

    for (const entry of entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0
    )) {
      if (signal?.aborted) {
        cancelled = true
        return
      }
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(fullPath)
        if (bounded || cancelled) return
      } else if (entry.isFile()) {
        if (afterPath && fullPath <= afterPath) continue
        if (files.length >= maxRows) {
          bounded = true
          return
        }
        files.push(fullPath)
      }
    }
  }

  await visit(root)
  return { files, bounded, cancelled, failedCount }
}

export interface ClipboardImageCleanupResult {
  deletedCount: number
  deletedByteCount: number
  failedCount: number
  bounded?: boolean
  cancelled?: boolean
}

export class ClipboardImagePersistence {
  private orphanScanCursor: string | null = null

  constructor(private readonly options: ClipboardImagePersistenceOptions) {}

  public createNativeImageFromSource(source: string): NativeImage {
    return createNativeImageFromClipboardSource(source)
  }

  public async createClipboardImageFile(buffer: Buffer): Promise<{
    path: string
    sizeBytes: number
    createdAt: number
  }> {
    return await tempFileService.createFile({
      namespace: CLIPBOARD_IMAGE_NAMESPACE,
      ext: 'png',
      buffer,
      prefix: 'clipboard-image'
    })
  }

  public async deleteImageFile(filePath: string): Promise<boolean> {
    return await tempFileService.deleteFileFromNamespaces(filePath, [CLIPBOARD_IMAGE_NAMESPACE])
  }

  public isWithinTempBaseDir(filePath: string): boolean {
    return tempFileService.isWithinBaseDir(filePath)
  }

  public async readClipboardImage(
    request: ClipboardReadImageRequest
  ): Promise<ClipboardReadImageResponse | null> {
    const image = clipboard.readImage()
    if (image.isEmpty()) {
      return null
    }

    const size = image.getSize()
    const preview = request?.preview ?? true
    const previewDataUrl = image.resize({ width: 256 }).toDataURL()
    if (preview) {
      return {
        dataUrl: previewDataUrl,
        width: size.width,
        height: size.height
      }
    }

    const stored = await tempFileService.createFile({
      namespace: CLIPBOARD_LIVE_IMAGE_NAMESPACE,
      ext: 'png',
      buffer: image.toPNG(),
      prefix: 'clipboard-read'
    })
    return {
      dataUrl: previewDataUrl,
      width: size.width,
      height: size.height,
      tfileUrl: toTfileUrl(stored.path)
    }
  }

  public startTempCleanupTasks(): void {
    tempFileService.registerNamespace({ namespace: CLIPBOARD_IMAGE_NAMESPACE, retentionMs: null })
    tempFileService.registerNamespace({
      namespace: CLIPBOARD_LIVE_IMAGE_NAMESPACE,
      retentionMs: 24 * 60 * 60 * 1000
    })
    tempFileService.startCleanup()
  }

  public async deleteOwnedImageReferences(
    references: readonly string[],
    signal?: AbortSignal
  ): Promise<ClipboardImageCleanupResult> {
    const namespaceRoot = path.resolve(
      tempFileService.resolveNamespaceDir(CLIPBOARD_IMAGE_NAMESPACE)
    )
    let deletedCount = 0
    let deletedByteCount = 0
    let failedCount = 0

    for (const reference of references) {
      if (signal?.aborted) break
      const resolvedReference = path.resolve(reference)
      if (
        !isLikelyLocalPath(reference) ||
        !resolvedReference.startsWith(`${namespaceRoot}${path.sep}`)
      ) {
        continue
      }
      try {
        const stat = await fs.stat(resolvedReference)
        if (
          await tempFileService.deleteFileFromNamespaces(resolvedReference, [
            CLIPBOARD_IMAGE_NAMESPACE
          ])
        ) {
          deletedCount += 1
          deletedByteCount += Math.max(0, stat.size)
        } else {
          try {
            await fs.stat(resolvedReference)
            failedCount += 1
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedCount += 1
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedCount += 1
      }
    }

    return {
      deletedCount,
      deletedByteCount,
      failedCount,
      cancelled: signal?.aborted === true
    }
  }

  public async cleanupOrphanClipboardImages(
    signal?: AbortSignal,
    maxRows = 100
  ): Promise<ClipboardImageCleanupResult> {
    const db = this.options.getDatabase()
    if (!db) return { deletedCount: 0, deletedByteCount: 0, failedCount: 0 }

    const dirPath = tempFileService.resolveNamespaceDir(CLIPBOARD_IMAGE_NAMESPACE)
    const cutoff = Date.now() - CLIPBOARD_IMAGE_ORPHAN_MIN_AGE_MS

    const boundedMaxRows = Number.isFinite(maxRows)
      ? Math.min(200, Math.max(1, Math.floor(maxRows)))
      : 100
    const page = await collectFiles(
      dirPath,
      boundedMaxRows,
      signal,
      this.orphanScanCursor ?? undefined
    )
    let cleanedCount = 0
    let cleanedBytes = 0
    let failedCount = page.failedCount
    let lastProcessedPath: string | null = null

    for (const filePath of page.files) {
      if (signal?.aborted) break
      const resolved = path.resolve(filePath)

      try {
        const stat = await fs.stat(resolved)
        if (!Number.isFinite(stat.mtimeMs) || stat.mtimeMs >= cutoff) continue
        const referenced = await db
          .select({ id: clipboardHistory.id })
          .from(clipboardHistory)
          .where(and(eq(clipboardHistory.type, 'image'), eq(clipboardHistory.content, resolved)))
          .limit(1)
        if (referenced.length > 0) continue
        const ok = await tempFileService.deleteFileFromNamespaces(resolved, [
          CLIPBOARD_IMAGE_NAMESPACE
        ])
        if (ok) {
          cleanedCount += 1
          cleanedBytes += stat.size
        } else {
          try {
            await fs.stat(resolved)
            failedCount += 1
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedCount += 1
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedCount += 1
      } finally {
        lastProcessedPath = filePath
      }
    }

    const cancelled = page.cancelled || signal?.aborted === true
    if (lastProcessedPath && (page.bounded || cancelled)) {
      this.orphanScanCursor = lastProcessedPath
    } else if (!cancelled) {
      this.orphanScanCursor = null
    }

    if (cleanedCount > 0) {
      this.options.logInfo('Cleaned orphaned clipboard images', {
        meta: { cleanedCount, cleanedBytes }
      })
    }
    return {
      deletedCount: cleanedCount,
      deletedByteCount: cleanedBytes,
      failedCount,
      bounded: page.bounded,
      cancelled
    }
  }
}
