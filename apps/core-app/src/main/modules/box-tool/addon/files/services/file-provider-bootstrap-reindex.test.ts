import { describe, expect, it } from 'vitest'
import { shouldBootstrapFileReindex } from './file-provider-bootstrap-reindex'

describe('shouldBootstrapFileReindex (V1 ship-blocker #3 Layer-2 net)', () => {
  it('schedules the reindex when the split is on, roots exist, and the index is empty', () => {
    expect(
      shouldBootstrapFileReindex({
        splitEnabled: true,
        indexedCount: 0,
        watchRootCount: 3,
        alreadyChecked: false
      })
    ).toEqual({ run: true, reason: 'bootstrap-reindex-index-empty' })
  })

  it('is idempotent: a populated index is a no-op on the next boot', () => {
    expect(
      shouldBootstrapFileReindex({
        splitEnabled: true,
        indexedCount: 3408,
        watchRootCount: 3,
        alreadyChecked: false
      })
    ).toEqual({ run: false, reason: 'skip-index-populated' })
  })

  it('runs at most once per boot', () => {
    expect(
      shouldBootstrapFileReindex({
        splitEnabled: true,
        indexedCount: 0,
        watchRootCount: 3,
        alreadyChecked: true
      })
    ).toEqual({ run: false, reason: 'skip-already-checked' })
  })

  it('never fires with the split off (primary topology is covered by existing paths)', () => {
    expect(
      shouldBootstrapFileReindex({
        splitEnabled: false,
        indexedCount: 0,
        watchRootCount: 3,
        alreadyChecked: false
      })
    ).toEqual({ run: false, reason: 'skip-split-disabled' })
  })

  it('skips when the provider reports no data to index (no watch roots)', () => {
    expect(
      shouldBootstrapFileReindex({
        splitEnabled: true,
        indexedCount: 0,
        watchRootCount: 0,
        alreadyChecked: false
      })
    ).toEqual({ run: false, reason: 'skip-no-watch-roots' })
  })

  it('skips (fail-safe) when the index count is unavailable', () => {
    expect(
      shouldBootstrapFileReindex({
        splitEnabled: true,
        indexedCount: null,
        watchRootCount: 3,
        alreadyChecked: false
      })
    ).toEqual({ run: false, reason: 'skip-count-unavailable' })
  })
})
