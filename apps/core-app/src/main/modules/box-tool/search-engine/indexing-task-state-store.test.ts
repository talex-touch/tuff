import type { IndexedSourceRuntimeTaskState } from '@talex-touch/utils/search'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MemoryIndexingTaskStateStore,
  SqliteIndexingTaskStateStore
} from './indexing-task-state-store'

vi.mock('../../../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    schedule: vi.fn(async (_label: string, operation: () => Promise<unknown>) => operation())
  }
}))

vi.mock('../../../db/sqlite-retry', () => ({
  withSqliteRetry: vi.fn(async (operation: () => Promise<unknown>) => operation())
}))

describe('IndexingTaskStateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps memory task states isolated from caller mutation', async () => {
    const store = new MemoryIndexingTaskStateStore()
    const state = {
      lastScan: {
        startedAt: 1,
        completedAt: 2,
        batches: 1,
        records: 2,
        indexedRecords: 2
      },
      recentTasks: [
        {
          kind: 'scan',
          status: 'succeeded',
          startedAt: 1,
          completedAt: 2,
          summary: {
            records: 2,
            phase: 'scan',
            skipped: false,
            badObject: { nested: true },
            badArray: ['nested'],
            badNumber: Number.NaN
          }
        }
      ]
    } as unknown as IndexedSourceRuntimeTaskState

    await store.save('file-provider', state)
    state.recentTasks?.push({
      kind: 'scan',
      status: 'failed',
      startedAt: 3,
      completedAt: 4
    })
    if (state.recentTasks?.[0]?.summary) {
      state.recentTasks[0].summary.records = 99
    }

    const loaded = await store.load('file-provider')
    expect(loaded).toMatchObject({
      recentTasks: [
        {
          kind: 'scan',
          status: 'succeeded',
          summary: {
            records: 2,
            phase: 'scan',
            skipped: false
          }
        }
      ]
    })
    if (loaded?.recentTasks?.[0]?.summary) {
      loaded.recentTasks[0].summary.records = 123
    }
    await expect(store.load('file-provider')).resolves.toMatchObject({
      recentTasks: [
        {
          summary: {
            records: 2,
            phase: 'scan',
            skipped: false
          }
        }
      ]
    })
  })

  it('keeps memory last task snapshots isolated from loaded caller mutation', async () => {
    const store = new MemoryIndexingTaskStateStore()
    await store.save('file-provider', {
      lastScan: {
        startedAt: 1,
        completedAt: 2,
        batches: 1,
        records: 2,
        indexedRecords: 2
      },
      lastWatch: {
        occurredAt: 3,
        completedAt: 4,
        action: 'change',
        path: '/tmp/a.txt',
        deltas: 1,
        appliedDeltas: 1,
        failedDeltas: 0
      },
      lastReconcile: {
        startedAt: 5,
        completedAt: 6,
        added: 1,
        changed: 2,
        deleted: 3,
        skipped: 4,
        errors: 0
      },
      lastReset: {
        startedAt: 7,
        completedAt: 8,
        reason: 'manual-rebuild',
        clearedSearchIndex: true,
        clearedScanProgress: false
      }
    })

    const loaded = await store.load('file-provider')
    if (loaded?.lastScan) {
      loaded.lastScan.records = 99
    }
    if (loaded?.lastWatch) {
      loaded.lastWatch.path = '/tmp/mutated.txt'
    }
    if (loaded?.lastReconcile) {
      loaded.lastReconcile.added = 99
    }
    if (loaded?.lastReset) {
      loaded.lastReset.clearedSearchIndex = false
    }

    await expect(store.load('file-provider')).resolves.toMatchObject({
      lastScan: {
        records: 2
      },
      lastWatch: {
        path: '/tmp/a.txt'
      },
      lastReconcile: {
        added: 1
      },
      lastReset: {
        clearedSearchIndex: true
      }
    })
  })

  it('sanitizes memory task states before storing them', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const store = new MemoryIndexingTaskStateStore()

    await store.save('file-provider', {
      lastScan: {
        startedAt: 1_200,
        completedAt: 1_100,
        queuedAt: 1_300,
        batches: -1,
        records: -2,
        indexedRecords: 3
      },
      recentTasks: [
        {
          kind: 'scan',
          status: 'failed',
          completedAt: 1_200,
          jobId: 'future'
        },
        {
          kind: 'scan',
          status: 'failed',
          completedAt: 900,
          queuedAt: 1_100,
          jobId: 'valid'
        }
      ]
    })

    await expect(store.load('file-provider')).resolves.toEqual({
      lastScan: {
        startedAt: 1_000,
        completedAt: 1_000,
        queuedAt: 1_000,
        batches: 0,
        records: 0,
        indexedRecords: 3
      },
      recentTasks: [
        {
          kind: 'scan',
          status: 'failed',
          completedAt: 900,
          queuedAt: 1_000,
          jobId: 'valid'
        }
      ]
    })

    nowSpy.mockRestore()
  })

  it('persists and loads task state through sqlite', async () => {
    const selectLimit = vi.fn(async () => [
      {
        stateJson: JSON.stringify({
          lastScan: {
            startedAt: 1,
            completedAt: 2,
            batches: 1,
            records: 2,
            indexedRecords: 2
          },
          recentTasks: [
            {
              kind: 'scan',
              status: 'succeeded',
              completedAt: 2
            }
          ]
        })
      }
    ])
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit
          }))
        }))
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(async () => {})
        }))
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => {})
      }))
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    await expect(store.load('file-provider')).resolves.toMatchObject({
      lastScan: {
        records: 2
      },
      recentTasks: [
        {
          kind: 'scan',
          status: 'succeeded'
        }
      ]
    })
    await store.save('file-provider', {
      recentTasks: [
        {
          kind: 'reset',
          status: 'skipped',
          completedAt: 5
        }
      ]
    })

    expect(db.run).toHaveBeenCalled()
    expect(db.select).toHaveBeenCalled()
    expect(db.insert).toHaveBeenCalled()
  })

  it('sanitizes sqlite task states before persisting them', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    let persisted: { stateJson: string } | undefined
    const values = vi.fn((input: unknown) => {
      persisted = input as { stateJson: string }
      return {
        onConflictDoUpdate: vi.fn(async () => {})
      }
    })
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(),
      insert: vi.fn(() => ({
        values
      })),
      delete: vi.fn()
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    await store.save('file-provider', {
      lastWatch: {
        occurredAt: 900,
        completedAt: 800,
        queuedAt: 1_100,
        action: 'change',
        path: '/tmp/a.txt',
        deltas: -1,
        appliedDeltas: 2,
        failedDeltas: -3
      },
      recentTasks: [
        {
          kind: 'watch',
          status: 'failed',
          completedAt: 1_200,
          jobId: 'future'
        },
        {
          kind: 'watch',
          status: 'failed',
          completedAt: 900,
          occurredAt: 950,
          queuedAt: 1_100,
          jobId: 'valid',
          summary: {
            action: 'change',
            nested: { bad: true },
            invalidNumber: Number.POSITIVE_INFINITY,
            skipped: false
          } as never
        }
      ]
    })

    expect(values).toHaveBeenCalledTimes(1)
    expect(persisted).toBeDefined()
    expect(JSON.parse(persisted?.stateJson ?? '{}')).toEqual({
      lastWatch: {
        occurredAt: 800,
        completedAt: 800,
        queuedAt: 1_000,
        action: 'change',
        path: '/tmp/a.txt',
        deltas: 0,
        appliedDeltas: 2,
        failedDeltas: 0
      },
      recentTasks: [
        {
          kind: 'watch',
          status: 'failed',
          completedAt: 900,
          occurredAt: 900,
          queuedAt: 1_000,
          jobId: 'valid',
          summary: {
            action: 'change',
            skipped: false
          }
        }
      ]
    })

    nowSpy.mockRestore()
  })

  it('sanitizes persisted sqlite task history before exposing diagnostics state', async () => {
    const selectLimit = vi.fn(async () => [
      {
        stateJson: JSON.stringify({
          lastScan: {
            startedAt: 1,
            completedAt: 2,
            batches: 1,
            records: 2,
            indexedRecords: 2
          },
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 10,
              error: 'scanner failed'
            },
            {
              kind: 'unknown',
              status: 'failed',
              completedAt: 11
            },
            {
              kind: 'scan',
              status: 'failed'
            },
            'not-a-task'
          ]
        })
      }
    ])
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit
          }))
        }))
      })),
      insert: vi.fn(),
      delete: vi.fn()
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    await expect(store.load('file-provider')).resolves.toMatchObject({
      lastScan: {
        records: 2
      },
      recentTasks: [
        {
          kind: 'scan',
          status: 'failed',
          completedAt: 10
        }
      ]
    })
  })

  it('sanitizes persisted sqlite last task snapshots before exposing diagnostics state', async () => {
    const selectLimit = vi.fn(async () => [
      {
        stateJson: JSON.stringify({
          lastScan: {
            startedAt: 1,
            completedAt: 2,
            batches: 'bad',
            records: 4,
            indexedRecords: 3,
            phase: 'full-scan',
            error: 123
          },
          lastWatch: {
            occurredAt: 3,
            completedAt: 4,
            action: 'change',
            path: '/tmp/a.txt',
            deltas: 2,
            appliedDeltas: 1,
            failedDeltas: 'bad',
            skippedDeltas: 1
          },
          lastReconcile: {
            startedAt: 5,
            completedAt: 6,
            added: 1,
            changed: 'bad',
            deleted: 2,
            skipped: 0,
            errors: 0,
            rootCount: 2
          },
          lastReset: {
            startedAt: 7,
            completedAt: 8,
            reason: 'integrity-repair',
            clearedSearchIndex: true,
            clearedSearchIndexRows: 2,
            clearedScanProgress: true,
            scanProgressRows: 1
          }
        })
      }
    ])
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit
          }))
        }))
      })),
      insert: vi.fn(),
      delete: vi.fn()
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    await expect(store.load('file-provider')).resolves.toMatchObject({
      lastScan: {
        startedAt: 1,
        completedAt: 2,
        batches: 0,
        records: 4,
        indexedRecords: 3,
        phase: 'full-scan'
      },
      lastWatch: {
        occurredAt: 3,
        completedAt: 4,
        action: 'change',
        path: '/tmp/a.txt',
        deltas: 2,
        appliedDeltas: 1,
        failedDeltas: 0,
        skippedDeltas: 1
      },
      lastReconcile: {
        startedAt: 5,
        completedAt: 6,
        added: 1,
        changed: 0,
        deleted: 2,
        rootCount: 2
      },
      lastReset: {
        startedAt: 7,
        completedAt: 8,
        reason: 'integrity-repair',
        clearedSearchIndex: true,
        clearedSearchIndexRows: 2,
        clearedScanProgress: true,
        scanProgressRows: 1
      }
    })
  })

  it('drops invalid persisted sqlite last task snapshots', async () => {
    const selectLimit = vi.fn(async () => [
      {
        stateJson: JSON.stringify({
          lastScan: {
            startedAt: 'bad',
            completedAt: 2,
            records: 4
          },
          lastWatch: {
            occurredAt: 3,
            completedAt: 4,
            action: 'unknown',
            path: '/tmp/a.txt'
          },
          lastReconcile: {
            startedAt: 5,
            completedAt: Number.NaN
          },
          lastReset: {
            startedAt: 7,
            completedAt: 8,
            reason: 'bad-reset-reason',
            clearedSearchIndex: true,
            clearedScanProgress: true
          },
          recentTasks: [
            {
              kind: 'scan',
              status: 'succeeded',
              completedAt: 9
            }
          ]
        })
      }
    ])
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit
          }))
        }))
      })),
      insert: vi.fn(),
      delete: vi.fn()
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    await expect(store.load('file-provider')).resolves.toEqual({
      recentTasks: [
        {
          kind: 'scan',
          status: 'succeeded',
          completedAt: 9
        }
      ]
    })
  })

  it('bounds persisted sqlite recent task history to the newest runtime history entries', async () => {
    const selectLimit = vi.fn(async () => [
      {
        stateJson: JSON.stringify({
          recentTasks: Array.from({ length: 10 }, (_, index) => ({
            kind: 'scan',
            status: 'succeeded',
            completedAt: index + 1,
            jobId: `scan:${index + 1}`
          }))
        })
      }
    ])
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit
          }))
        }))
      })),
      insert: vi.fn(),
      delete: vi.fn()
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    const state = await store.load('file-provider')

    expect(state?.recentTasks).toHaveLength(8)
    expect(state?.recentTasks?.[0]).toMatchObject({ jobId: 'scan:10' })
    expect(state?.recentTasks?.[7]).toMatchObject({ jobId: 'scan:3' })
  })

  it('sorts persisted sqlite recent task history before bounding it', async () => {
    const selectLimit = vi.fn(async () => [
      {
        stateJson: JSON.stringify({
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 100,
              jobId: 'older'
            },
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 300,
              jobId: 'newest'
            },
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 200,
              jobId: 'middle'
            }
          ]
        })
      }
    ])
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit
          }))
        }))
      })),
      insert: vi.fn(),
      delete: vi.fn()
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    const state = await store.load('file-provider')

    expect(state?.recentTasks?.map((task) => task.jobId)).toEqual(['newest', 'middle', 'older'])
  })

  it('normalizes persisted sqlite timestamps and counters before exposing diagnostics state', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const selectLimit = vi.fn(async () => [
      {
        stateJson: JSON.stringify({
          lastScan: {
            startedAt: 1_200,
            completedAt: 1_100,
            queuedAt: 1_300,
            batches: -1,
            records: -2,
            indexedRecords: 3
          },
          lastWatch: {
            occurredAt: 900,
            completedAt: 800,
            queuedAt: 1_100,
            action: 'change',
            path: '/tmp/a.txt',
            deltas: -1,
            appliedDeltas: 2,
            failedDeltas: -3,
            skippedDeltas: -4
          },
          lastReconcile: {
            startedAt: -50,
            completedAt: 20,
            added: -1,
            changed: 2,
            deleted: -3,
            skipped: 4,
            errors: -5,
            rootCount: -1,
            deltas: -2,
            appliedDeltas: 3
          },
          lastReset: {
            startedAt: 950,
            completedAt: 900,
            queuedAt: 1_200,
            reason: 'manual-rebuild',
            clearedSearchIndex: true,
            clearedSearchIndexRows: -1,
            clearedScanProgress: true,
            scanProgressRows: -2
          },
          recentTasks: [
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 1_200,
              jobId: 'future'
            },
            {
              kind: 'scan',
              status: 'failed',
              completedAt: -1,
              jobId: 'negative'
            },
            {
              kind: 'scan',
              status: 'failed',
              completedAt: 900,
              startedAt: 950,
              queuedAt: 1_100,
              jobId: 'valid'
            }
          ]
        })
      }
    ])
    const db = {
      run: vi.fn(async () => {}),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit
          }))
        }))
      })),
      insert: vi.fn(),
      delete: vi.fn()
    }
    const store = new SqliteIndexingTaskStateStore(db as never)

    const state = await store.load('file-provider')

    expect(state).toMatchObject({
      lastScan: {
        startedAt: 1_000,
        completedAt: 1_000,
        queuedAt: 1_000,
        batches: 0,
        records: 0,
        indexedRecords: 3
      },
      lastWatch: {
        occurredAt: 800,
        completedAt: 800,
        queuedAt: 1_000,
        deltas: 0,
        appliedDeltas: 2,
        failedDeltas: 0
      },
      lastReconcile: {
        startedAt: 0,
        completedAt: 20,
        added: 0,
        changed: 2,
        deleted: 0,
        skipped: 4,
        errors: 0,
        appliedDeltas: 3
      },
      lastReset: {
        startedAt: 900,
        completedAt: 900,
        queuedAt: 1_000
      },
      recentTasks: [
        {
          kind: 'scan',
          status: 'failed',
          completedAt: 900,
          startedAt: 900,
          queuedAt: 1_000,
          jobId: 'valid'
        }
      ]
    })
    expect(state?.lastWatch).not.toHaveProperty('skippedDeltas')
    expect(state?.lastReconcile).not.toHaveProperty('rootCount')
    expect(state?.lastReconcile).not.toHaveProperty('deltas')
    expect(state?.lastReset).not.toHaveProperty('clearedSearchIndexRows')
    expect(state?.lastReset).not.toHaveProperty('scanProgressRows')

    nowSpy.mockRestore()
  })
})
