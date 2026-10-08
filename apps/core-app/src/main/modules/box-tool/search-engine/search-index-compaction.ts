/**
 * Whether a `VACUUM` of the search index file is worth running right now.
 *
 * `auto_vacuum` is off, so pages freed by a bulk cleanup (the content-index switch nulls
 * `files.content` and blanks `search_index.content`, about 2.5 GB on a 5 GB dev index on
 * 2026-10-08) stay in the file until a VACUUM rewrites it. VACUUM copies the database through a
 * temp file and, under WAL, through the WAL as well, so it needs disk headroom and is only
 * worth its minutes of I/O when the freelist is a real share of the file.
 */
export const SEARCH_INDEX_COMPACTION_MIN_FREE_BYTES = 256 * 1024 * 1024
export const SEARCH_INDEX_COMPACTION_MIN_FREE_RATIO = 0.1
export const SEARCH_INDEX_COMPACTION_DISK_HEADROOM_RATIO = 2.5

export interface SearchIndexCompactionInput {
  fileBytes: number
  freelistBytes: number
  /** `null` when the free space could not be read; compaction then stays off. */
  freeDiskBytes: number | null
}

export type SearchIndexCompactionDecision =
  | { run: true }
  | { run: false; reason: 'nothing-to-reclaim' | 'insufficient-disk' | 'disk-unknown' }

export function resolveSearchIndexCompactionDecision(
  input: SearchIndexCompactionInput
): SearchIndexCompactionDecision {
  const fileBytes = Math.max(0, input.fileBytes)
  const freelistBytes = Math.max(0, input.freelistBytes)
  if (
    freelistBytes < SEARCH_INDEX_COMPACTION_MIN_FREE_BYTES ||
    freelistBytes < fileBytes * SEARCH_INDEX_COMPACTION_MIN_FREE_RATIO
  ) {
    return { run: false, reason: 'nothing-to-reclaim' }
  }
  if (input.freeDiskBytes === null || !Number.isFinite(input.freeDiskBytes)) {
    return { run: false, reason: 'disk-unknown' }
  }
  if (input.freeDiskBytes < fileBytes * SEARCH_INDEX_COMPACTION_DISK_HEADROOM_RATIO) {
    return { run: false, reason: 'insufficient-disk' }
  }
  return { run: true }
}
