import { describe, expect, it, vi } from 'vitest'
import { FileProviderReconciliationRunService } from './file-provider-reconciliation-run-service'
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

function streamedBatches(...batches: ScannedFileInfo[][]): AsyncIterable<ScannedFileInfo[]> {
  return (async function* () {
    yield* batches
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
    scanDirectory: vi.fn(() => streamedBatches()),
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
    ...overrides
  }
}

describe('file-provider-reconciliation-run-service', () => {
  it('diffs and persists each streamed disk batch before fetching missing database rows', async () => {
    const firstBatch = [scannedFile('/root/update.txt', 3_000)]
    const secondBatch = [scannedFile('/root/add.txt')]
    const deps = buildDeps({
      scanDirectory: vi.fn(() => streamedBatches(firstBatch, secondBatch)),
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
      scanDirectory: vi.fn(() => streamedBatches([])),
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
      scanDirectory: vi.fn(() => streamedBatches([scannedFile('/root/add.txt')])),
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
      scanDirectory: vi.fn(() => streamedBatches([]))
    })
    const service = new FileProviderReconciliationRunService(deps)

    await expect(service.execute(['/root'], { runId: 'reconcile' })).rejects.toBe(cancelled)
    expect(deps.clearSeenPaths).toHaveBeenCalledWith({ runId: 'reconcile' })
    expect(deps.emitProgress).toHaveBeenCalledWith(0, 1)
    expect(deps.emitProgress).not.toHaveBeenCalledWith(1, 1)
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
