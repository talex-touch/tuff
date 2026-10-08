import { describe, expect, it } from 'vitest'
import {
  FileProviderCleanupDeleteService,
  type FileProviderCleanupDeleteDeps
} from './file-provider-cleanup-delete-service'

interface Row {
  id: number
  path: string
}

interface State {
  rows: Row[]
  cursor: number
  clock: number
  active: boolean
}

function cleanupHarness(
  state: State,
  options: {
    budget: number
    pageSize: number
    maxPages: number
    readCost?: number
    committedCost?: number
    afterRead?: () => void
    afterCommit?: () => void
    deleteRecords?: (records: Row[]) => Promise<{ deleted: Row[]; deferred: boolean }>
    deps?: Partial<FileProviderCleanupDeleteDeps<Row, undefined>>
  }
) {
  return new FileProviderCleanupDeleteService<Row, undefined>({
    sourceId: 'file-provider',
    roundBudgetMs: options.budget,
    pageSize: options.pageSize,
    maxPages: options.maxPages,
    getCursorKey: () => 'fixture-config',
    loadCursor: async () => state.cursor,
    saveCursor: async (_key, cursor) => {
      state.cursor = cursor
    },
    canContinue: () => state.active,
    getIndexedFileRecordsPage: async (afterId, limit) => {
      const page = state.rows.filter((row) => row.id > afterId).slice(0, limit)
      state.clock += options.readCost ?? 0
      options.afterRead?.()
      return page
    },
    isWithinWatchRoots: (path) => path.startsWith('/root/') || path.startsWith('/extra/'),
    isStaleIndexPath: (path) => path.includes('/filtered/'),
    deleteRecords:
      options.deleteRecords ??
      (async (records) => {
        const ids = new Set(records.map((row) => row.id))
        state.rows = state.rows.filter((row) => !ids.has(row.id))
        state.clock += options.committedCost ?? 0
        options.afterCommit?.()
        return { deleted: records, deferred: false }
      }),
    yieldAfterRead: async () => undefined,
    emitProgress: () => undefined,
    now: () => state.clock,
    formatDuration: (duration) => `${duration}ms`,
    logInfo: () => undefined,
    logDebug: () => undefined,
    ...options.deps
  })
}

