import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import { describe, expect, it } from 'vitest'
import {
  classifyFailedFileIndexError,
  mapFileToIndexedSourceRecord,
  mapWorkerResultToIndexedSourceRecord,
  toFileTimestamp
} from './file-provider-record-mapper'

describe('file-provider-record-mapper', () => {
  it('maps file rows into base indexed source records with FTS tags and extension keywords', () => {
    const mtime = new Date('2026-05-30T00:00:00.000Z')

    expect(
      mapFileToIndexedSourceRecord(
        {
          path: '/Users/demo/Documents/a.md',
          name: 'a.md',
          displayName: null,
          extension: '.md',
          size: 128,
          mtime,
          type: 'file',
          isDir: false
        },
        'file-provider'
      )
    ).toEqual({
      sourceId: 'file-provider',
      recordId: '/Users/demo/Documents/a.md',
      stableKey: '/Users/demo/Documents/a.md',
      kind: 'file',
      title: 'a.md',
      subtitle: '/Users/demo/Documents/a.md',
      path: '/Users/demo/Documents/a.md',
      mtime: mtime.getTime(),
      size: 128,
      metadata: {
        extension: '.md',
        type: 'file',
        isDir: false,
        runtimePublication: 'base'
      },
      keywords: ['markdown', 'document', 'note'],
      tags: ['text', 'document', 'code', 'md'],
      search: {
        keywords: [
          { value: 'markdown', priority: 1.05 },
          { value: 'document', priority: 1.05 },
          { value: 'note', priority: 1.05 }
        ]
      }
    })
  })

  it('derives extension from filename when row extension is absent and falls back to other tag', () => {
    const mtime = new Date('2026-06-01T00:00:00.000Z')

    const fromName = mapFileToIndexedSourceRecord(
      {
        path: '/Users/demo/Notes/README.MD',
        name: 'README.MD',
        displayName: null,
        extension: null,
        size: 64,
        mtime,
        type: 'file',
        isDir: false
      },
      'file-provider'
    )
    expect(fromName.tags).toEqual(['text', 'document', 'code', 'md'])
    expect(fromName.keywords).toEqual(['markdown', 'document', 'note'])

    const extensionless = mapFileToIndexedSourceRecord(
      {
        path: '/Users/demo/Makefile',
        name: 'Makefile',
        displayName: null,
        extension: '',
        size: 32,
        mtime,
        type: 'file',
        isDir: false
      },
      'file-provider'
    )
    expect(extensionless.tags).toEqual(['other'])
    expect(extensionless.keywords).toEqual([])
    expect(extensionless.search?.keywords).toEqual([])
  })

  it('maps worker enrichment results preserving aliases, keywords, tags, and legacyItemIds', () => {
    const workerResult: IndexWorkerFileResult = {
      type: 'file',
      taskId: 'task-1',
      fileId: 42,
      progress: {
        status: 'completed',
        progress: 100,
        processedBytes: 120,
        totalBytes: 120,
        lastError: null
      },
      fileUpdate: {
        content: 'quarterly budget summary',
        embeddingStatus: 'pending'
      },
      indexItem: {
        itemId: '/Users/demo/budget.pdf',
        providerId: 'file-provider',
        type: 'file',
        name: 'budget.pdf',
        displayName: 'Budget 2026',
        description: 'Annual report',
        path: '/Users/demo/budget.pdf',
        extension: '.pdf',
        content: 'quarterly budget summary',
        tags: ['document', 'pdf'],
        aliases: [{ value: 'budget', priority: 1.8 }, { value: '' }, { value: 'report' }],
        keywords: [
          { value: 'budget' },
          { value: '', priority: 1.2 },
          { value: 'finance', priority: 1.25 }
        ],
        ...({ legacyItemIds: ['legacy-1', '', 99, 'legacy-2'] } as Record<string, unknown>)
      }
    }

    expect(mapWorkerResultToIndexedSourceRecord(workerResult, 'file-provider')).toEqual({
      sourceId: 'file-provider',
      recordId: '/Users/demo/budget.pdf',
      stableKey: '/Users/demo/budget.pdf',
      kind: 'file',
      title: 'Budget 2026',
      subtitle: 'Annual report',
      path: '/Users/demo/budget.pdf',
      keywords: ['budget', '', 'finance'],
      tags: ['document', 'pdf'],
      metadata: {
        content: 'quarterly budget summary',
        extension: '.pdf',
        type: 'file',
        runtimePublication: 'worker-enrichment'
      },
      search: {
        aliases: [
          { value: 'budget', priority: 1.8 },
          { value: 'report', priority: 1.5 }
        ],
        keywords: [
          { value: 'budget', priority: 1.1 },
          { value: 'finance', priority: 1.25 }
        ],
        legacyItemIds: ['legacy-1', 'legacy-2']
      }
    })
  })

  it('falls back to name and path when worker displayName/description are absent', () => {
    const workerResult: IndexWorkerFileResult = {
      type: 'file',
      taskId: 'task-2',
      fileId: 7,
      progress: {
        status: 'completed',
        progress: 100,
        processedBytes: 10,
        totalBytes: 10,
        lastError: null
      },
      fileUpdate: null,
      indexItem: {
        itemId: '/Users/demo/notes.txt',
        providerId: 'file-provider',
        type: 'file',
        name: 'notes.txt',
        path: '/Users/demo/notes.txt'
      }
    }

    const mapped = mapWorkerResultToIndexedSourceRecord(workerResult, 'file-provider')
    expect(mapped.title).toBe('notes.txt')
    expect(mapped.subtitle).toBe('/Users/demo/notes.txt')
    expect(mapped.search?.legacyItemIds).toBeUndefined()
    expect(mapped.search?.aliases).toBeUndefined()
    expect(mapped.search?.keywords).toBeUndefined()
  })

  it('normalizes timestamps across Date, number, ISO string, invalid, and nullish values', () => {
    const date = new Date('2026-06-01T12:00:00.000Z')
    expect(toFileTimestamp(date)).toBe(date.getTime())
    expect(toFileTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000)
    expect(toFileTimestamp('2026-06-01T12:00:00.000Z')).toBe(date.getTime())
    expect(toFileTimestamp('not-a-date')).toBeNull()
    expect(toFileTimestamp(null)).toBeNull()
    expect(toFileTimestamp(undefined)).toBeNull()
    expect(toFileTimestamp(0)).toBeNull()
    expect(toFileTimestamp('')).toBeNull()
  })

  it('classifies failed file index errors into stable public codes', () => {
    expect(classifyFailedFileIndexError(null)).toBeNull()
    expect(classifyFailedFileIndexError('')).toBeNull()
    expect(classifyFailedFileIndexError('SQLITE_BUSY: database is locked')).toBe(
      'FILE_INDEX_DATABASE_BUSY'
    )
    expect(classifyFailedFileIndexError('PDF parse failed at page 3')).toBe(
      'FILE_INDEX_ITEM_FAILED'
    )
  })
})
