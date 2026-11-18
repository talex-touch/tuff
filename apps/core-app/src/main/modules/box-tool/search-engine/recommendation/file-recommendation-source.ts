import type { TuffItem } from '@talex-touch/utils'
import type { files as filesSchema } from '../../../../db/schema'
import type { DbUtils } from '../../../../db/utils'
import type { NativeRecommendedFileRecord } from '../../addon/files/file-recommendation-bridge'
import path from 'node:path'
import { getFileAssetBridge } from '../../addon/files/file-asset-bridge'
import { getFileRecommendationBridge } from '../../addon/files/file-recommendation-bridge'
import { normalizeExtension, THUMBNAIL_EXTENSIONS } from '../../addon/files/thumbnail-config'
import { mapFileToTuffItem } from '../../addon/files/utils'
import { normalizeTuffItemLocalAssets } from '../../../../utils/local-renderable-assets'
import { createLogger } from '../../../../utils/logger'

const fileSourceLog = createLogger('RecommendationEngine').child('FileSource')

export const FILE_RECOMMENDATION_SOURCE_ID = 'file-provider'

type FileRow = typeof filesSchema.$inferSelect

/**
 * How long a rebuild waits for thumbnails it just asked for. A screenshot's thumbnail takes the
 * worker a few tens of milliseconds, so the common case ships the real picture on the first open;
 * past this the card ships with the OS icon and the late thumbnail triggers a rebuild instead.
 */
export const DEFAULT_THUMBNAIL_WAIT_MS = 150

export interface FileRecommendationSourceOptions {
  /** Overrides {@link DEFAULT_THUMBNAIL_WAIT_MS}. */
  thumbnailWaitMs?: number
  /**
   * A thumbnail landed after the wait. The cards already built (and cached) carry the OS icon for
   * that file, so the caller should drop its cached ranking and rebuild.
   */
  onThumbnailLanded?: () => void
}

/**
 * The per-platform native file providers and the index provider are one logical source wearing
 * several registration ids; candidates recorded under any of them rebuild through here.
 */
export const FILE_RECOMMENDATION_ALIASES = [
  'file',
  'files',
  'everything-provider',
  'macos-spotlight-provider',
  'linux-native-file-provider'
] as const

/**
 * `file_extensions` rows for the given SQLite-backed files, keyed by file id.
 *
 * Synthetic `NativeFileArena`-only rows carry negative ids and have no `file_extensions` rows, so
 * they are excluded before querying SQLite.
 */
async function loadExtensionsByFileId(
  dbUtils: DbUtils,
  files: Array<{ id: number }>
): Promise<Map<number, Record<string, string>>> {
  const byFileId = new Map<number, Record<string, string>>()
  const persistedFiles = files.filter((file) => file.id > 0)
  if (persistedFiles.length === 0) return byFileId

  try {
    const rows = await dbUtils.getFileExtensionsByFileIds(persistedFiles.map((file) => file.id))
    for (const row of rows) {
      if (row.value == null) continue
      const bucket = byFileId.get(row.fileId) ?? {}
      bucket[row.key] = row.value
      byFileId.set(row.fileId, bucket)
    }
  } catch (error) {
    fileSourceLog.warn('Failed to load file extensions for recommendations', {
      error,
      meta: { fileCount: persistedFiles.length }
    })
  }

  return byFileId
}

function synthesizeNativeFileRow(record: NativeRecommendedFileRecord, index: number): FileRow {
  return {
    id: -(index + 1),
    path: record.path,
    name: record.name || path.basename(record.path),
    displayName: null,
    extension: record.extension || path.extname(record.name || record.path) || '',
    size: record.size ?? null,
    mtime: record.mtime,
    ctime: record.ctime,
    lastIndexedAt: record.mtime,
    isDir: record.isDir,
    type: 'file',
    content: null,
    embeddingStatus: 'none'
  }
}

async function resolveArenaFallbackFiles(missingPaths: readonly string[]): Promise<FileRow[]> {
  if (missingPaths.length === 0) return []
  const bridge = getFileRecommendationBridge()
  if (!bridge) return []

  try {
    const resolvedByPath = await bridge.lookupFilesByPaths(missingPaths)
    const synthesized: FileRow[] = []
    let synthIndex = 0
    for (const missingPath of missingPaths) {
      const record = resolvedByPath.get(missingPath)
      if (!record) continue
      synthesized.push(synthesizeNativeFileRow(record, synthIndex))
      synthIndex += 1
    }
    return synthesized
  } catch (error) {
    fileSourceLog.warn('Failed to resolve NativeFileArena fallback files', {
      error,
      meta: { missingCount: missingPaths.length }
    })
    return []
  }
}

