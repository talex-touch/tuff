import { describe, expect, it, vi } from 'vitest'
import { FileProviderCleanupDeleteService } from './file-provider-cleanup-delete-service'

interface Row {
  id: number
  path: string
}

function createService(input: {
  rows: Row[]
  isWithinWatchRoots: (path: string) => boolean
  isStaleIndexPath?: (path: string) => boolean
  staleDeleteBudgetMs?: number
  /** Milliseconds each delete call appears to take. */
  deleteCostMs?: number
}) {
  let clock = 0
  const deleteRecords = vi.fn<(records: Row[]) => Promise<void>>(async () => {
    clock += input.deleteCostMs ?? 0
  })
  const emitDelta = vi.fn(async () => undefined)
  const service = new FileProviderCleanupDeleteService<Row, { runId: string }>({
    sourceId: 'file-provider',
    getIndexedFileRecordsPage: async (afterId, limit) =>
      input.rows.filter((row) => row.id > afterId).slice(0, limit),
    isWithinWatchRoots: input.isWithinWatchRoots,
    isStaleIndexPath: input.isStaleIndexPath,
    staleDeleteBudgetMs: input.staleDeleteBudgetMs,
    yieldAfterRead: async () => undefined,
    deleteRecords,
    emitDelta,
    emitProgress: vi.fn(),
    now: () => clock,
    formatDuration: (durationMs) => `${durationMs}ms`,
    logInfo: vi.fn(),
    logDebug: vi.fn()
  })
  return { service, deleteRecords }
}

/**
 * The cleanup pass used to remove only rows outside the watch roots. A rule that arrives after
 * rows were indexed (the home-anchored `~/go/pkg` exclusion, 222k rows on the 2026-09-26 dev
 * profile) needs the same paged, yielding pass, so the pass also asks whether a row would still be
 * admitted today.
 */
describe('FileProviderCleanupDeleteService stale rows', () => {
  it('removes rows that a current traversal rule excludes, alongside root-less rows', async () => {
    const rows: Row[] = [
      { id: 1, path: '/Users/u/go/pkg/mod/a.go' },
      { id: 2, path: '/Users/u/Documents/keep.md' },
      { id: 3, path: '/Volumes/gone/old.txt' }
    ]
    const { service, deleteRecords } = createService({
      rows,
      isWithinWatchRoots: (path) => path.startsWith('/Users/u/'),
      isStaleIndexPath: (path) => path.includes('/go/pkg/')
    })
    const result = await service.execute({ runId: 'cleanup' })
    expect(result.deletedCount).toBe(2)
    expect(deleteRecords).toHaveBeenCalledTimes(1)
    expect(deleteRecords.mock.calls[0]![0]).toEqual([rows[0], rows[2]])
  })

  it('keeps the old behaviour when no stale predicate is supplied', async () => {
    const rows: Row[] = [
      { id: 1, path: '/Users/u/go/pkg/mod/a.go' },
      { id: 2, path: '/Volumes/gone/old.txt' }
    ]
    const { service, deleteRecords } = createService({
      rows,
      isWithinWatchRoots: (path) => path.startsWith('/Users/u/')
    })
    const result = await service.execute({ runId: 'cleanup' })
    expect(result.deletedCount).toBe(1)
    expect(result.stalePendingCount).toBe(0)
    expect(deleteRecords.mock.calls[0]![0]).toEqual([rows[1]])
  })

  it('stops removing stale rows once the budget is spent, but still removes root-less rows', async () => {
    // 1200 rows over three pages: the first page's stale deletes cost 10s, past an 8s budget.
    const rows: Row[] = Array.from({ length: 1200 }, (_, index) => ({
      id: index + 1,
      path: index === 1100 ? '/Volumes/gone/old.txt' : `/Users/u/go/pkg/mod/${index}.go`
    }))
    const { service, deleteRecords } = createService({
      rows,
      isWithinWatchRoots: (path) => path.startsWith('/Users/u/'),
      isStaleIndexPath: (path) => path.includes('/go/pkg/'),
      staleDeleteBudgetMs: 8_000,
      deleteCostMs: 10_000
    })
    const result = await service.execute({ runId: 'cleanup' })
    // Page 1: 500 stale rows removed (budget not yet known to be spent). Pages 2–3: only the
    // root-less row goes; the remaining 699 stale rows wait for the next boot.
    expect(deleteRecords).toHaveBeenCalledTimes(2)
    expect(deleteRecords.mock.calls[0]![0]).toHaveLength(500)
    expect(deleteRecords.mock.calls[1]![0]).toEqual([rows[1100]])
    expect(result.deletedCount).toBe(501)
    expect(result.stalePendingCount).toBe(699)
  })
})
