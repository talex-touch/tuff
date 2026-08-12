import { describe, expect, it, vi } from 'vitest'
import {
  evaluateReconciliationDeletionGuard,
  FileProviderReconciliationRunService
} from './file-provider-reconciliation-run-service'
import type { ScannedFileInfo } from '../types'

function scannedFile(path: string, mtime = 2_000): ScannedFileInfo {
  return {
    path,
    name: path.split('/').pop() ?? path,
    extension: '.txt',
    size: 1,
    ctime: new Date(1_000),
    mtime: new Date(mtime)
  }
}

/** A scan dep that streams the given batches and then reports its stats. */
function streamedScan(
  stats: { errorCount: number } | null,
  ...batches: ScannedFileInfo[][]
): (
  rootPath: string,
  excludePathsSet: Set<string> | undefined,
  context: unknown,
  onStats: (stats: { entryCount: number; errorCount: number }) => void
) => AsyncIterable<ScannedFileInfo[]> {
  return (_rootPath, _excludePathsSet, _context, onStats) =>
    (async function* () {
      yield* batches
      if (stats) {
        onStats({
          entryCount: batches.reduce((count, batch) => count + batch.length, 0),
          errorCount: stats.errorCount
        })
      }
    })()
}

function buildDeps(overrides: Record<string, unknown> = {}) {
  return {
    enterPerfContext: vi.fn(() => vi.fn()),
    assertActive: vi.fn(),
    waitForIdle: vi.fn(async () => {}),
    prepareSeenPaths: vi.fn(async () => {}),
    recordSeenPaths: vi.fn(async () => {}),
    clearSeenPaths: vi.fn(async () => {}),
    getDbFilesByPaths: vi.fn(async () => []),
    getMissingDbFiles: vi.fn(async () => []),
    countRootRows: vi.fn(async () => ({ total: 0, missing: 0 })),
    getDeferralReason: vi.fn(() => null),
    scanDirectory: vi.fn(streamedScan({ errorCount: 0 })),
    reconcile: vi.fn(async () => ({ filesToAdd: [], filesToUpdate: [], deletedIds: [] })),
    deleteRecords: vi.fn(async () => {}),
    updateRecords: vi.fn(async () => ({ updatedCount: 0 })),
    insertRecords: vi.fn(async () => ({ insertedCount: 0 })),
    emitProgress: vi.fn(),
    yieldAfterDbRead: vi.fn(async () => {}),
    yieldAfterPathScan: vi.fn(async () => {}),
    now: vi.fn(() => 0),
    formatDuration: vi.fn((durationMs: number) => `${durationMs}ms`),
    logDebug: vi.fn(),
    logWarn: vi.fn(),
    ...overrides
  }
}

