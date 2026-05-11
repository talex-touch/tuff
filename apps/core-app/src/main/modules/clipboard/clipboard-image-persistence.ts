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
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { toTfileUrl } from '@talex-touch/utils/network'
import { eq } from 'drizzle-orm'
import { clipboard, nativeImage } from 'electron'
import { clipboardHistory } from '../../db/schema'
import { tempFileService } from '../../service/temp-file.service'
import { isDataUrl, isLikelyLocalPath } from './clipboard-history-persistence'

const CLIPBOARD_IMAGE_NAMESPACE = 'clipboard/images'
const CLIPBOARD_LIVE_IMAGE_NAMESPACE = 'clipboard/live-images'
const CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID = 'clipboard.temp-images.cleanup'
const CLIPBOARD_IMAGE_ORPHAN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000
const CLIPBOARD_IMAGE_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000

const pollingService = PollingService.getInstance()

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

async function collectFiles(root: string): Promise<string[]> {
  const files: string[] = []
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)))
      continue
    }
    if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

export class ClipboardImagePersistence {
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
    return await tempFileService.deleteFile(filePath)
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

    if (!pollingService.isRegistered(CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID)) {
      pollingService.register(
        CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID,
        () => {
          void this.cleanupOrphanClipboardImages().catch((error) => {
            this.options.logWarn('Clipboard temp image cleanup failed', { error })
          })
        },
        {
          interval: CLIPBOARD_IMAGE_ORPHAN_CLEANUP_INTERVAL_MS,
          unit: 'milliseconds',
          lane: 'maintenance',
          backpressure: 'coalesce',
          dedupeKey: CLIPBOARD_IMAGE_ORPHAN_CLEANUP_TASK_ID,
          maxInFlight: 1,
          timeoutMs: 60_000,
          jitterMs: 2000
        }
      )
      pollingService.start()
    }
  }

  public async cleanupOrphanClipboardImages(): Promise<void> {
    const db = this.options.getDatabase()
    if (!db) return

    const dirPath = tempFileService.resolveNamespaceDir(CLIPBOARD_IMAGE_NAMESPACE)
    const cutoff = Date.now() - CLIPBOARD_IMAGE_ORPHAN_MIN_AGE_MS

    const referenced = new Set<string>()
    try {
      const rows = await db
        .select({ content: clipboardHistory.content })
        .from(clipboardHistory)
        .where(eq(clipboardHistory.type, 'image'))

      for (const row of rows) {
        const content = row.content ?? ''
        if (!isLikelyLocalPath(content)) continue
        if (!tempFileService.isWithinBaseDir(content)) continue
        referenced.add(path.resolve(content))
      }
    } catch (error) {
      this.options.logWarn('Failed to load referenced clipboard image paths', { error })
      return
    }

    const candidates = await collectFiles(dirPath)
    let cleanedCount = 0
    let cleanedBytes = 0

    for (const filePath of candidates) {
      const resolved = path.resolve(filePath)
      if (referenced.has(resolved)) continue

      try {
        const stat = await fs.stat(resolved)
        if (!Number.isFinite(stat.mtimeMs) || stat.mtimeMs > cutoff) continue
        const ok = await tempFileService.deleteFile(resolved)
        if (ok) {
          cleanedCount += 1
          cleanedBytes += stat.size
        }
      } catch {
        // Best-effort cleanup.
      }
    }

    if (cleanedCount > 0) {
      this.options.logInfo('Cleaned orphaned clipboard images', {
        meta: { cleanedCount, cleanedBytes }
      })
    }
  }
}
