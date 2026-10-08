import { describe, expect, it } from 'vitest'
import type { ScannedFileInfo } from '../types'
import {
  FileProviderReconciliationRunService,
  type FileProviderReconciliationDbRecord,
  type FileProviderReconciliationRunDeps
} from './file-provider-reconciliation-run-service'

function scannedFile(path: string): ScannedFileInfo {
  return {
    path,
    name: path.split('/').at(-1)!,
    extension: '.txt',
    size: 1,
    ctime: new Date(1_000),
    mtime: new Date(2_000)
  }
}

interface State {
  rows: FileProviderReconciliationDbRecord[]
  seen: Set<string>
  active: boolean
}

function reconciliationHarness(
  state: State,
  options: {
    batches: ScannedFileInfo[][]
    stats: { errorCount: number } | null
    scanFailure?: Error
    finishDone?: boolean
    deferral?: string
    deps?: Partial<FileProviderReconciliationRunDeps<undefined>>
  }
) {
  const deps: FileProviderReconciliationRunDeps<undefined> = {
    enterPerfContext: () => () => undefined,
    waitForIdle: async () => undefined,
    assertActive: () => {
      if (!state.active) throw new Error('reconciliation cancelled')
    },
    getDbFilesByPaths: async (paths) => state.rows.filter((row) => paths.includes(row.path)),
    scanDirectory: async function* (_root, _excluded, _context, onStats) {
      for (const batch of options.batches) {
        for (const file of batch) state.seen.add(file.path)
        yield batch
      }
      if (options.scanFailure) throw options.scanFailure
      if (options.stats)
        onStats({ entryCount: state.seen.size, errorCount: options.stats.errorCount })
    },
    hasRootRows: async (root) => state.rows.some((row) => row.path.startsWith(`${root}/`)),
    getDeferralReason: () => options.deferral ?? null,
    reconcile: async () => ({ filesToAdd: [], filesToUpdate: [], deletedIds: [] }),
    finishMissingScan: async (root) => {
      const deleted = state.rows.filter(
        (row) => row.path.startsWith(`${root}/`) && !state.seen.has(row.path)
      )
      const ids = new Set(deleted.map((row) => row.id))
      state.rows = state.rows.filter((row) => !ids.has(row.id))
      return { deletedCount: deleted.length, done: options.finishDone ?? true }
    },
    updateRecords: async () => ({ updatedCount: 0 }),
    insertRecords: async () => ({ insertedCount: 0 }),
    emitProgress: () => undefined,
    yieldAfterDbRead: async () => undefined,
    yieldAfterPathScan: async () => undefined,
    now: () => 0,
    formatDuration: (duration) => `${duration}ms`,
    logDebug: () => undefined,
    logWarn: () => undefined,
    ...options.deps
  }
  return new FileProviderReconciliationRunService(deps)
}

function indexedRow(id: number, path: string): FileProviderReconciliationDbRecord {
  return {
    id,
    path,
    mtime: new Date(1_000),
    ctime: new Date(1_000),
    size: 1,
    lastIndexedAt: new Date(1_000)
  }
}

