import { describe, expect, it } from 'vitest'
import { FileProviderIncrementalWritePlannerService } from './file-provider-incremental-write-planner-service'

function createPlanner(): FileProviderIncrementalWritePlannerService {
  return new FileProviderIncrementalWritePlannerService({
    normalizePath: (filePath) => filePath.toLowerCase(),
    timestampToleranceMs: 1_000
  })
}

describe('file-provider-incremental-write-planner-service', () => {
  it('splits incoming records into inserts, updates, and unchanged rows', () => {
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
          mtime: now,
          type: 'file',
          isDir: false
        },
        {
          id: 2,
          path: '/tmp/same.txt',
          name: 'same.txt',
          extension: '.txt',
          size: 3,
          ctime: now,
          mtime: now,
          type: 'file',
          isDir: false
        }
      ],
      manualPaths: new Set<string>(),
      manualTotal: 0
    })

    expect(plan.filesToInsert).toHaveLength(1)
    expect(plan.filesToInsert[0]?.path).toBe('/tmp/new.txt')
    expect(plan.filesToUpdate).toEqual([
      expect.objectContaining({
        id: 1,
        path: '/tmp/changed.txt',
        size: 2
      })
    ])
    expect(plan.unchangedCount).toBe(1)
  })

  it('treats timestamps within tolerance as unchanged', () => {
    const planner = createPlanner()
    const plan = planner.plan({
      records: [
        {
          path: '/tmp/a.txt',
          name: 'a.txt',
          extension: '.txt',
          size: 1,
          ctime: new Date(1000),
          mtime: new Date(1500)
        }
      ],
      existingRows: [
        {
          id: 1,
          path: '/tmp/a.txt',
          name: 'a.txt',
          extension: '.txt',
          size: 1,
          ctime: new Date(1500),
          mtime: new Date(1000)
        }
      ],
      manualPaths: new Set<string>(),
      manualTotal: 0
    })

    expect(plan.filesToUpdate).toHaveLength(0)
    expect(plan.unchangedCount).toBe(1)
  })

  it('computes manual accepted, inserted, updated, and unchanged counts', () => {
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
          path: '/TMP/changed.txt',
          name: 'changed.txt',
          extension: '.txt',
          size: 2,
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
          id: 1,
          path: '/TMP/changed.txt',
          name: 'changed.txt',
          extension: '.txt',
          size: 1,
          ctime: now,
          mtime: now
        },
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
      manualPaths: new Set(['/tmp/new.txt', '/tmp/changed.txt', '/tmp/same.txt']),
      manualTotal: 4
    })

    expect(plan.manual).toEqual({
      total: 4,
      accepted: 3,
      inserted: 1,
      updated: 1,
      unchanged: 1
    })
  })
})
