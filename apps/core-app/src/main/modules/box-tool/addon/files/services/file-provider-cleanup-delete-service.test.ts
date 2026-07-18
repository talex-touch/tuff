import { describe, expect, it, vi } from 'vitest'
import { FileProviderCleanupDeleteService } from './file-provider-cleanup-delete-service'

function createService(overrides: Record<string, unknown> = {}) {
  return new FileProviderCleanupDeleteService({
    sourceId: 'file-provider',
    getIndexedFileRecordsPage: vi.fn(async () => []),
    isWithinWatchRoots: (filePath: string) => filePath.startsWith('/Users/me/Documents'),
    yieldAfterRead: vi.fn(async () => {}),
    deleteRecords: vi.fn(async () => {}),
    emitDelta: vi.fn(async () => {}),
    emitProgress: vi.fn(),
    now: () => 100,
    formatDuration: (durationMs: number) => `${durationMs}ms`,
    logInfo: vi.fn(),
    logDebug: vi.fn(),
    ...overrides
  })
}

describe('file-provider-cleanup-delete-service', () => {
  it('pages indexed rows by id and deletes only rows outside watch roots', async () => {
    const getIndexedFileRecordsPage = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 1, path: '/Users/me/Documents/a.txt' },
        { id: 2, path: '/Users/me/Old/b.txt' }
      ])
      .mockResolvedValueOnce([{ id: 5, path: '/Users/me/Old/c.txt' }])
      .mockResolvedValueOnce([])
    const deleteRecords = vi.fn(async () => {})
    const emitDelta = vi.fn(async () => {})
    const emitProgress = vi.fn()
    const service = createService({
      getIndexedFileRecordsPage,
      deleteRecords,
      emitDelta,
      emitProgress
    })
    const context = { runId: 'cleanup' }

    await expect(service.execute(context)).resolves.toEqual({ deletedCount: 2 })

    expect(getIndexedFileRecordsPage).toHaveBeenNthCalledWith(1, 0, 500, context)
    expect(getIndexedFileRecordsPage).toHaveBeenNthCalledWith(2, 2, 500, context)
    expect(getIndexedFileRecordsPage).toHaveBeenNthCalledWith(3, 5, 500, context)
    expect(deleteRecords).toHaveBeenNthCalledWith(1, [{ id: 2, path: '/Users/me/Old/b.txt' }])
    expect(deleteRecords).toHaveBeenNthCalledWith(2, [{ id: 5, path: '/Users/me/Old/c.txt' }])
    expect(emitDelta).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: 'delete', path: '/Users/me/Old/b.txt' }),
      context
    )
    expect(emitProgress).toHaveBeenNthCalledWith(1, 0, 1)
    expect(emitProgress).toHaveBeenLastCalledWith(1, 1)
  })

  it('does not report cleanup completion when cancellation interrupts page processing', async () => {
    const cancelled = new Error('cleanup cancelled')
    const emitProgress = vi.fn()
    const service = createService({
      getIndexedFileRecordsPage: vi.fn(async () => [{ id: 1, path: '/Users/me/Old/a.txt' }]),
      yieldAfterRead: vi.fn(async () => {
        throw cancelled
      }),
      emitProgress
    })

    await expect(service.execute({ runId: 'cleanup' })).rejects.toBe(cancelled)

    expect(emitProgress).toHaveBeenCalledWith(0, 1)
    expect(emitProgress).not.toHaveBeenCalledWith(1, 1)
  })

  it('returns zero deletions when every paged record remains owned', async () => {
    const deleteRecords = vi.fn()
    const emitDelta = vi.fn()
    const service = createService({
      getIndexedFileRecordsPage: vi
        .fn()
        .mockResolvedValueOnce([{ id: 1, path: '/Users/me/Documents/a.txt' }])
        .mockResolvedValueOnce([]),
      deleteRecords,
      emitDelta
    })

    await expect(service.execute({})).resolves.toEqual({ deletedCount: 0 })
    expect(deleteRecords).not.toHaveBeenCalled()
    expect(emitDelta).not.toHaveBeenCalled()
  })
})