describe('reconciliation scan evidence and committed progress', () => {
  it.each([
    {
      name: 'one missing row after a permission error',
      missing: 1,
      stats: { errorCount: 1 },
      empty: false
    },
    {
      name: 'half the root missing after a scan error',
      missing: 50,
      stats: { errorCount: 1 },
      empty: false
    },
    {
      name: 'most of the root missing after a scan error',
      missing: 51,
      stats: { errorCount: 1 },
      empty: false
    },
    { name: 'no scan completion evidence', missing: 1, stats: null, empty: false },
    { name: 'an empty scan over indexed rows', missing: 1, stats: { errorCount: 0 }, empty: true }
  ])(
    'preserves indexed rows and incomplete-root progress for $name',
    async ({ missing, stats, empty }) => {
      const rows = Array.from({ length: missing }, (_, index) =>
        indexedRow(index + 1, `/root/missing-${index}.txt`)
      )
      // Include observed rows so changing the missing fraction cannot accidentally become a
      // substitute for scan quality. The destructive fake would remove every missing row if called.
      if (!empty) rows.push(indexedRow(100, '/root/seen.txt'))
      const state: State = { rows: [...rows], seen: new Set<string>(), active: true }
      const result = await reconciliationHarness(state, {
        batches: empty ? [] : [[scannedFile('/root/seen.txt')]],
        stats
      }).execute(['/root'], undefined)
      expect(result.deleted).toBe(0)
      expect(result.completedPaths).toEqual([])
      expect(state.rows).toEqual(rows)
    }
  )

  it('allows missing-row deletion only after a clean completed scan and preserves seen rows', async () => {
    const state: State = {
      rows: [
        indexedRow(1, '/root/seen.txt'),
        indexedRow(2, '/root/missing.txt'),
        indexedRow(3, '/other/keep.txt')
      ],
      seen: new Set<string>(),
      active: true
    }
    const result = await reconciliationHarness(state, {
      batches: [[scannedFile('/root/seen.txt')]],
      stats: { errorCount: 0 }
    }).execute(['/root'], undefined)
    expect(result.deleted).toBe(1)
    expect(result.completedPaths).toEqual(['/root'])
    expect(state.rows.map((row) => row.path)).toEqual(['/root/seen.txt', '/other/keep.txt'])
  })

  it('does not publish root completion until the missing-row maintenance reports all slices done', async () => {
    const state: State = {
      rows: [indexedRow(1, '/root/missing.txt')],
      seen: new Set<string>(),
      active: true
    }
    const result = await reconciliationHarness(state, {
      batches: [[scannedFile('/root/seen.txt')]],
      stats: { errorCount: 0 },
      finishDone: false
    }).execute(['/root'], undefined)
    expect(result.deleted).toBe(1)
    expect(result.completedPaths).toEqual([])
    expect(state.rows).toEqual([])
  })

  it('retains missing records when a scanner throws after yielding a partial batch', async () => {
    const rows = [indexedRow(1, '/root/missing.txt')]
    const state: State = { rows: [...rows], seen: new Set<string>(), active: true }
    const failure = new Error('offline volume')
    await expect(
      reconciliationHarness(state, {
        batches: [[scannedFile('/root/seen.txt')]],
        stats: { errorCount: 0 },
        scanFailure: failure
      }).execute(['/root'], undefined)
    ).rejects.toBe(failure)
    expect(state.rows).toEqual(rows)
  })

  it('does not enter destructive reconciliation while path normalization is still pending', async () => {
    const rows = [indexedRow(1, '/root/legacy.txt')]
    const state: State = { rows: [...rows], seen: new Set<string>(), active: true }
    const result = await reconciliationHarness(state, {
      batches: [[scannedFile('/root/seen.txt')]],
      stats: { errorCount: 0 },
      deferral: 'path-normalization-pending'
    }).execute(['/root'], undefined)
    expect(result).toEqual({ added: 0, changed: 0, deleted: 0, skipped: 0, completedPaths: [] })
    expect(state.rows).toEqual(rows)
    expect([...state.seen]).toEqual([])
  })

  it('ignores deletion suggestions from a partial disk batch until scan-quality evidence exists', async () => {
    const rows = [indexedRow(1, '/root/missing.txt')]
    const state: State = { rows: [...rows], seen: new Set<string>(), active: true }
    const result = await reconciliationHarness(state, {
      batches: [[scannedFile('/root/seen.txt')]],
      stats: null,
      deps: { reconcile: async () => ({ filesToAdd: [], filesToUpdate: [], deletedIds: [1] }) }
    }).execute(['/root'], undefined)
    expect(result.deleted).toBe(0)
    expect(state.rows).toEqual(rows)
  })

  it('persists streamed additions and updates before recording the root as complete', async () => {
    const state: State = {
      rows: [indexedRow(1, '/root/update.txt')],
      seen: new Set<string>(),
      active: true
    }
    const result = await reconciliationHarness(state, {
      batches: [[scannedFile('/root/update.txt')], [scannedFile('/root/add.txt')]],
      stats: { errorCount: 0 },
      deps: {
        reconcile: async (disk, existing) => ({
          filesToAdd: disk.filter((file) => !existing.some((row) => row.path === file.path)),
          filesToUpdate: disk.flatMap((file) => {
            const row = existing.find((candidate) => candidate.path === file.path)
            return row ? [{ ...file, id: row.id }] : []
          }),
          deletedIds: []
        }),
        updateRecords: async (records) => {
          for (const record of records) {
            const row = state.rows.find((candidate) => candidate.id === record.id)!
            row.mtime = record.mtime
          }
          return { updatedCount: records.length }
        },
        insertRecords: async (records) => {
          for (const record of records) {
            state.rows.push({ ...indexedRow(2, record.path), mtime: new Date(record.mtime) })
          }
          return { insertedCount: records.length }
        }
      }
    }).execute(['/root'], undefined)
    expect(result).toMatchObject({ added: 1, changed: 1, deleted: 0, completedPaths: ['/root'] })
    expect(state.rows.map((row) => ({ path: row.path, mtime: row.mtime }))).toEqual([
      { path: '/root/update.txt', mtime: new Date(2_000) },
      { path: '/root/add.txt', mtime: new Date(2_000) }
    ])
  })
})
