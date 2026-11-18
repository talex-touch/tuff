/**
 * FileRecommendationBridge — a one-directional registry that lets recommendation-engine code
 * query live file metadata and semantic hits from FileProvider without depending on FileProvider
 * itself. This keeps `import-direction.test.ts` clean (no FileProvider / RecommendationEngine
 * imports here).
 *
 * Modelled after `file-asset-bridge.ts` (#295).
 */

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

export interface NativeRecommendedFileRecord {
  path: string
  name: string
  extension: string
  size: number | null
  mtime: Date
  ctime: Date
  isDir: boolean
}

export interface ContextualSemanticFileHit {
  path: string
  score: number
  contentHash?: string | null
}

// ---------------------------------------------------------------------------
// Bridge interface
// ---------------------------------------------------------------------------

export interface FileRecommendationBridge {
  /**
   * Resolve live `NativeRecommendedFileRecord` rows for the given paths.
   * Paths that are not reachable on disk are omitted from the map.
   */
  lookupFilesByPaths(paths: readonly string[]): Promise<Map<string, NativeRecommendedFileRecord>>

  /**
   * List recent files from the native index, optionally filtered by creation
   * or modification time and capped at `limit`.
   *
   * - `createdAfterMs`  — only include files whose `ctime` is after this epoch-ms value.
   * - `modifiedAfterMs` — only include files whose `mtime` is after this epoch-ms value.
   * - `limit`           — maximum number of records to return (required).
   *
   * When `@rust-engine` exposes `mtimeMs` on `NativeSearchMatchItem`, the
   * implementation can avoid extra `fs.lstat` calls for the top candidates.
   */
  listRecentFiles(options: {
    createdAfterMs?: number
    modifiedAfterMs?: number
    limit: number
  }): Promise<NativeRecommendedFileRecord[]>

  /**
   * Recall files whose content is semantically related to `queryText` using
   * the embedding service (Gemma vectors).  Returns an empty array immediately
   * when the embedding service is unavailable or paused — no cold model
   * downloads are triggered.  Callers may pass `options.signal` to abort early.
   */
  recallSemanticFiles(
    queryText: string,
    options: { limit: number; minScore?: number; signal?: AbortSignal }
  ): Promise<ContextualSemanticFileHit[]>
}

// ---------------------------------------------------------------------------
// Module-level registry (latest registration wins, matches FileAssetBridge
// pattern so dispose semantics are identical)
// ---------------------------------------------------------------------------

let activeBridge: FileRecommendationBridge | null = null

/**
 * Register a bridge implementation.  Returns a disposal function that clears
 * the registration when called (as long as it is still the active bridge).
 */
export function registerFileRecommendationBridge(bridge: FileRecommendationBridge): () => void {
  activeBridge = bridge
  return () => {
    if (activeBridge === bridge) activeBridge = null
  }
}

/**
 * Returns the currently active bridge, or `null` before `FileProvider` has
 * started (and in tests that register none).
 */
export function getFileRecommendationBridge(): FileRecommendationBridge | null {
  return activeBridge
}
