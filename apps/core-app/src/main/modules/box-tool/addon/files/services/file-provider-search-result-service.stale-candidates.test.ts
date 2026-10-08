import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import type { Mock } from 'vitest'
import { describe, expect, it, vi } from 'vitest'
import {
  FileProviderSearchResultService,
  type FileProviderSearchResultServiceDeps
} from './file-provider-search-result-service'

interface FakeRow {
  id: number
  path: string
  extension?: string
}

/**
 * Search over a fixed candidate set: `candidateIds` is what the index returns,
 * `rows` is what the files table actually holds for them.
 */
function makeService(opts: {
  candidateIds: string[]
  rows: FakeRow[]
  isPathAdmitted?: (path: string) => boolean
  rowsReady?: Promise<void>
  onRowsQuery?: () => void
}): {
  service: FileProviderSearchResultService
  cleanupStaleCandidates: Mock
} {
  const dbRows = opts.rows.map((row) => ({
    file: {
      id: row.id,
      path: row.path,
      name: row.path.split('/').at(-1) ?? row.path,
      type: 'file',
      extension: row.extension ?? '.txt',
      isDir: false,
      mtime: new Date(0)
    },
    extensionKey: null,
    extensionValue: null
  }))

  const getDb = (): unknown => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: async () => {
            opts.onRowsQuery?.()
            await opts.rowsReady
            return dbRows
          }
        })
      })
    })
  })

  const cleanupStaleCandidates = vi.fn()

  const deps: FileProviderSearchResultServiceDeps = {
    providerId: 'files',
    getDbUtils: () => ({ getDb, getFileIndexReadDb: getDb }) as never,
    isContentIndexingEnabled: () => false,
    isPathAdmitted:
      opts.isPathAdmitted ??
      ((path) => path.startsWith('/home/me/') && !path.includes('/.config/')),
    getSearchIndex: () =>
      ({
        lookupByKeywords: async (_providerId: string, terms: string[]) =>
          new Map(terms.map((term) => [term, opts.candidateIds.map((itemId) => ({ itemId }))])),
        lookupByKeywordPrefix: async () => [],
        search: async () => [],
        lookupBySubsequence: async () => [],
        lookupByNgrams: async () => []
      }) as never,
    buildItem: (file) =>
      ({
        id: file.path,
        kind: 'file',
        source: { type: 'file', id: 'files', name: 'Files' },
        render: { mode: 'default', basic: { title: file.path } },
        meta: {}
      }) as TuffItem,
    normalizeItem: (item) => item,
    sanitizeExtensions: (extensions) => extensions,
    cleanupStaleCandidates,
    semanticSearch: async () => [],
    logDebug: () => {},
    formatDuration: (ms) => `${ms}ms`,
    now: () => 0
  }

  return { service: new FileProviderSearchResultService(deps), cleanupStaleCandidates }
}

describe('FileProviderSearchResultService stale candidates', () => {
  const signal = new AbortController().signal

  it('never routes a filter-excluded row into cleanup', async () => {
    // The hidden-directory row is a live, indexed file that this query is not
    // allowed to display — display filtering must not imply deletion.
    const hiddenPath = '/home/me/.config/report.txt'
    const { service, cleanupStaleCandidates } = makeService({
      candidateIds: [hiddenPath, '/home/me/report.txt'],
      rows: [
        { id: 1, path: hiddenPath },
        { id: 2, path: '/home/me/report.txt' }
      ]
    })

    const result = await service.search({ text: 'report' } as TuffQuery, signal)

    expect(result.items.map((item) => item.id)).toEqual(['/home/me/report.txt'])
    expect(cleanupStaleCandidates).not.toHaveBeenCalled()
  })

  it('routes only candidates with no database row into cleanup', async () => {
    const { service, cleanupStaleCandidates } = makeService({
      candidateIds: ['/home/me/report.txt', '/home/me/dropped.txt'],
      rows: [{ id: 1, path: '/home/me/report.txt' }]
    })

    await service.search({ text: 'report' } as TuffQuery, signal)

    expect(cleanupStaleCandidates).toHaveBeenCalledTimes(1)
    expect(cleanupStaleCandidates).toHaveBeenCalledWith(['/home/me/dropped.txt'])
  })
})

describe('file search current watch-root admission', () => {
  it('omits a still-indexed out-of-scope path without treating configuration exclusion as physical absence', async () => {
    const kept = '/home/me/current/report.txt'
    const withdrawn = '/home/me/withdrawn/report.txt'
    const { service, cleanupStaleCandidates } = makeService({
      candidateIds: [kept, withdrawn],
      rows: [
        { id: 1, path: kept },
        { id: 2, path: withdrawn }
      ],
      isPathAdmitted: (path) => path.startsWith('/home/me/current/')
    })
    const result = await service.search(
      { text: 'report' } as TuffQuery,
      new AbortController().signal
    )
    expect(result.items.map((item) => item.id)).toEqual([kept])
    expect(cleanupStaleCandidates).not.toHaveBeenCalled()
  })

  it('rechecks current roots after an in-flight catalog read instead of publishing its old-scope result', async () => {
    const indexed = '/home/me/current/report.txt'
    const rowsEntered = Promise.withResolvers<void>()
    const rowsReleased = Promise.withResolvers<void>()
    let admitted = true
    const { service, cleanupStaleCandidates } = makeService({
      candidateIds: [indexed],
      rows: [{ id: 1, path: indexed }],
      isPathAdmitted: (path) => admitted && path.startsWith('/home/me/current/'),
      onRowsQuery: () => rowsEntered.resolve(),
      rowsReady: rowsReleased.promise
    })
    const operation = service.search({ text: 'report' } as TuffQuery, new AbortController().signal)
    try {
      await rowsEntered.promise
      admitted = false
      rowsReleased.resolve()
      expect((await operation).items).toEqual([])
      expect(cleanupStaleCandidates).not.toHaveBeenCalled()
      admitted = true
      expect(
        (
          await service.search({ text: 'report' } as TuffQuery, new AbortController().signal)
        ).items.map((item) => item.id)
      ).toEqual([indexed])
    } finally {
      rowsReleased.resolve()
      await operation
    }
  })
})