describe('file-provider-reconciliation-run-service', () => {
  it('diffs and persists each streamed disk batch before fetching missing database rows', async () => {
    const firstBatch = [scannedFile('/root/update.txt', 3_000)]
    const secondBatch = [scannedFile('/root/add.txt')]
    const deps = buildDeps({
      scanDirectory: vi.fn(streamedScan({ errorCount: 0 }, firstBatch, secondBatch)),
      getDbFilesByPaths: vi
        .fn()
        .mockResolvedValueOnce([{ id: 1, path: '/root/update.txt', mtime: new Date(1_000) }])
        .mockResolvedValueOnce([]),
      reconcile: vi
        .fn()
        .mockResolvedValueOnce({
          filesToAdd: [],
          filesToUpdate: [
            {
              id: 1,
              path: '/root/update.txt',
              name: 'update.txt',
              extension: '.txt',
              size: 1,
              mtime: 3_000,
              ctime: 1_000
            }
          ],
          deletedIds: []
        })
        .mockResolvedValueOnce({
          filesToAdd: [
            {
              path: '/root/add.txt',
              name: 'add.txt',
              extension: '.txt',
              size: 1,
              mtime: 2_000,
              ctime: 1_000
            }
          ],
          filesToUpdate: [],
          deletedIds: []
        }),
      updateRecords: vi.fn(async () => ({ updatedCount: 1 })),
      insertRecords: vi.fn(async () => ({ insertedCount: 1 }))
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).resolves.toEqual({
      added: 1,
      changed: 1,
      deleted: 0,
      skipped: 0,
      completedPaths: ['/root']
    })

    expect(deps.recordSeenPaths).toHaveBeenNthCalledWith(1, ['/root/update.txt'], {
      runId: 'reconcile'
    })
    expect(deps.recordSeenPaths).toHaveBeenNthCalledWith(2, ['/root/add.txt'], {
      runId: 'reconcile'
    })
    expect(deps.getDbFilesByPaths).toHaveBeenNthCalledWith(1, ['/root/update.txt'], {
      runId: 'reconcile'
    })
    expect(deps.getDbFilesByPaths).toHaveBeenNthCalledWith(2, ['/root/add.txt'], {
      runId: 'reconcile'
    })
    expect(deps.updateRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 1, path: '/root/update.txt', mtime: new Date(3_000) })],
      { runId: 'reconcile' }
    )
    expect(deps.insertRecords).toHaveBeenCalledWith(
      [expect.objectContaining({ path: '/root/add.txt' })],
      { runId: 'reconcile' }
    )
    expect(deps.clearSeenPaths).toHaveBeenCalledWith({ runId: 'reconcile' })
  })

  it('deletes missing database rows page by page after a streamed scan completes', async () => {
    const deps = buildDeps({
      // A trustworthy scan: entries produced, no read errors, and the round
      // removes a minority of the root's rows.
      scanDirectory: vi.fn(streamedScan({ errorCount: 0 }, [scannedFile('/root/kept.txt')])),
      countRootRows: vi.fn(async () => ({ total: 10, missing: 3 })),
      getMissingDbFiles: vi
        .fn()
        .mockResolvedValueOnce([
          { id: 5, path: '/root/missing-5.txt', mtime: new Date(1_000) },
          { id: 8, path: '/root/missing-8.txt', mtime: new Date(1_000) }
        ])
        .mockResolvedValueOnce([{ id: 13, path: '/root/missing-13.txt', mtime: new Date(1_000) }])
        .mockResolvedValueOnce([])
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).resolves.toMatchObject({
      deleted: 3,
      completedPaths: ['/root']
    })

    expect(deps.getMissingDbFiles).toHaveBeenNthCalledWith(1, '/root', 0, 500, {
      runId: 'reconcile'
    })
    expect(deps.getMissingDbFiles).toHaveBeenNthCalledWith(2, '/root', 8, 500, {
      runId: 'reconcile'
    })
    expect(deps.getMissingDbFiles).toHaveBeenNthCalledWith(3, '/root', 13, 500, {
      runId: 'reconcile'
    })
    expect(deps.deleteRecords).toHaveBeenNthCalledWith(
      1,
      [
        { id: 5, path: '/root/missing-5.txt' },
        { id: 8, path: '/root/missing-8.txt' }
      ],
      { runId: 'reconcile' }
    )
    expect(deps.deleteRecords).toHaveBeenNthCalledWith(
      2,
      [{ id: 13, path: '/root/missing-13.txt' }],
      { runId: 'reconcile' }
    )
  })

  it.each([
    {
      name: 'diffing fails',
      reconcile: vi.fn(async () => {
        throw new Error('diff failed')
      }),
      insertRecords: vi.fn(async () => ({ insertedCount: 0 }))
    },
    {
      name: 'inserting fails',
      reconcile: vi.fn(async () => ({
        filesToAdd: [
          {
            path: '/root/add.txt',
            name: 'add.txt',
            extension: '.txt',
            size: 1,
            mtime: 2_000,
            ctime: 1_000
          }
        ],
        filesToUpdate: [],
        deletedIds: []
      })),
      insertRecords: vi.fn(async () => {
        throw new Error('insert failed')
      })
    }
  ])('clears seen-path staging when $name', async ({ reconcile, insertRecords }) => {
    const deps = buildDeps({
      scanDirectory: vi.fn(streamedScan({ errorCount: 0 }, [scannedFile('/root/add.txt')])),
      reconcile,
      insertRecords
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).rejects.toThrow(/failed/)

    expect(deps.clearSeenPaths).toHaveBeenCalledWith({ runId: 'reconcile' })
    expect(deps.emitProgress).not.toHaveBeenLastCalledWith(1, 1)
  })

  it('does not mark a cancelled root complete after clearing seen-path staging', async () => {
    const cancelled = new Error('reconciliation cancelled')
    const assertActive = vi
      .fn()
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw cancelled
      })
    const deps = buildDeps({
      assertActive,
      scanDirectory: vi.fn(streamedScan({ errorCount: 0 }, []))
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).rejects.toBe(cancelled)
    expect(deps.clearSeenPaths).toHaveBeenCalledWith({ runId: 'reconcile' })
    expect(deps.emitProgress).toHaveBeenCalledWith(0, 1)
    expect(deps.emitProgress).not.toHaveBeenCalledWith(1, 1)
  })

  it('aborts the deletion phase when a scan finds nothing but the index holds rows', async () => {
    // Revoked permission / unplugged volume: the scan reads as "empty", and the
    // paged deletion would wipe every indexed row under the root.
    const deps = buildDeps({
      scanDirectory: vi.fn(streamedScan({ errorCount: 0 }, [])),
      countRootRows: vi.fn(async () => ({ total: 1_200, missing: 1_200 })),
      getMissingDbFiles: vi.fn(async () => [
        { id: 5, path: '/root/missing-5.txt', mtime: new Date(1_000) }
      ])
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).resolves.toMatchObject({
      deleted: 0,
      completedPaths: ['/root']
    })

    expect(deps.getMissingDbFiles).not.toHaveBeenCalled()
    expect(deps.deleteRecords).not.toHaveBeenCalled()
    expect(deps.logWarn).toHaveBeenCalledWith(
      'Reconciliation deletion skipped to protect the index',
      undefined,
      expect.objectContaining({
        path: '/root',
        reason: 'empty-scan-with-db-rows',
        scannedEntries: 0,
        dbRows: 1_200,
        plannedDeletions: 1_200
      })
    )
  })

  it('aborts the deletion phase when an erroring scan would remove most of a root', async () => {
    const deps = buildDeps({
      scanDirectory: vi.fn(streamedScan({ errorCount: 3 }, [scannedFile('/root/seen.txt')])),
      countRootRows: vi.fn(async () => ({ total: 100, missing: 51 })),
      getMissingDbFiles: vi.fn(async () => [
        { id: 5, path: '/root/missing-5.txt', mtime: new Date(1_000) }
      ])
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).resolves.toMatchObject({
      deleted: 0
    })

    expect(deps.deleteRecords).not.toHaveBeenCalled()
    expect(deps.logWarn).toHaveBeenCalledWith(
      'Reconciliation deletion skipped to protect the index',
      undefined,
      expect.objectContaining({ reason: 'scan-errors-with-mass-deletion', scanErrors: 3 })
    )
  })

  it('still deletes a minority of rows when the scan reports errors', async () => {
    const deps = buildDeps({
      scanDirectory: vi.fn(streamedScan({ errorCount: 2 }, [scannedFile('/root/seen.txt')])),
      countRootRows: vi.fn(async () => ({ total: 100, missing: 50 })),
      getMissingDbFiles: vi
        .fn()
        .mockResolvedValueOnce([{ id: 5, path: '/root/missing-5.txt', mtime: new Date(1_000) }])
        .mockResolvedValueOnce([])
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).resolves.toMatchObject({
      deleted: 1
    })
    expect(deps.deleteRecords).toHaveBeenCalledTimes(1)
    expect(deps.logWarn).not.toHaveBeenCalled()
  })

  it('stands the whole round down while the path normalization repair is pending', async () => {
    // Running first would rebuild every legacy NFD row as insert-NFC +
    // delete-NFD and orphan the old ids in the search index.
    const deps = buildDeps({
      getDeferralReason: vi.fn(() => 'path-normalization-pending'),
      scanDirectory: vi.fn(streamedScan({ errorCount: 0 }, [scannedFile('/root/a.txt')])),
      countRootRows: vi.fn(async () => ({ total: 10, missing: 4 }))
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).resolves.toEqual({
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      // No completed paths: scan progress stays unrecorded so the roots remain
      // eligible for the next round.
      completedPaths: []
    })

    expect(deps.scanDirectory).not.toHaveBeenCalled()
    expect(deps.prepareSeenPaths).not.toHaveBeenCalled()
    expect(deps.deleteRecords).not.toHaveBeenCalled()
    expect(deps.enterPerfContext).not.toHaveBeenCalled()
    expect(deps.logWarn).toHaveBeenCalledWith('Reconciliation round deferred', undefined, {
      reason: 'path-normalization-pending',
      paths: 1
    })
  })

  it('runs the round once the deferral clears', async () => {
    const deps = buildDeps({
      getDeferralReason: vi.fn(() => null),
      scanDirectory: vi.fn(streamedScan({ errorCount: 0 }, [scannedFile('/root/a.txt')])),
      countRootRows: vi.fn(async () => ({ total: 10, missing: 0 }))
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).resolves.toMatchObject({
      completedPaths: ['/root']
    })
    expect(deps.scanDirectory).toHaveBeenCalledTimes(1)
  })

  it('returns an empty result without opening reconciliation state for empty paths', async () => {
    const deps = buildDeps()
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute([], { runId: 'reconcile' })).resolves.toEqual({
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      completedPaths: []
    })
    expect(deps.enterPerfContext).not.toHaveBeenCalled()
    expect(deps.prepareSeenPaths).not.toHaveBeenCalled()
  })
})

describe('evaluateReconciliationDeletionGuard', () => {
  it('blocks an empty scan only while the index still holds rows for the root', () => {
    expect(
      evaluateReconciliationDeletionGuard({
        scannedEntries: 0,
        scanErrors: 0,
        dbRowCount: 1,
        plannedDeletions: 1
      })
    ).toEqual({ allowed: false, reason: 'empty-scan-with-db-rows' })
    // Nothing on disk, nothing indexed: no deletion to protect against.
    expect(
      evaluateReconciliationDeletionGuard({
        scannedEntries: 0,
        scanErrors: 0,
        dbRowCount: 0,
        plannedDeletions: 0
      })
    ).toEqual({ allowed: true })
  })

  it('blocks an erroring scan strictly above the half-of-root deletion share', () => {
    expect(
      evaluateReconciliationDeletionGuard({
        scannedEntries: 10,
        scanErrors: 1,
        dbRowCount: 100,
        plannedDeletions: 51
      })
    ).toEqual({ allowed: false, reason: 'scan-errors-with-mass-deletion' })
    expect(
      evaluateReconciliationDeletionGuard({
        scannedEntries: 10,
        scanErrors: 1,
        dbRowCount: 100,
        plannedDeletions: 50
      })
    ).toEqual({ allowed: true })
  })

  it('allows a mass deletion from a clean scan', () => {
    expect(
      evaluateReconciliationDeletionGuard({
        scannedEntries: 1,
        scanErrors: 0,
        dbRowCount: 100,
        plannedDeletions: 99
      })
    ).toEqual({ allowed: true })
  })
})
