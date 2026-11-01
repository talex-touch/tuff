import type { IndexedSourceRoot } from '@talex-touch/utils/search'
import { describe, expect, it } from 'vitest'
import { FileProviderWatchSubtreeReconcileService } from './file-provider-watch-subtree-reconcile-service'

/**
 * A watched subtree is walked from its own folder, and a walk checks neither its start nor the
 * folders above it, so a scope inside a linked worktree is refused before any walk.
 */
function createService() {
  const unsupported = (): never => {
    throw new Error('unsupported in this test')
  }
  return new FileProviderWatchSubtreeReconcileService({
    sourceId: 'file-provider',
    getSearchIndex: () => null,
    getWatchPaths: () => ['/Users/someone'],
    isShuttingDown: () => false,
    ensureFileSystemWatchers: async () => undefined,
    isWithinWatchRoots: () => true,
    isStaleIndexPath: () => false,
    getWatchDepthForPath: () => 8,
    mapFileToIndexedSourceRecord: unsupported,
    scanDirectoryBatchesWithWorker: unsupported,
    buildFileRecord: unsupported,
    handleIncrementalDeletes: unsupported,
    handleIncrementalAddsOrChanges: unsupported,
    persistSubtreeRecords: unsupported,
    deleteReconciledRecords: unsupported,
    pathAbsenceEvidence: unsupported,
    canContinue: () => true,
    persistMissingScope: unsupported,
    getMissingCursor: unsupported,
    saveMissingCursor: unsupported,
    finishMissingScope: unsupported,
    resumeMaintenance: () => undefined,
    isLinkedWorktreeRoot: async (directory) => directory === '/Users/someone/app-feature'
  })
}

const root = (scope: string): IndexedSourceRoot => ({
  sourceId: 'file-provider',
  path: scope,
  permissionState: 'granted'
})

describe('watched subtree reconcile and linked worktrees', () => {
  it('skips the worktree folder and any scope inside it', async () => {
    const result = await createService().reconcile({
      sourceId: 'file-provider',
      roots: [root('/Users/someone/app-feature'), root('/Users/someone/app-feature/src')]
    })

    expect(result.skipped).toBe(2)
  })

  it('walks a scope outside any worktree', async () => {
    // The walk is reached: its first read needs the database this test does not provide.
    await expect(
      createService().reconcile({ sourceId: 'file-provider', roots: [root('/Users/someone/app')] })
    ).rejects.toThrow('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
  })
})
