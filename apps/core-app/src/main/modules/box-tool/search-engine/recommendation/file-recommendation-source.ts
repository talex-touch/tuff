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

        return files.flatMap((file) => {
          const item = mapFileToTuffItem(file, {}, FILE_RECOMMENDATION_SOURCE_ID, 'File Provider')
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
