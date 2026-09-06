import type { files as filesSchema } from '../../../../db/schema'

export type IndexedFileRow = typeof filesSchema.$inferSelect

export interface IndexedFileAssets {
  file: IndexedFileRow
  /** Sanitized `file_extensions` rows: `thumbnail`, `thumbnailStatus`, `icon`. */
  extensions: Record<string, string>
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
