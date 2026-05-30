import { describe, expect, it, vi } from 'vitest'
import { IndexedWriteDeleteExecutorService } from './indexing-write-delete-executor-service'

describe('indexing-write-delete-executor-service', () => {
  it('normalizes paths, deletes existing records, removes search index items, and logs count', async () => {
    const existing = [
      { id: 1, path: '/tmp/a.txt' },
      { id: 2, path: '/tmp/b.txt' }
    ]
    const findExisting = vi.fn(async () => existing)
    const deleteRecords = vi.fn(async () => {})
    const removeSearchIndexItems = vi.fn(async () => {})
    const logDebug = vi.fn()
    const service = new IndexedWriteDeleteExecutorService({
      normalizePath: (rawPath) => rawPath.toLowerCase(),
      findExisting,
      deleteRecords,
      removeSearchIndexItems,
      logDebug,
      successMessage: 'test delete completed'
    })

    const result = await service.execute(['/TMP/A.txt', '/tmp/a.txt', '/TMP/B.txt'])

    expect(findExisting).toHaveBeenCalledWith(['/tmp/a.txt', '/tmp/b.txt'])
    expect(deleteRecords).toHaveBeenCalledWith(existing)
    expect(removeSearchIndexItems).toHaveBeenCalledWith(['/tmp/a.txt', '/tmp/b.txt'])
    expect(logDebug).toHaveBeenCalledWith('test delete completed', { removed: 2 })
    expect(result).toEqual({
      deleted: existing,
      deletedIds: [1, 2],
      deletedPaths: ['/tmp/a.txt', '/tmp/b.txt']
    })
  })

  it('skips delete and search-index removal when no existing records match', async () => {
    const deleteRecords = vi.fn()
    const removeSearchIndexItems = vi.fn()
    const service = new IndexedWriteDeleteExecutorService({
      normalizePath: (rawPath) => rawPath,
      findExisting: async () => [],
      deleteRecords,
      removeSearchIndexItems,
      logDebug: vi.fn()
    })

    await expect(service.execute(['/tmp/missing.txt'])).resolves.toEqual({
      deleted: [],
      deletedIds: [],
      deletedPaths: []
    })
    expect(deleteRecords).not.toHaveBeenCalled()
    expect(removeSearchIndexItems).not.toHaveBeenCalled()
  })

  it('can delete already resolved records without looking them up again', async () => {
    const existing = [{ id: 3, path: '/tmp/c.txt' }]
    const findExisting = vi.fn()
    const deleteRecords = vi.fn(async () => {})
    const removeSearchIndexItems = vi.fn(async () => {})
    const service = new IndexedWriteDeleteExecutorService({
      normalizePath: (rawPath) => rawPath,
      findExisting,
      deleteRecords,
      removeSearchIndexItems,
      logDebug: vi.fn()
    })

    await expect(service.executeExisting(existing)).resolves.toEqual({
      deleted: existing,
      deletedIds: [3],
      deletedPaths: ['/tmp/c.txt']
    })
    expect(findExisting).not.toHaveBeenCalled()
    expect(deleteRecords).toHaveBeenCalledWith(existing)
    expect(removeSearchIndexItems).toHaveBeenCalledWith(['/tmp/c.txt'])
  })
})
