import type { files as filesSchema } from '../../../../db/schema'
import { normalizeRenderableSource } from '../../../../utils/local-renderable-assets'
import { isValidBase64DataUrl } from './utils'

export type IndexedFileRow = typeof filesSchema.$inferSelect

export interface IndexedFileAssets {
  file: IndexedFileRow
  /** Sanitized `file_extensions` rows: `thumbnail`, `thumbnailStatus`, `icon`. */
  extensions: Record<string, string>
}

interface FileAssetDbUtils {
  getFilesByPaths: (paths: string[]) => Promise<IndexedFileRow[]>
  getFileExtensionsByFileIds: (
    fileIds: number[],
    keys?: string[]
  ) => Promise<Array<{ fileId: number; key: string; value: string | null }>>
}

interface IndexedFileAssetLookupDeps {
  getDbUtils: () => FileAssetDbUtils | null
  logWarn: (message: string, error: unknown, meta: Record<string, unknown>) => void
}

export function sanitizeIndexedFileExtensions(
  extensions: Record<string, string>
): Record<string, string> {
  const sanitized = { ...extensions }
  for (const key of ['icon', 'thumbnail'] as const) {
    const value = sanitized[key]
    if (!value) continue
    if (value.startsWith('data:')) {
      if (!isValidBase64DataUrl(value)) delete sanitized[key]
      continue
    }
    const normalized = normalizeRenderableSource(value)
    if (!('missing' in normalized)) sanitized[key] = normalized.value
  }
  return sanitized
}

export function createIndexedFileAssetLookup(
  deps: IndexedFileAssetLookupDeps
): FileAssetBridge['lookupIndexedFiles'] {
  return async (paths) => {
    const assets = new Map<string, IndexedFileAssets>()
    const dbUtils = deps.getDbUtils()
    if (!dbUtils || paths.length === 0) return assets

    try {
      const files = await dbUtils.getFilesByPaths([...paths])
      if (files.length === 0) return assets
      const rows = await dbUtils.getFileExtensionsByFileIds(
        files.map((file) => file.id),
        ['thumbnail', 'thumbnailStatus', 'icon']
      )
      const extensionsByFileId = new Map<number, Record<string, string>>()
      for (const row of rows) {
        if (row.value == null) continue
        const extensions = extensionsByFileId.get(row.fileId) ?? {}
        extensions[row.key] = row.value
        extensionsByFileId.set(row.fileId, extensions)
      }
      for (const file of files) {
        assets.set(file.path, {
          file,
          extensions: sanitizeIndexedFileExtensions(extensionsByFileId.get(file.id) ?? {})
        })
      }
    } catch (error) {
      deps.logWarn('Failed to look up indexed file assets', error, { count: paths.length })
    }
    return assets
  }
}

/**
 * What FileProvider lends to code that renders file rows it did not index itself.
 *
 * Spotlight and Everything hand back paths; the recommendation engine rebuilds rows through its
 * own split-aware handle (#295). None of them own the thumbnail machinery — the worker, the cache
 * dir, the status rows that stop a failed file from being retried forever — and none may reach
 * into FileProvider for it. A registry keeps the dependency one-directional; latest registration
 * wins, which is what a provider replacing a torn-down one wants.
 */
export interface FileAssetBridge {
  /**
   * Index rows and their asset extensions for these paths, read from the home the index lives in.
   * Paths that are not indexed are absent from the map.
   */
  lookupIndexedFiles(paths: readonly string[]): Promise<Map<string, IndexedFileAssets>>
  /**
   * Generate the thumbnail for an indexed file that has none, and resolve once it is persisted
   * to the file's extension rows or known to be unavailable. Never rejects for an ordinary failure.
   */
  ensureThumbnail(file: IndexedFileRow, extensions: Record<string, string>): Promise<void>
}

let activeBridge: FileAssetBridge | null = null

export function registerFileAssetBridge(bridge: FileAssetBridge): () => void {
  activeBridge = bridge
  return () => {
    if (activeBridge === bridge) activeBridge = null
  }
}

/** `null` until a FileProvider has started (and in tests that register none). */
export function getFileAssetBridge(): FileAssetBridge | null {
  return activeBridge
}
