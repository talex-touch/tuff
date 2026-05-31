import { describe, expect, it, vi } from 'vitest'
import { FileProviderCleanupDeleteService } from './file-provider-cleanup-delete-service'

describe('file-provider-cleanup-delete-service', () => {
  it('removes records outside watch roots and reports cleanup progress', async () => {
    const rows = [
      { id: 1, path: '/Users/me/Documents/a.txt' },
      { id: 2, path: '/Users/me/Old/b.txt' }
    ]
    const deleteRecords = vi.fn(async () => {})
    const removeSearchIndexItems = vi.fn(async () => {})
    const emitDelta = vi.fn(async () => {})
    const emitProgress = vi.fn()
    const logInfo = vi.fn()
    const logDebug = vi.fn()
    let now = 100
    const service = new FileProviderCleanupDeleteService({
      sourceId: 'file-provider',
      getAllIndexedFileRecords: async () => rows,
      isWithinWatchRoots: (filePath) => filePath.startsWith('/Users/me/Documents'),
      yieldAfterRead: async () => {},
      deleteRecords,
      removeSearchIndexItems,
      emitDelta,
      emitProgress,
      now: () => {
        now += 50
        return now
      },
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo,
      logDebug
    })

    const context = { runId: 'cleanup' }
    const result = await service.execute(context)

    expect(deleteRecords).toHaveBeenCalledWith([{ id: 2, path: '/Users/me/Old/b.txt' }])
    expect(removeSearchIndexItems).toHaveBeenCalledWith(['/Users/me/Old/b.txt'])
    expect(emitDelta).toHaveBeenCalledWith(
      {
        sourceId: 'file-provider',
        action: 'delete',
        stableKey: '/Users/me/Old/b.txt',
        path: '/Users/me/Old/b.txt',
        reason: 'file-provider-cleanup-delete'
      },
      context
    )
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 1)
    expect(emitProgress).toHaveBeenNthCalledWith(2, 1, 1)
    expect(logInfo).toHaveBeenCalledWith('Removing stale database entries', { removed: 1 })
    expect(logDebug).toHaveBeenCalledWith('Cleanup stage finished', {
      duration: '50ms',
      removed: 1
    })
    expect(result).toEqual({
      deleted: [{ id: 2, path: '/Users/me/Old/b.txt' }],
      deletedCount: 1
    })
  })

  it('skips delete operations when all records are still under watch roots', async () => {
    const deleteRecords = vi.fn()
    const removeSearchIndexItems = vi.fn()
    const emitDelta = vi.fn()
    const service = new FileProviderCleanupDeleteService({
      sourceId: 'file-provider',
      getAllIndexedFileRecords: async () => [{ id: 1, path: '/Users/me/Documents/a.txt' }],
      isWithinWatchRoots: (filePath) => filePath.startsWith('/Users/me/Documents'),
      yieldAfterRead: async () => {},
      deleteRecords,
      removeSearchIndexItems,
      emitDelta,
      emitProgress: vi.fn(),
      now: () => 100,
      formatDuration: (durationMs) => `${durationMs}ms`,
      logInfo: vi.fn(),
      logDebug: vi.fn()
    })

    await expect(service.execute({})).resolves.toEqual({
      deleted: [],
      deletedCount: 0
    })
    expect(deleteRecords).not.toHaveBeenCalled()
    expect(removeSearchIndexItems).not.toHaveBeenCalled()
    expect(emitDelta).not.toHaveBeenCalled()
  })
})
