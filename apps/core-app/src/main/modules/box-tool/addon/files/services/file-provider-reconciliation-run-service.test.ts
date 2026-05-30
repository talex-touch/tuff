import { describe, expect, it, vi } from 'vitest'
import { FileProviderReconciliationRunService } from './file-provider-reconciliation-run-service'
import type { ScannedFileInfo } from '../types'

function scannedFile(path: string, mtime = 2000): ScannedFileInfo {
  return {
    path,
    name: path.split('/').pop() ?? path,
    extension: '.txt',
    size: 1,
    ctime: new Date(1000),
    mtime: new Date(mtime)
  }
}

describe('file-provider-reconciliation-run-service', () => {
  it('runs reconciliation scan, applies delete/update/insert operations, and reports stats', async () => {
    const finishPerfContext = vi.fn()
    const getDbFiles = vi.fn(async () => [
      { id: 1, path: '/root/update.txt', mtime: new Date(1000) },
      { id: 2, path: '/root/delete.txt', mtime: new Date(1000) }
    ])
    const scanDirectory = vi.fn(async () => [
      scannedFile('/root/update.txt', 3000),
      scannedFile('/root/add.txt', 2000)
    ])
    const reconcile = vi.fn(async () => ({
      filesToAdd: [
        {
          path: '/root/add.txt',
          name: 'add.txt',
          extension: '.txt',
          size: 1,
          mtime: 2000,
          ctime: 1000
        }
      ],
      filesToUpdate: [
        {
          id: 1,
          path: '/root/update.txt',
          name: 'update.txt',
          extension: '.txt',
          size: 1,
          mtime: 3000,
          ctime: 1000
        }
      ],
      deletedIds: [2]
    }))
    const deleteRecords = vi.fn(async () => {})
    const updateRecords = vi.fn(async () => ({ updatedCount: 1 }))
    const insertRecords = vi.fn(async () => ({ insertedCount: 1 }))
    const emitProgress = vi.fn()
    const context = { runId: 'reconcile' }
    let now = 100
    const service = new FileProviderReconciliationRunService({
      enterPerfContext: vi.fn(() => finishPerfContext),
      waitForIdle: vi.fn(async () => {}),
      getDbFiles,
      scanDirectory,
      reconcile,
      deleteRecords,
      updateRecords,
      insertRecords,
      emitProgress,
      yieldAfterDbRead: vi.fn(async () => {}),
      yieldAfterPathScan: vi.fn(async () => {}),
      now: () => {
        now += 20
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    const result = await service.execute(['/root'], context)

    expect(getDbFiles).toHaveBeenCalledWith(['/root'])
    expect(scanDirectory).toHaveBeenCalledWith('/root', undefined)
    expect(reconcile).toHaveBeenCalledWith(
      [
        expect.objectContaining({ path: '/root/update.txt', mtime: 3000 }),
        expect.objectContaining({ path: '/root/add.txt', mtime: 2000 })
      ],
      [
        { id: 1, path: '/root/update.txt', mtime: 1000 },
        { id: 2, path: '/root/delete.txt', mtime: 1000 }
      ],
      ['/root']
    )
    expect(deleteRecords).toHaveBeenCalledWith([{ id: 2, path: '/root/delete.txt' }], context)
    expect(updateRecords).toHaveBeenCalledWith(
      [
        {
          id: 1,
          path: '/root/update.txt',
          name: 'update.txt',
          extension: '.txt',
          size: 1,
          mtime: new Date(3000),
          ctime: new Date(1000),
          type: 'file',
          isDir: false
        }
      ],
      context
    )
    expect(insertRecords).toHaveBeenCalledWith(
      [
        {
          path: '/root/add.txt',
          name: 'add.txt',
          extension: '.txt',
          size: 1,
          mtime: 2000,
          ctime: 1000
        }
      ],
      context
    )
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 1)
    expect(emitProgress).toHaveBeenLastCalledWith(1, 1)
    expect(finishPerfContext).toHaveBeenCalledTimes(1)
    expect(result).toEqual({
      added: 1,
      changed: 1,
      deleted: 1,
      skipped: 0,
      completedPaths: ['/root']
    })
  })

  it('returns empty result without work for empty paths', async () => {
    const enterPerfContext = vi.fn()
    const service = new FileProviderReconciliationRunService({
      enterPerfContext,
      waitForIdle: vi.fn(),
      getDbFiles: vi.fn(),
      scanDirectory: vi.fn(),
      reconcile: vi.fn(),
      deleteRecords: vi.fn(),
      updateRecords: vi.fn(),
      insertRecords: vi.fn(),
      emitProgress: vi.fn(),
      yieldAfterDbRead: vi.fn(),
      yieldAfterPathScan: vi.fn(),
      now: () => 0,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logDebug: vi.fn()
    })

    await expect(service.execute([], {})).resolves.toEqual({
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      completedPaths: []
    })
    expect(enterPerfContext).not.toHaveBeenCalled()
  })
})
