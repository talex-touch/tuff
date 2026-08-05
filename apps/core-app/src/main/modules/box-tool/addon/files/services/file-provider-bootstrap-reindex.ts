/**
 * Bootstrap/self-heal reindex decision for the split search topology
 * (issue #295, V1 ship-blocker #3 follow-up).
 *
 * With `DB_SEARCH_SPLIT_ENABLED` on, search-index.db is rebuildable by design:
 * a fresh (or lost/emptied) file must trigger one full reindex. The normal
 * trigger is scan-progress emptiness (empty file → no completed roots → full
 * scan), but that gate can be wedged shut when scan_progress rows survived
 * while the index rows did not (partial file loss, interrupted rebuild). This
 * decision closes that hole: index empty + roots configured → force one
 * Startup scan, whose integrity check then clears the bogus scan_progress and
 * runs the full pipeline.
 *
 * Deliberately NOT gated behind the startup degrade window: an empty search
 * index is missing user-visible search capability, not deferrable maintenance.
 */

export interface FileIndexBootstrapDecisionInput {
  /** Search split on (search-index.db is the live home)? Off → primary topology, existing paths cover it. */
  splitEnabled: boolean
  /** search_index rows for this source in the LIVE home; null = count unavailable (worker not ready). */
  indexedCount: number | null
  /** Configured watch roots — "the provider reports data to index". */
  watchRootCount: number
  /** Once-per-boot guard: a previous check already ran this boot. */
  alreadyChecked: boolean
}

export interface FileIndexBootstrapDecision {
  run: boolean
  reason:
    | 'bootstrap-reindex-index-empty'
    | 'skip-split-disabled'
    | 'skip-already-checked'
    | 'skip-count-unavailable'
    | 'skip-no-watch-roots'
    | 'skip-index-populated'
}

export function shouldBootstrapFileReindex(
  input: FileIndexBootstrapDecisionInput
): FileIndexBootstrapDecision {
  if (input.alreadyChecked) return { run: false, reason: 'skip-already-checked' }
  if (!input.splitEnabled) return { run: false, reason: 'skip-split-disabled' }
  if (input.indexedCount === null) return { run: false, reason: 'skip-count-unavailable' }
  if (input.watchRootCount <= 0) return { run: false, reason: 'skip-no-watch-roots' }
  if (input.indexedCount > 0) return { run: false, reason: 'skip-index-populated' }
  return { run: true, reason: 'bootstrap-reindex-index-empty' }
}
