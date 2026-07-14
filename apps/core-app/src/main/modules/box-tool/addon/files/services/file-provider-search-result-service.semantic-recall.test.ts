import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import {
  FileProviderSearchResultService,
  type FileProviderSearchResultServiceDeps
} from './file-provider-search-result-service'

interface FakeRow {
  id: number
  path: string
}

function makeService(opts: {
  semanticMatches: Array<{ sourceId: string; score: number }>
  rows: FakeRow[]
}): { service: FileProviderSearchResultService; semanticSearch: ReturnType<typeof vi.fn> } {
  const dbRows = opts.rows.map((row) => ({
    file: {
      id: row.id,
      path: row.path,
      type: 'file',
      extension: '.txt',
      mtime: new Date(0)
    },
    extensionKey: null,
    extensionValue: null
  }))

  // Minimal drizzle-style awaitable query chain.
  const getDb = (): unknown => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(dbRows)
        })
      })
    })
  })

  const semanticSearch = vi.fn(async () => opts.semanticMatches)

  const deps: FileProviderSearchResultServiceDeps = {
    providerId: 'files',
    getDbUtils: () => ({ getDb }) as never,
    getSearchIndex: () => null,
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
    cleanupStaleCandidates: () => {},
    semanticSearch,
    logDebug: () => {},
    formatDuration: (ms) => `${ms}ms`,
    now: () => 0
  }

  return { service: new FileProviderSearchResultService(deps), semanticSearch }
}

describe('FileProviderSearchResultService.semanticRecall', () => {
  const signal = new AbortController().signal

  it('按分数降序返回、排除已渲染 id、并写入真实 semanticScore', async () => {
    const { service } = makeService({
      semanticMatches: [
        { sourceId: '1', score: 0.9 },
        { sourceId: '2', score: 0.7 },
        { sourceId: '3', score: 0.5 }
      ],
      rows: [
        { id: 1, path: '/a.txt' },
        { id: 2, path: '/b.txt' },
        { id: 3, path: '/c.txt' }
      ]
    })

    const result = await service.semanticRecall(
      { text: 'report' } as TuffQuery,
      new Set(['/b.txt']), // b 已在主结果里，应被排除
      signal
    )

    expect(result.map((item) => item.id)).toEqual(['/a.txt', '/c.txt'])
    const search = (
      result[0].meta?.extension as { search?: { semanticScore?: number } } | undefined
    )?.search
    expect(search?.semanticScore).toBe(0.9)
    expect(result[0].scoring?.match_details?.type).toBe('semantic')
    expect(result[0].scoring?.match).toBe(0)
  })

  it('query 过短时不触发语义查询', async () => {
    const { service, semanticSearch } = makeService({
      semanticMatches: [{ sourceId: '1', score: 0.9 }],
      rows: [{ id: 1, path: '/a.txt' }]
    })

    const result = await service.semanticRecall({ text: 'ab' } as TuffQuery, new Set(), signal)

    expect(result).toEqual([])
    expect(semanticSearch).not.toHaveBeenCalled()
  })

  it('语义结果为空时返回空数组', async () => {
    const { service } = makeService({ semanticMatches: [], rows: [] })

    const result = await service.semanticRecall({ text: 'report' } as TuffQuery, new Set(), signal)

    expect(result).toEqual([])
  })

  it('召回数量受上限约束', async () => {
    const semanticMatches = Array.from({ length: 12 }, (_, index) => ({
      sourceId: String(index + 1),
      score: 1 - index * 0.05
    }))
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      path: `/f${index + 1}.txt`
    }))
    const { service } = makeService({ semanticMatches, rows })

    const result = await service.semanticRecall({ text: 'report' } as TuffQuery, new Set(), signal)

    expect(result.length).toBe(8)
    // 最高分优先
    expect(result[0].id).toBe('/f1.txt')
  })

  it('aborted 时直接返回空', async () => {
    const { service, semanticSearch } = makeService({
      semanticMatches: [{ sourceId: '1', score: 0.9 }],
      rows: [{ id: 1, path: '/a.txt' }]
    })
    const controller = new AbortController()
    controller.abort()

    const result = await service.semanticRecall(
      { text: 'report' } as TuffQuery,
      new Set(),
      controller.signal
    )

    expect(result).toEqual([])
    expect(semanticSearch).not.toHaveBeenCalled()
  })
})
