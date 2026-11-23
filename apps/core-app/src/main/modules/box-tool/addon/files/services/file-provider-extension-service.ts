import type { files as filesSchema } from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'

export const FILE_EXTENSION_WRITE_MAX_QUEUE = 12

export interface FileProviderExtensionServiceDeps {
  getDbUtils: () => DbUtils | null
  isSearchSplitEnabledNow: () => boolean
  waitForCacheWriteCapacity: (maxQueue: number, label: string) => Promise<boolean>
}

/**
 * Retired per-file `file_extensions.keywords` writer (A15).
 *
 * File type tags and filename keywords are projected directly into `SearchIndexItem.tags` and
 * `SearchIndexItem.keywords` (`search_keyword_postings` / FTS `tags`), and type filters query
 * `files.extension`. Nothing in search, recommendations, or the renderer reads `file_extensions`
 * rows with `key = 'keywords'`.
 */
export class FileProviderExtensionService {
  constructor(private readonly _deps?: Partial<FileProviderExtensionServiceDeps>) {}

  async processFileExtensions(_files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    void this._deps
  }
}