describe('bounded file-provider cleanup', () => {
  it('removes only withdrawn-root and rule-excluded rows, retaining ordinary and extra watch roots', async () => {
    const state: State = {
      rows: [
        { id: 1, path: '/withdrawn/old.txt' },
        { id: 2, path: '/root/keep.txt' },
        { id: 3, path: '/root/filtered/old.txt' },
        { id: 4, path: '/extra/keep.txt' }
      ],
      cursor: 0,
      clock: 0,
      active: true
    }
    const service = cleanupHarness(state, { budget: 100, pageSize: 2, maxPages: 4 })
    const result = await service.execute(undefined)
    expect(state.rows).toEqual([
      { id: 2, path: '/root/keep.txt' },
      { id: 4, path: '/extra/keep.txt' }
    ])
    expect(result).toMatchObject({ deletedCount: 2, done: true, cursor: 0 })
  })

  it.each(['/withdrawn', '/root/filtered'])(
    'bounds %s cleanup by commit plus publication cost and resumes the remaining page',
    async (root) => {
      const state: State = {
        rows: Array.from({ length: 6 }, (_, index) => ({
          id: index + 1,
          path: `${root}/${index}.txt`
        })),
        cursor: 0,
        clock: 0,
        active: true
      }
      const options = { budget: 5, pageSize: 2, maxPages: 10, committedCost: 6 }
      const first = await cleanupHarness(state, options).execute(undefined)
      expect(first).toMatchObject({ deletedCount: 2, done: false, cursor: 2 })
      expect(state.rows.map((row) => row.id)).toEqual([3, 4, 5, 6])
      // A new producer instance uses only the persisted committed cursor.
      const second = await cleanupHarness(state, options).execute(undefined)
      expect(second).toMatchObject({ deletedCount: 2, done: false, cursor: 4 })
      expect(state.rows.map((row) => row.id)).toEqual([5, 6])
      const third = await cleanupHarness(state, { ...options, budget: 100 }).execute(undefined)
      expect(third).toMatchObject({ deletedCount: 2, done: true, cursor: 0 })
      expect(state.rows).toEqual([])
    }
  )

  it.each([
    { name: 'foreground arriving during enumeration', budget: 100, readCost: 0, interrupt: true },
    {
      name: 'candidate enumeration consuming the round budget',
      budget: 5,
      readCost: 5,
      interrupt: false
    }
  ])(
    'does not commit or advance the cursor after $name',
    async ({ budget, readCost, interrupt }) => {
      const rows = [{ id: 1, path: '/withdrawn/old.txt' }]
      const state: State = { rows: [...rows], cursor: 0, clock: 0, active: true }
      const result = await cleanupHarness(state, {
        budget,
        pageSize: 1,
        maxPages: 4,
        readCost,
        afterRead: () => {
          if (interrupt) state.active = false
        }
      }).execute(undefined)
      expect(result).toMatchObject({ deletedCount: 0, done: false, cursor: 0 })
      expect(state.cursor).toBe(0)
      expect(state.rows).toEqual(rows)
    }
  )

  it('ends the round after one committed page when foreground activity arrives at publication', async () => {
    const state: State = {
      rows: Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        path: `/withdrawn/${index}.txt`
      })),
      cursor: 0,
      clock: 0,
      active: true
    }
    const first = await cleanupHarness(state, {
      budget: 100,
      pageSize: 2,
      maxPages: 10,
      afterCommit: () => {
        state.active = false
      }
    }).execute(undefined)
    expect(first).toMatchObject({ deletedCount: 2, done: false, cursor: 2 })
    expect(state.rows.map((row) => row.id)).toEqual([3, 4])
    state.active = true
    const resumed = await cleanupHarness(state, { budget: 100, pageSize: 2, maxPages: 10 }).execute(
      undefined
    )
    expect(resumed).toMatchObject({ deletedCount: 2, done: true, cursor: 0 })
    expect(state.rows).toEqual([])
  })

  it('does not advance recovery while commit publication remains pending', async () => {
    const rows = [{ id: 1, path: '/withdrawn/old.txt' }]
    const state: State = { rows: [...rows], cursor: 0, clock: 0, active: true }
    const committed = Promise.withResolvers<void>()
    const published = Promise.withResolvers<void>()
    const operation = cleanupHarness(state, {
      budget: 100,
      pageSize: 1,
      maxPages: 1,
      deleteRecords: async (records) => {
        state.rows = []
        committed.resolve()
        await published.promise
        return { deleted: records, deferred: false }
      }
    }).execute(undefined)
    try {
      await committed.promise
      expect(state.cursor).toBe(0)
      published.resolve()
      expect(await operation).toMatchObject({ deletedCount: 1, cursor: 1 })
      expect(state.cursor).toBe(1)
    } finally {
      published.resolve()
      await operation
    }
  })

  it('retains the current page after a late admission deferral and retries it on the next round', async () => {
    const rows = [{ id: 1, path: '/withdrawn/old.txt' }]
    const state: State = { rows: [...rows], cursor: 0, clock: 0, active: true }
    const first = await cleanupHarness(state, {
      budget: 100,
      pageSize: 1,
      maxPages: 2,
      deleteRecords: async () => ({ deleted: [], deferred: true })
    }).execute(undefined)
    expect(first).toMatchObject({ deletedCount: 0, done: false, cursor: 0 })
    expect(state.rows).toEqual(rows)
    const resumed = await cleanupHarness(state, { budget: 100, pageSize: 1, maxPages: 2 }).execute(
      undefined
    )
    expect(resumed).toMatchObject({ deletedCount: 1, done: true })
    expect(state.rows).toEqual([])
  })

  it('leaves a failing transaction page eligible instead of reporting its candidates as deleted', async () => {
    const rows = [{ id: 1, path: '/withdrawn/old.txt' }]
    const state: State = { rows: [...rows], cursor: 0, clock: 0, active: true }
    const failure = new Error('transaction failed')
    await expect(
      cleanupHarness(state, {
        budget: 100,
        pageSize: 1,
        maxPages: 2,
        deleteRecords: async () => {
          throw failure
        }
      }).execute(undefined)
    ).rejects.toBe(failure)
    expect(state.cursor).toBe(0)
    expect(state.rows).toEqual(rows)
    expect(
      (await cleanupHarness(state, { budget: 100, pageSize: 1, maxPages: 2 }).execute(undefined))
        .deletedCount
    ).toBe(1)
    expect(state.rows).toEqual([])
  })

  it('bounds candidate enumeration even when no row is eligible for deletion', async () => {
    const state: State = {
      rows: Array.from({ length: 6 }, (_, index) => ({
        id: index + 1,
        path: `/root/${index}.txt`
      })),
      cursor: 0,
      clock: 0,
      active: true
    }
    const result = await cleanupHarness(state, { budget: 100, pageSize: 2, maxPages: 2 }).execute(
      undefined
    )
    expect(result).toMatchObject({ deletedCount: 0, done: false, cursor: 4 })
    expect(state.rows.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('reports only actually deleted rows when the version fence preserves a candidate', async () => {
    const state: State = {
      rows: [
        { id: 1, path: '/withdrawn/old.txt' },
        { id: 2, path: '/withdrawn/recreated.txt' }
      ],
      cursor: 0,
      clock: 0,
      active: true
    }
    const result = await cleanupHarness(state, {
      budget: 100,
      pageSize: 2,
      maxPages: 1,
      deleteRecords: async (records) => {
        const deleted = records.filter((record) => record.id === 1)
        state.rows = state.rows.filter((record) => record.id !== 1)
        return { deleted, deferred: false }
      }
    }).execute(undefined)
    expect(result).toMatchObject({ deletedCount: 1, cursor: 2 })
    expect(state.rows).toEqual([{ id: 2, path: '/withdrawn/recreated.txt' }])
  })

  it('caps an explicitly oversized page so a single deletion transaction stays bounded', async () => {
    const state: State = {
      rows: Array.from({ length: 70 }, (_, index) => ({
        id: index + 1,
        path: `/withdrawn/${index}.txt`
      })),
      cursor: 0,
      clock: 0,
      active: true
    }
    const result = await cleanupHarness(state, { budget: 100, pageSize: 100, maxPages: 1 }).execute(
      undefined
    )
    expect(result).toMatchObject({ deletedCount: 64, done: false, cursor: 64 })
    expect(state.rows.map((row) => row.id)).toEqual([65, 66, 67, 68, 69, 70])
  })

  it('saves the committed page under its original configuration key when configuration changes during publication', async () => {
    const state: State = {
      rows: [
        { id: 1, path: '/withdrawn/old.txt' },
        { id: 2, path: '/withdrawn/remaining.txt' }
      ],
      cursor: 0,
      clock: 0,
      active: true
    }
    const cursors: Record<string, number> = { original: 0, replacement: 0 }
    let key = 'original'
    const result = await cleanupHarness(state, {
      budget: 100,
      pageSize: 1,
      maxPages: 1,
      afterCommit: () => {
        key = 'replacement'
      },
      deps: {
        getCursorKey: () => key,
        loadCursor: async (owner) => cursors[owner],
        saveCursor: async (owner, cursor) => {
          cursors[owner] = cursor
        }
      }
    }).execute(undefined)
    expect(result).toMatchObject({ deletedCount: 1, cursor: 1 })
    expect(cursors).toEqual({ original: 1, replacement: 0 })
    expect(state.rows).toEqual([{ id: 2, path: '/withdrawn/remaining.txt' }])
  })
})

describe('current rule evidence during cleanup enumeration', () => {
  it('keeps a known-allowed rule path while committing other known withdrawn-root records', async () => {
    const state: State = {
      rows: [
        { id: 1, path: '/root/filtered/now-allowed.txt' },
        { id: 2, path: '/withdrawn/old.txt' }
      ],
      cursor: 0,
      clock: 0,
      active: true
    }
    const result = await cleanupHarness(state, {
      budget: 100,
      pageSize: 2,
      maxPages: 1,
      deps: { isStaleIndexPath: async () => false }
    }).execute(undefined)
    expect(result).toMatchObject({ deletedCount: 1, cursor: 2 })
    expect(state.rows).toEqual([{ id: 1, path: '/root/filtered/now-allowed.txt' }])
  })

  it('does not delete any page member or advance recovery when a later path has unknown rule evidence', async () => {
    const rows = [
      { id: 1, path: '/withdrawn/known-candidate.txt' },
      { id: 2, path: '/root/filtered/uncertain.txt' },
      { id: 3, path: '/withdrawn/another-candidate.txt' }
    ]
    const state: State = { rows: [...rows], cursor: 0, clock: 0, active: true }
    const result = await cleanupHarness(state, {
      budget: 100,
      pageSize: 3,
      maxPages: 2,
      deps: { isStaleIndexPath: async () => null }
    }).execute(undefined)
    expect(result).toMatchObject({ deletedCount: 0, done: false, cursor: 0 })
    expect(state.cursor).toBe(0)
    expect(state.rows).toEqual(rows)
  })

  it('charges asynchronous rule evidence to the round budget before committing its candidates', async () => {
    const rows = [{ id: 1, path: '/root/filtered/candidate.txt' }]
    const state: State = { rows: [...rows], cursor: 0, clock: 0, active: true }
    const result = await cleanupHarness(state, {
      budget: 5,
      pageSize: 1,
      maxPages: 2,
      deps: {
        isStaleIndexPath: async () => {
          state.clock += 6
          return true
        }
      }
    }).execute(undefined)
    expect(result).toMatchObject({ deletedCount: 0, done: false, cursor: 0 })
    expect(state.rows).toEqual(rows)
  })
})
