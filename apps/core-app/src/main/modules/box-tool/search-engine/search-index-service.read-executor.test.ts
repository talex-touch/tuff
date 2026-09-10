import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { SQL } from 'drizzle-orm'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SearchIndexService, type SearchIndexReadExecutor } from './search-index-service'

const PROVIDER = 'read-worker-parity'

async function withIsolatedIndex(
  run: (services: { direct: SearchIndexService; reader: SearchIndexService }) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-search-read-parity-'))
  let writerClient: Client | undefined
  let readerClient: Client | undefined
  try {
    const databasePath = join(directory, 'search-index.sqlite')
    writerClient = createClient({ url: `file:${databasePath}` })
    await writerClient.execute(`
      CREATE TABLE keyword_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL DEFAULT '',
        priority REAL NOT NULL DEFAULT 1.0
      )
    `)
    await writerClient.execute(`
      CREATE TABLE search_index_meta (
        provider_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        keyword_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (provider_id, item_id)
      )
    `)

    const direct = new SearchIndexService(drizzle(writerClient) as never, {
      directMode: true,
      initializationMode: 'writer'
    })
    await direct.warmup()
    await writerClient.execute({
      sql: `INSERT INTO search_index (
        item_id, provider, type, title, title_compact, keywords, tags, path, content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'item:cafe',
        PROVIDER,
        'app',
        'Café 測試',
        'cafetest',
        'café unicode 測試',
        '',
        '/tmp/café',
        ''
      ]
    })
    await writerClient.execute({
      sql: `INSERT INTO search_index (
        item_id, provider, type, title, title_compact, keywords, tags, path, content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        'item:network',
        PROVIDER,
        'app',
        'Netease Network',
        'neteasenetwork',
        'netease chrome',
        '',
        '/tmp/network',
        ''
      ]
    })
    for (const [keyword, itemId, priority] of [
      ['café', 'item:cafe', 1.4],
      ['測試', 'item:cafe', 1.2],
      ['100% literal', 'item:cafe', 1.1],
      ['netease', 'item:network', 1.3],
      ['chrome', 'item:network', 1.0],
      ['ng:ch', 'item:network', 1.1],
      ['ng:hr', 'item:network', 1.1],
      ['ng:ro', 'item:network', 1.1],
      ['ng:om', 'item:network', 1.1],
      ['ng:me', 'item:network', 1.1]
    ]) {
      await writerClient.execute({
        sql: 'INSERT INTO keyword_mappings (keyword, item_id, provider_id, priority) VALUES (?, ?, ?, ?)',
        args: [keyword, itemId, PROVIDER, priority]
      })
    }

    readerClient = createClient({ url: `file:${databasePath}` })
    const readerDb = drizzle(readerClient!)
    let forbidDirectReads = false
    const schemaReaderDb = {
      all: async <T>(query: SQL): Promise<T[]> => {
        if (forbidDirectReads) throw new Error('READER_BYPASSED_EXECUTOR')
        return await readerDb.all<T>(query)
      }
    }
    const executor: SearchIndexReadExecutor = {
      all: async <T>(query: SQL): Promise<T[]> => await readerDb.all<T>(query)
    }
    const reader = new SearchIndexService(schemaReaderDb as never, {
      initializationMode: 'reader',
      readiness: { waitUntilReady: async () => undefined },
      readExecutor: executor
    })
    await reader.warmup()
    forbidDirectReads = true

    await run({ direct, reader })
  } finally {
    readerClient?.close()
    writerClient?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

function keywordEntries(
  entries: Map<string, Array<{ itemId: string; priority: number }>>
): Array<[string, Array<{ itemId: string; priority: number }>]> {
  return [...entries.entries()].sort(([left], [right]) => left.localeCompare(right))
}

describe('SearchIndexService read executor parity', () => {
  it('preserves FTS and keyword lookup results through the isolated reader connection', async () => {
    await withIsolatedIndex(async ({ direct, reader }) => {
      const [directFts, readerFts] = await Promise.all([
        direct.search(PROVIDER, 'café'),
        reader.search(PROVIDER, 'café')
      ])
      expect(readerFts).toEqual(directFts)
      expect(readerFts.map((row) => row.itemId)).toEqual(['item:cafe'])

      const [directExact, readerExact] = await Promise.all([
        direct.lookupByKeywords(PROVIDER, ['café', '測試']),
        reader.lookupByKeywords(PROVIDER, ['café', '測試'])
      ])
      expect(keywordEntries(readerExact)).toEqual(keywordEntries(directExact))
      expect(keywordEntries(readerExact)).toEqual([
        ['café', [{ itemId: 'item:cafe', priority: 1.4 }]],
        ['測試', [{ itemId: 'item:cafe', priority: 1.2 }]]
      ])

      const [directPrefix, readerPrefix] = await Promise.all([
        direct.lookupByKeywordPrefix(PROVIDER, '100%'),
        reader.lookupByKeywordPrefix(PROVIDER, '100%')
      ])
      expect(readerPrefix).toEqual(directPrefix)
      expect(readerPrefix).toEqual([
        { itemId: 'item:cafe', keyword: '100% literal', priority: 1.1 }
      ])

      const [directSubsequence, readerSubsequence] = await Promise.all([
        direct.lookupBySubsequence(PROVIDER, 'nte'),
        reader.lookupBySubsequence(PROVIDER, 'nte')
      ])
      expect(readerSubsequence).toEqual(directSubsequence)
      expect(readerSubsequence).toEqual([
        { itemId: 'item:network', keyword: 'netease', priority: 1.3 }
      ])

      const [directNgrams, readerNgrams, directCount, readerCount] = await Promise.all([
        direct.lookupByNgrams(PROVIDER, 'chrome'),
        reader.lookupByNgrams(PROVIDER, 'chrome'),
        direct.countByProvider(PROVIDER),
        reader.countByProvider(PROVIDER)
      ])
      expect(readerNgrams).toEqual(directNgrams)
      expect(readerNgrams).toEqual([{ itemId: 'item:network', overlapCount: 5 }])
      expect(readerCount).toBe(directCount)
      expect(readerCount).toBe(2)
    })
  })
})
