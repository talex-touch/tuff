import type { TuffItem } from '@talex-touch/utils'
import type { DbUtils } from '../../../../db/utils'
import { mapFileToTuffItem } from '../../addon/files/utils'
import { normalizeTuffItemLocalAssets } from '../../../../utils/local-renderable-assets'
import { createLogger } from '../../../../utils/logger'

const fileSourceLog = createLogger('RecommendationEngine').child('FileSource')

export const FILE_RECOMMENDATION_SOURCE_ID = 'file-provider'

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
 * `file_extensions` rows for the given files, keyed by file id.
 *
 * One batched read; per-file lookups here would be an N+1 on the empty-query path. A failure is
 * swallowed because a missing thumbnail costs an icon, not the card.
 */
async function loadExtensionsByFileId(
  dbUtils: DbUtils,
  files: Array<{ id: number }>
): Promise<Map<number, Record<string, string>>> {
  const byFileId = new Map<number, Record<string, string>>()
  if (files.length === 0) return byFileId

  try {
    const rows = await dbUtils.getFileExtensionsByFileIds(files.map((file) => file.id))
    for (const row of rows) {
      if (row.value == null) continue
      const bucket = byFileId.get(row.fileId) ?? {}
      bucket[row.key] = row.value
      byFileId.set(row.fileId, bucket)
    }
  } catch (error) {
    fileSourceLog.warn('Failed to load file extensions for recommendations', {
      error,
      meta: { fileCount: files.length }
    })
  }

  return byFileId
}

/**
 * File rows as a recommendation source.
 *
 * Registered as a standalone source rather than as a `FileProvider` capability because the lookup
 * must go through the engine's split-aware handle: under the search split (#295) FILE rows live in
 * the worker-owned `search-index.db`, and `FileProvider` holds a separate `createDbUtils` instance.
 * Reading through the provider's handle would silently change which database answers.
 */
export function createFileRecommendationSource(dbUtils: DbUtils): {
  sourceId: string
  aliases: readonly string[]
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
} {
  return {
    sourceId: FILE_RECOMMENDATION_SOURCE_ID,
    aliases: FILE_RECOMMENDATION_ALIASES,
    async rebuild(itemIds) {
      if (itemIds.length === 0) return []

      try {
        const files = await dbUtils.getFilesByPaths([...itemIds])
        if (files.length === 0) return []

        // Without these the mapper receives `{}` and every image falls back to a generic glyph:
        // a picture under ~/Pictures cannot be shown directly because `tfile` only serves
        // allowlisted roots, so the *generated thumbnail* — recorded here and living in an
        // allowlisted cache dir — is the only way an image card ever shows the image.
        const extensionsByFileId = await loadExtensionsByFileId(dbUtils, files)

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
