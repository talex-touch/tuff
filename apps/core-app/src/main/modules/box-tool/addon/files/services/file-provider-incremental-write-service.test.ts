import { describe, expect, it, vi } from 'vitest'
import { FileProviderIncrementalWritePlannerService } from './file-provider-incremental-write-planner-service'
import {
  FileProviderIncrementalWriteService,
  type FileProviderIncrementalChangeEntry
} from './file-provider-incremental-write-service'

interface TestRecord {
  path: string
  name: string
  extension: string | null
  size: number | null
  ctime: Date
  mtime: Date
}

interface TestExistingRecord extends TestRecord {
  id: number
}

function createService(options?: {
  records?: Map<string, TestRecord | null>
  existingRows?: TestExistingRecord[]
}) {
  const inserted: TestRecord[][] = []
  const updated: TestExistingRecord[][] = []
  const logInfo = vi.fn()
  const logDebug = vi.fn()
  const planner = new FileProviderIncrementalWritePlannerService({
    normalizePath: (filePath) => filePath.toLowerCase(),
    timestampToleranceMs: 1_000
  })
  const service = new FileProviderIncrementalWriteService<
    TestRecord,
    TestExistingRecord,
    TestRecord,
    TestExistingRecord
  >({
    planner,
    normalizePath: (filePath) => filePath.toLowerCase(),
    buildRecord: async (rawPath) => options?.records?.get(rawPath) ?? null,
    getExistingRows: async () => options?.existingRows ?? [],
    insertRecords: async (records) => {
      inserted.push(records)
      return records
    },
    updateRecords: async (records) => {
      const result = records.map((record) => ({
        id: record.id,
        path: record.path,
        name: record.name,
        extension: record.extension,
        size: record.size,
        ctime: record.ctime,
        mtime: record.mtime
      }))
      updated.push(result)
      return result
    },
    logDebug,
    logInfo
  })

  return { inserted, logDebug, logInfo, service, updated }
}

describe('file-provider-incremental-write-service', () => {
  it('plans and executes inserts, updates, unchanged rows, and manual summaries', async () => {
    const now = new Date('2026-05-30T00:00:00.000Z')
    const records = new Map<string, TestRecord | null>([
      [
        '/tmp/new.txt',
        {
          path: '/tmp/new.txt',
          name: 'new.txt',
          extension: '.txt',
          size: 1,
          ctime: now,
          mtime: now
        }
      ],
      [
        '/tmp/changed.txt',
        {
          path: '/tmp/changed.txt',
          name: 'changed.txt',
          extension: '.txt',
          size: 2,
          ctime: now,
          mtime: now
        }
      ],
      [
        '/tmp/same.txt',
        {
          path: '/tmp/same.txt',
          name: 'same.txt',
          extension: '.txt',
          size: 3,
          ctime: now,
          mtime: now
        }
      ]
    ])
    const { inserted, logInfo, service, updated } = createService({
      records,
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
      ]
    })

    const result = await service.execute([
      ['', { action: 'add', rawPath: '/tmp/new.txt', manual: true }],
      ['', { action: 'change', rawPath: '/tmp/changed.txt', manual: true }],
      ['', { action: 'change', rawPath: '/tmp/same.txt', manual: true }]
    ])

    expect(inserted[0]).toEqual([records.get('/tmp/new.txt')])
    expect(updated[0]).toEqual([
      expect.objectContaining({
        id: 1,
        path: '/tmp/changed.txt',
        size: 2
      })
    ])
    expect(result.unchangedCount).toBe(1)
    expect(result.manual).toEqual({
      total: 3,
      accepted: 3,
      inserted: 1,
      updated: 1,
      unchanged: 1
    })
    expect(logInfo).toHaveBeenCalledWith('Incremental manual summary', result.manual)
  })

  it('logs a zero accepted manual summary when all manual records are filtered', async () => {
    const { inserted, logInfo, service, updated } = createService({
      records: new Map<string, TestRecord | null>([['/tmp/ignored.bin', null]])
    })
    const entries: FileProviderIncrementalChangeEntry[] = [
      ['', { action: 'add', rawPath: '/tmp/ignored.bin', manual: true }]
    ]

    const result = await service.execute(entries)

    expect(inserted).toEqual([])
    expect(updated).toEqual([])
    expect(result.manual).toEqual({
      total: 1,
      accepted: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0
    })
    expect(logInfo).toHaveBeenCalledWith('Incremental manual summary', result.manual)
  })
})
