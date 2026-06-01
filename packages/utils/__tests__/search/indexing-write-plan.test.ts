import { describe, expect, it } from 'vitest'
import {
  buildEmptyIndexedWriteManualSummary,
  buildIndexedWriteManualContext,
  chunkIndexedWriteRecords,
  IndexedWritePlanService,
  mapIndexedWriteFullScanUpsertRecords,
  mapIndexedWritePathUpdateRecord,
  mapIndexedWriteReconciliationDbPayload,
  mapIndexedWriteReconciliationDiskPayload,
  mapIndexedWriteReconciliationUpsertRecords,
  mapIndexedWriteWorkerFilePayload,
  resolveIndexedWriteReconciliationDiff,
  takeIndexedWriteRecordChunk,
  toIndexedWriteDate,
  toIndexedWriteTimestamp
} from '../../search'

function createPlanner(): IndexedWritePlanService<
  { path: string; name: string; extension: string; size: number; ctime: Date; mtime: Date },
  {
    id: number
    path: string
    name: string
    extension: string
    size: number
    ctime: Date
    mtime: Date
  }
> {
  return new IndexedWritePlanService({
    normalizePath: (recordPath) => recordPath.toLowerCase(),
    timestampToleranceMs: 1_000
  })
}

describe('IndexedWritePlanService', () => {
  it('chunks write records with a normalized positive chunk size', () => {
    expect(chunkIndexedWriteRecords([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunkIndexedWriteRecords([1, 2, 3], 0)).toEqual([[1], [2], [3]])
    expect(chunkIndexedWriteRecords([1, 2, 3], 1.8)).toEqual([[1], [2], [3]])
    expect(chunkIndexedWriteRecords([], 2)).toEqual([])
  })

  it('takes a write record chunk with normalized offset and chunk size', () => {
    expect(takeIndexedWriteRecordChunk([1, 2, 3, 4], 1, 2)).toEqual({
      chunk: [2, 3],
      nextOffset: 3,
      chunkSize: 2
    })
    expect(takeIndexedWriteRecordChunk([1, 2], -1, 0)).toEqual({
      chunk: [1],
      nextOffset: 1,
      chunkSize: 1
    })
    expect(takeIndexedWriteRecordChunk([1, 2], 5, 2)).toEqual({
      chunk: [],
      nextOffset: 5,
      chunkSize: 2
    })
  })

  it('builds manual write context from watch delta entries', () => {
    const context = buildIndexedWriteManualContext(
      [
        ['a', { rawPath: '/TMP/A.txt', manual: true }],
        ['b', { rawPath: '/tmp/b.txt' }],
        ['c', { rawPath: '/TMP/A.txt', manual: true }]
      ],
      (rawPath) => rawPath.toLowerCase()
    )

    expect(context.manualTotal).toBe(2)
    expect(Array.from(context.manualPaths)).toEqual(['/tmp/a.txt'])
  })

  it('builds an empty manual write summary', () => {
    expect(buildEmptyIndexedWriteManualSummary(3)).toEqual({
      total: 3,
      accepted: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0
    })
  })

  it('splits incoming records into inserts, updates, and unchanged records', () => {
    const planner = createPlanner()
    const now = new Date('2026-05-30T00:00:00.000Z')
    const plan = planner.plan({
      records: [
        {
          path: '/tmp/new.txt',
          name: 'new.txt',
          extension: '.txt',
          size: 1,
          ctime: now,
          mtime: now
        },
        {
          path: '/tmp/changed.txt',
          name: 'changed.txt',
          extension: '.txt',
          size: 2,
          ctime: now,
          mtime: now
        },
        {
          path: '/tmp/same.txt',
          name: 'same.txt',
          extension: '.txt',
          size: 3,
          ctime: now,
          mtime: now
        }
      ],
      existingRows: [
        {
          id: 1,
          path: '/tmp/changed.txt',
          name: 'changed.txt',
          extension: '.txt',
          size: 1,
          ctime: now,
          mtime: now
        },
        {
          id: 2,
          path: '/tmp/same.txt',
          name: 'same.txt',
          extension: '.txt',
          size: 3,
          ctime: now,
          mtime: now
        }
      ],
      manualPaths: new Set<string>(),
      manualTotal: 0
    })

    expect(plan.recordsToInsert).toHaveLength(1)
    expect(plan.recordsToInsert[0]?.path).toBe('/tmp/new.txt')
    expect(plan.recordsToUpdate).toEqual([
      expect.objectContaining({
        id: 1,
        path: '/tmp/changed.txt',
        size: 2
      })
    ])
    expect(plan.unchangedCount).toBe(1)
  })

  it('computes manual write summary with normalized paths', () => {
    const planner = createPlanner()
    const now = new Date('2026-05-30T00:00:00.000Z')
    const plan = planner.plan({
      records: [
        {
          path: '/TMP/new.txt',
          name: 'new.txt',
          extension: '.txt',
          size: 1,
          ctime: now,
          mtime: now
        },
        {
          path: '/TMP/same.txt',
          name: 'same.txt',
          extension: '.txt',
          size: 3,
          ctime: now,
          mtime: now
        }
      ],
      existingRows: [
        {
          id: 2,
          path: '/TMP/same.txt',
          name: 'same.txt',
          extension: '.txt',
          size: 3,
          ctime: now,
          mtime: now
        }
      ],
      manualPaths: new Set(['/tmp/new.txt', '/tmp/same.txt']),
      manualTotal: 3
    })

    expect(plan.manual).toEqual({
      total: 3,
      accepted: 2,
      inserted: 1,
      updated: 0,
      unchanged: 1
    })
  })

  it('normalizes write dates for adapters', () => {
    const date = new Date('2026-05-30T00:00:00.000Z')

    expect(toIndexedWriteDate(date)).toBe(date)
    expect(toIndexedWriteDate('2026-05-30T00:00:00.000Z').toISOString()).toBe(
      '2026-05-30T00:00:00.000Z'
    )
    expect(toIndexedWriteDate(1_000).getTime()).toBe(1_000)
    expect(toIndexedWriteDate('invalid').getTime()).toBe(0)
    expect(toIndexedWriteDate(null).getTime()).toBe(0)
  })

  it('normalizes write timestamps for worker adapters', () => {
    expect(toIndexedWriteTimestamp(new Date('2026-05-30T00:00:00.000Z'))).toBe(
      Date.parse('2026-05-30T00:00:00.000Z')
    )
    expect(toIndexedWriteTimestamp('2026-05-30T00:00:00.000Z')).toBe(
      Date.parse('2026-05-30T00:00:00.000Z')
    )
    expect(toIndexedWriteTimestamp(1_000)).toBe(1_000)
    expect(toIndexedWriteTimestamp(Number.NaN)).toBeNull()
    expect(toIndexedWriteTimestamp('invalid')).toBeNull()
    expect(toIndexedWriteTimestamp(null)).toBeNull()
  })

  it('maps full scan source records into path upsert records', () => {
    const lastIndexedAt = new Date('2026-05-30T01:00:00.000Z')

    expect(
      mapIndexedWriteFullScanUpsertRecords(
        [
          {
            path: '/tmp/a.txt',
            name: 'a.txt',
            extension: '.txt',
            size: 12,
            ctime: '2026-05-30T00:00:00.000Z',
            mtime: 1_000
          },
          {
            path: '/tmp/b',
            name: 'b',
            extension: '',
            size: 0,
            ctime: 'invalid',
            mtime: null as unknown as Date
          }
        ],
        { lastIndexedAt }
      )
    ).toEqual([
      {
        path: '/tmp/a.txt',
        name: 'a.txt',
        extension: '.txt',
        size: 12,
        ctime: new Date('2026-05-30T00:00:00.000Z'),
        mtime: new Date(1_000),
        lastIndexedAt,
        isDir: false,
        type: 'file'
      },
      {
        path: '/tmp/b',
        name: 'b',
        extension: null,
        size: null,
        ctime: new Date(0),
        mtime: new Date(0),
        lastIndexedAt,
        isDir: false,
        type: 'file'
      }
    ])
  })

  it('maps reconciliation worker payload timestamps with zero fallback', () => {
    expect(
      mapIndexedWriteReconciliationDiskPayload([
        {
          path: '/tmp/a.txt',
          name: 'a.txt',
          extension: '.txt',
          size: 12,
          ctime: '2026-05-30T00:00:00.000Z',
          mtime: 1_000
        },
        {
          path: '/tmp/b',
          name: 'b',
          extension: '',
          size: 0,
          ctime: 'invalid',
          mtime: null
        }
      ])
    ).toEqual([
      {
        path: '/tmp/a.txt',
        name: 'a.txt',
        extension: '.txt',
        size: 12,
        ctime: Date.parse('2026-05-30T00:00:00.000Z'),
        mtime: 1_000
      },
      {
        path: '/tmp/b',
        name: 'b',
        extension: '',
        size: 0,
        ctime: 0,
        mtime: 0
      }
    ])

    expect(
      mapIndexedWriteReconciliationDbPayload([
        { id: 1, path: '/tmp/a.txt', mtime: '2026-05-30T00:00:00.000Z' },
        { id: 2, path: '/tmp/b.txt', mtime: Number.NaN }
      ])
    ).toEqual([
      {
        id: 1,
        path: '/tmp/a.txt',
        mtime: Date.parse('2026-05-30T00:00:00.000Z')
      },
      {
        id: 2,
        path: '/tmp/b.txt',
        mtime: 0
      }
    ])
  })

  it('maps reconciliation add records into path upsert records with injected batch time', () => {
    const lastIndexedAt = new Date('2026-06-01T00:00:00.000Z')

    expect(
      mapIndexedWriteReconciliationUpsertRecords(
        [
          {
            path: '/tmp/a.txt',
            name: 'a.txt',
            extension: '.txt',
            size: 12,
            ctime: '2026-05-30T00:00:00.000Z',
            mtime: 1_000
          },
          {
            path: '/tmp/b',
            name: 'b',
            extension: '',
            size: 0,
            ctime: 'invalid',
            mtime: null as unknown as Date
          }
        ],
        { lastIndexedAt }
      )
    ).toEqual([
      {
        path: '/tmp/a.txt',
        name: 'a.txt',
        extension: '.txt',
        size: 12,
        ctime: new Date('2026-05-30T00:00:00.000Z'),
        mtime: new Date(1_000),
        lastIndexedAt,
        isDir: false,
        type: 'file'
      },
      {
        path: '/tmp/b',
        name: 'b',
        extension: null,
        size: null,
        ctime: new Date(0),
        mtime: new Date(0),
        lastIndexedAt,
        isDir: false,
        type: 'file'
      }
    ])
  })

  it('computes reconciliation diff with duplicate disk paths ignored', () => {
    const result = resolveIndexedWriteReconciliationDiff(
      [
        {
          path: '/watch/new.txt',
          name: 'new.txt',
          extension: '.txt',
          size: 1,
          mtime: 20,
          ctime: 20
        },
        {
          path: '/watch/update.txt',
          name: 'update.txt',
          extension: '.txt',
          size: 1,
          mtime: 30,
          ctime: 30
        },
        {
          path: '/watch/update.txt',
          name: 'update.txt',
          extension: '.txt',
          size: 1,
          mtime: 40,
          ctime: 40
        },
        {
          path: '/other/external.txt',
          name: 'external.txt',
          extension: '.txt',
          size: 1,
          mtime: 10,
          ctime: 10
        }
      ],
      [
        { id: 1, path: '/watch/update.txt', mtime: 10 },
        { id: 2, path: '/watch/delete.txt', mtime: 10 },
        { id: 3, path: '/other/keep.txt', mtime: 10 }
      ],
      ['/watch']
    )

    expect(result.filesToAdd).toEqual([
      {
        path: '/watch/new.txt',
        name: 'new.txt',
        extension: '.txt',
        size: 1,
        mtime: 20,
        ctime: 20
      },
      {
        path: '/other/external.txt',
        name: 'external.txt',
        extension: '.txt',
        size: 1,
        mtime: 10,
        ctime: 10
      }
    ])
    expect(result.filesToUpdate).toEqual([
      {
        id: 1,
        path: '/watch/update.txt',
        name: 'update.txt',
        extension: '.txt',
        size: 1,
        mtime: 30,
        ctime: 30
      }
    ])
    expect(result.deletedIds).toEqual([2])
  })

  it('maps indexed worker file payloads with injected timestamp fallback', () => {
    expect(
      mapIndexedWriteWorkerFilePayload(
        {
          id: 1,
          path: '/tmp/a.txt',
          name: 'a.txt',
          displayName: 'A',
          extension: '.txt',
          size: 12,
          ctime: '2026-05-30T00:00:00.000Z',
          mtime: 1_000
        },
        { fallbackTimestamp: '2026-06-01T00:00:00.000Z' }
      )
    ).toEqual({
      id: 1,
      path: '/tmp/a.txt',
      name: 'a.txt',
      displayName: 'A',
      extension: '.txt',
      size: 12,
      ctime: Date.parse('2026-05-30T00:00:00.000Z'),
      mtime: 1_000
    })

    expect(
      mapIndexedWriteWorkerFilePayload(
        {
          id: 2,
          path: '/tmp/b.txt',
          name: 'b.txt',
          displayName: undefined,
          extension: undefined,
          size: undefined,
          ctime: 'invalid',
          mtime: null
        },
        { fallbackTimestamp: 5_000 }
      )
    ).toEqual({
      id: 2,
      path: '/tmp/b.txt',
      name: 'b.txt',
      displayName: null,
      extension: null,
      size: null,
      ctime: 5_000,
      mtime: 5_000
    })

    expect(
      mapIndexedWriteWorkerFilePayload(
        {
          id: null,
          path: '/tmp/c.txt',
          name: 'c.txt',
          ctime: 1_000,
          mtime: 1_000
        },
        { fallbackTimestamp: 5_000 }
      )
    ).toBeNull()
  })

  it('maps path update records with existing row identity and injected file defaults', () => {
    expect(
      mapIndexedWritePathUpdateRecord(
        {
          path: '/tmp/changed.txt',
          name: 'changed.txt',
          extension: '',
          size: 0,
          ctime: 'invalid',
          mtime: 1_000
        },
        {
          id: 7,
          path: '/tmp/original.txt',
          name: 'original.txt',
          extension: '.txt',
          size: 1,
          ctime: 2_000,
          mtime: 3_000,
          type: null
        }
      )
    ).toEqual({
      id: 7,
      path: '/tmp/original.txt',
      name: 'changed.txt',
      extension: null,
      size: null,
      ctime: new Date(0),
      mtime: new Date(1_000),
      type: 'file',
      isDir: false
    })

    expect(
      mapIndexedWritePathUpdateRecord(
        {
          path: '/tmp/folder',
          name: 'folder',
          extension: null,
          size: null,
          ctime: 1_000,
          mtime: 2_000
        },
        {
          id: 8,
          path: '/tmp/folder',
          name: 'folder',
          extension: null,
          size: null,
          ctime: 1_000,
          mtime: 2_000,
          type: 'directory'
        },
        { isDir: true }
      )
    ).toMatchObject({
      id: 8,
      type: 'directory',
      isDir: true
    })
  })
})