function isMissingThumbnail(
  file: FileRow,
  extensions: Record<string, string> | undefined
): boolean {
  if (file.id <= 0) return false
  if (extensions?.thumbnail) return false
  const extension = normalizeExtension(file.extension || path.extname(file.name) || '')
  return THUMBNAIL_EXTENSIONS.has(extension)
}

/** Resolves `true` if `work` settles within `ms`, `false` if the budget runs out first. */
function settlesWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms)
    void work.then(
      () => {
        clearTimeout(timer)
        resolve(true)
      },
      () => {
        clearTimeout(timer)
        resolve(true)
      }
    )
  })
}

/**
 * File rows as a recommendation source.
 *
 * Registered as a standalone source rather than as a `FileProvider` capability because the lookup
 * must go through the engine's split-aware handle: under the search split (#295) hot-doc FILE rows
 * live in the worker-owned `search-index.db`, while general non-content files live in
 * `NativeFileArena` and resolve via `FileRecommendationBridge.lookupFilesByPaths`.
 */
export function createFileRecommendationSource(
  dbUtils: DbUtils,
  options: FileRecommendationSourceOptions = {}
): {
  sourceId: string
  aliases: readonly string[]
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
} {
  const thumbnailWaitMs = options.thumbnailWaitMs ?? DEFAULT_THUMBNAIL_WAIT_MS

  async function warmMissingThumbnails(
    files: FileRow[],
    extensionsByFileId: Map<number, Record<string, string>>
  ): Promise<boolean> {
    const bridge = getFileAssetBridge()
    if (!bridge) return true

    const missing = files.filter((file) =>
      isMissingThumbnail(file, extensionsByFileId.get(file.id))
    )
    if (missing.length === 0) return true

    const generation = Promise.allSettled(
      missing.map((file) => bridge.ensureThumbnail(file, extensionsByFileId.get(file.id) ?? {}))
    )
    const landedInTime = await settlesWithin(generation, thumbnailWaitMs)
    if (landedInTime) return true

    void generation.then(async () => {
      const refreshed = await loadExtensionsByFileId(dbUtils, missing)
      if (missing.some((file) => refreshed.get(file.id)?.thumbnail)) {
        options.onThumbnailLanded?.()
      }
    })
    return false
  }

  return {
    sourceId: FILE_RECOMMENDATION_SOURCE_ID,
    aliases: FILE_RECOMMENDATION_ALIASES,
    async rebuild(itemIds) {
      if (itemIds.length === 0) return []

      try {
        const requestedPaths = [...itemIds]
        const dbFiles = await dbUtils.getFilesByPaths(requestedPaths)
        const foundPaths = new Set(dbFiles.map((file) => file.path))
        const missingPaths = requestedPaths.filter((itemPath) => !foundPaths.has(itemPath))
        const arenaFiles = await resolveArenaFallbackFiles(missingPaths)
        const files = arenaFiles.length > 0 ? [...dbFiles, ...arenaFiles] : dbFiles
        if (files.length === 0) return []

        // Without these the mapper receives `{}` and every image falls back to a generic glyph:
        // a picture under ~/Pictures cannot be shown directly because `tfile` only serves
        // allowlisted roots, so the *generated thumbnail* — recorded here and living in an
        // allowlisted cache dir — is the only way an image card ever shows the image.
        let extensionsByFileId = await loadExtensionsByFileId(dbUtils, files)
        const bridge = getFileAssetBridge()
        if (
          bridge &&
          files.some((file) => isMissingThumbnail(file, extensionsByFileId.get(file.id)))
        ) {
          await warmMissingThumbnails(files, extensionsByFileId)
          // Whatever landed in time is on disk now; the rest still map to the OS icon.
          extensionsByFileId = await loadExtensionsByFileId(dbUtils, files)
        }

        return files.flatMap((file) => {
          const item = mapFileToTuffItem(
            file,
            extensionsByFileId.get(file.id) ?? {},
            FILE_RECOMMENDATION_SOURCE_ID,
            'File Provider'
          )
          const normalized = normalizeTuffItemLocalAssets(item, {
            // A recommendation for a file the user has since deleted must vanish, not render broken.
            dropMissingFile: true,
            fallbackKind: file.isDir ? 'folder' : 'file'
          })
          return normalized.item ? [normalized.item] : []
        })
      } catch (error) {
        fileSourceLog.error('Failed to rebuild file items', {
          error,
          meta: { itemCount: itemIds.length }
        })
        return []
      }
    }
  }
}
