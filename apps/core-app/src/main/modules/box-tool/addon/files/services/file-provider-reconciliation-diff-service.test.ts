import { describe, expect, it, vi } from 'vitest'
import { FileProviderReconciliationDiffService } from './file-provider-reconciliation-diff-service'

function diskFile(path: string, mtime: number) {
  return {
    path,
    name: path.split('/').pop() ?? path,
    extension: '.txt',
    size: 1,
    mtime,
    ctime: mtime
  }
}

describe('file-provider-reconciliation-diff-service', () => {
  it('computes added, updated, and deleted records with duplicate disk paths ignored', () => {
    const service = new FileProviderReconciliationDiffService({
      reconcileWithWorker: vi.fn(),
      logWarn: vi.fn()
    })

    const result = service.compute(
      [
        diskFile('/watch/new.txt', 20),
        diskFile('/watch/update.txt', 30),
        diskFile('/watch/update.txt', 40),
        diskFile('/other/external.txt', 10)
      ],
      [
        { id: 1, path: '/watch/update.txt', mtime: 10 },
        { id: 2, path: '/watch/delete.txt', mtime: 10 },
        { id: 3, path: '/other/keep.txt', mtime: 10 }
      ],
      ['/watch']
    )

    expect(result.filesToAdd).toEqual([
      diskFile('/watch/new.txt', 20),
      diskFile('/other/external.txt', 10)
    ])
    expect(result.filesToUpdate).toEqual([{ ...diskFile('/watch/update.txt', 30), id: 1 }])
    expect(result.deletedIds).toEqual([2])
  })

  it('uses worker result when worker succeeds', async () => {
    const workerResult = {
      filesToAdd: [diskFile('/watch/new.txt', 20)],
      filesToUpdate: [],
      deletedIds: []
    }
    const reconcileWithWorker = vi.fn(async () => workerResult)
    const service = new FileProviderReconciliationDiffService({
      reconcileWithWorker,
      logWarn: vi.fn()
    })

    await expect(service.reconcile([], [], ['/watch'])).resolves.toBe(workerResult)
    expect(reconcileWithWorker).toHaveBeenCalledWith([], [], ['/watch'])
  })

  it('falls back to main-thread diff and logs when worker fails', async () => {
    const error = new Error('worker failed')
    const logWarn = vi.fn()
    const service = new FileProviderReconciliationDiffService({
      reconcileWithWorker: vi.fn(async () => {
        throw error
      }),
      logWarn
    })

    const result = await service.reconcile([diskFile('/watch/new.txt', 20)], [], ['/watch'])

    expect(result.filesToAdd).toEqual([diskFile('/watch/new.txt', 20)])
    expect(result.filesToUpdate).toEqual([])
    expect(result.deletedIds).toEqual([])
    expect(logWarn).toHaveBeenCalledWith(
      'File reconcile worker failed, falling back to main-thread diff',
      error,
      { files: 1 }
    )
  })
})
