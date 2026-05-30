import { describe, expect, it } from 'vitest'
import { IndexedWritePlanService as SdkIndexedWritePlanService } from '@talex-touch/utils/search'
import { IndexedWritePlanService } from './indexing-write-plan-service'

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
  it('re-exports the public SDK write plan service for legacy CoreApp imports', () => {
    expect(IndexedWritePlanService).toBe(SdkIndexedWritePlanService)
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
})
