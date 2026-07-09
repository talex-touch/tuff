import { describe, expect, it, vi } from 'vitest'
import type { SearchIndexItem, SearchIndexKeyword } from './search-index-service'
import { SearchIndexService } from './search-index-service'

type SearchIndexHarness = Omit<
  SearchIndexService,
  'buildKeywordHash' | 'initialized' | 'prepareDocument'
> & {
  initialized: boolean
  buildKeywordHash: (entries: SearchIndexKeyword[]) => string
  prepareDocument: (item: SearchIndexItem) => Promise<{
    keywordEntries: SearchIndexKeyword[]
    keywordHash: string
  }>
}

function createServiceHarness(): SearchIndexHarness {
  return new SearchIndexService(
    {} as ConstructorParameters<typeof SearchIndexService>[0]
  ) as unknown as SearchIndexHarness
}

function sqlChunkStrings(chunk: unknown): string[] {
  if (!chunk || typeof chunk !== 'object' || !('value' in chunk)) return []
  const value = chunk.value
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function queryText(query: unknown): string {
  if (!query || typeof query !== 'object' || !('queryChunks' in query)) return ''
  const chunks = query.queryChunks
  if (!Array.isArray(chunks)) return ''
  return chunks.flatMap(sqlChunkStrings).join('').trim()
}

describe('SearchIndexService delta/hash', () => {
  it('keyword hash 在关键词顺序变化时保持稳定', () => {
    const service = createServiceHarness()
    const entriesA = [
      { value: 'alpha', priority: 1.2 },
      { value: 'beta', priority: 1.0 },
      { value: 'ng:ab', priority: 0.5 }
    ]
    const entriesB = [
      { value: 'ng:ab', priority: 0.5 },
      { value: 'beta', priority: 1.0 },
      { value: 'alpha', priority: 1.2 }
    ]

    const hashA = service.buildKeywordHash(entriesA)
    const hashB = service.buildKeywordHash(entriesB)

    expect(hashA).toBe(hashB)
  })

  it('prepareDocument 会限制单条记录的 n-gram 写入上限', async () => {
    const service = createServiceHarness()
    const keywords = Array.from({ length: 220 }, (_, index) => ({
      value: `keywordtoken${index}`,
      priority: 1.5
    }))

    const item: SearchIndexItem = {
      itemId: 'file:/tmp/ngram-cap.txt',
      providerId: 'file-provider',
      type: 'file',
      name: 'Ngram Cap Test',
      keywords
    }

    const doc = await service.prepareDocument(item)
    const ngrams = doc.keywordEntries.filter((entry: { value: string }) =>
      entry.value.startsWith('ng:')
    )

    expect(ngrams.length).toBeLessThanOrEqual(256)
    expect(doc.keywordHash).toMatch(/^[a-f0-9]{40}$/)
  })

  it('prepareDocument 对相同输入生成相同 keywordHash', async () => {
    const service = createServiceHarness()

    const item: SearchIndexItem = {
      itemId: 'app:demo/test',
      providerId: 'app-provider',
      type: 'application',
      name: 'Demo App',
      displayName: 'Demo App',
      aliases: [{ value: 'da', priority: 1.5 }],
      keywords: [{ value: 'demo', priority: 1.2 }],
      path: '/Applications/Demo App.app'
    }

    const first = await service.prepareDocument(item)
    const second = await service.prepareDocument(item)

    expect(first.keywordHash).toBe(second.keywordHash)
  })

  it('lookupBySubsequence 先用 SQLite LIKE 形状预过滤并保持结果排序', async () => {
    const queryTexts: string[] = []
    const db = {
      all: vi.fn(async (query: unknown) => {
        queryTexts.push(queryText(query))
        return [
          { item_id: 'app:netease', keyword: 'netease', priority: 1.1 },
          { item_id: 'app:note', keyword: 'note', priority: 1.6 },
          { item_id: 'app:notepad', keyword: 'notepad', priority: 1.2 }
        ]
      })
    }
    const service = new SearchIndexService(
      db as unknown as ConstructorParameters<typeof SearchIndexService>[0],
      { directMode: true }
    ) as unknown as SearchIndexHarness
    service.initialized = true

    const results = await service.lookupBySubsequence('app-provider', 'nte', 2, 10_000)

    expect(results.map((item) => item.itemId)).toEqual(['app:note', 'app:notepad'])
    expect(queryTexts[0]).toContain('keyword LIKE')
    expect(queryTexts[0]).toContain('ESCAPE')
    expect(queryTexts[0]).toContain('ORDER BY length(keyword) ASC, priority DESC, keyword ASC')
    expect(db.all.mock.calls[0]).toMatchObject([
      expect.objectContaining({
        queryChunks: expect.arrayContaining(['%n%t%e%', 2000])
      })
    ])
  })

  it('removeProviderItems 只删除匹配 provider 的索引与关键词元数据', async () => {
    const runQueries: string[] = []
    const deleteCalls: Array<{ table: string; query: string }> = []
    const db = {
      all: vi.fn(async () => []),
      run: vi.fn(async (query: unknown) => {
        runQueries.push(queryText(query))
        return { rowsAffected: 1 }
      }),
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
        callback({
          run: vi.fn(async (query: unknown) => {
            runQueries.push(queryText(query))
            return { rowsAffected: 1 }
          }),
          delete: vi.fn((table: { [Symbol.toStringTag]?: string }) => ({
            where: vi.fn(async (query: unknown) => {
              deleteCalls.push({
                table: String(table),
                query: queryText(query)
              })
            })
          }))
        })
      )
    }
    const service = new SearchIndexService(
      db as unknown as ConstructorParameters<typeof SearchIndexService>[0],
      { directMode: true }
    )

    await expect(service.removeProviderItems('quicklink', ['shared-key'])).resolves.toBe(1)

    expect(
      runQueries.some(
        (query) =>
          query.includes('DELETE FROM search_index WHERE provider =') &&
          query.includes('AND item_id =')
      )
    ).toBe(true)
    expect(deleteCalls).toHaveLength(2)
  })

  it('removeByProvider returns the actual removed row count', async () => {
    const db = {
      all: vi.fn(async () => [{ item_id: 'one' }, { item_id: 'two' }]),
      run: vi.fn(),
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
        callback({
          run: vi
            .fn()
            .mockResolvedValueOnce({ rowsAffected: 1 })
            .mockResolvedValueOnce({ rowsAffected: 0 }),
          delete: vi.fn(() => ({
            where: vi.fn(async () => undefined)
          }))
        })
      )
    }
    const service = new SearchIndexService(
      db as unknown as ConstructorParameters<typeof SearchIndexService>[0],
      { directMode: true }
    )

    await expect(service.removeByProvider('quicklink')).resolves.toBe(1)
  })
})
