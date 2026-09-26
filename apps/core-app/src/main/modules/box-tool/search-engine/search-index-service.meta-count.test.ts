import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { SQL } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SearchIndexService,
  type SearchIndexItem,
  type SearchIndexReadExecutor
} from './search-index-service'

const APP_PROVIDER = 'app-provider'
const FILE_PROVIDER = 'file-provider'
const dialect = new SQLiteSyncDialect()

function buildItems(providerId: string, names: string[]): SearchIndexItem[] {
  return names.map((name) => ({
    itemId: `/${providerId}/${name}`,
    providerId,
    type: providerId === APP_PROVIDER ? 'app' : 'file',
    name,
    path: `/${providerId}/${name}`
  }))
}

interface IndexHarness {
  writerClient: Client
  writer: SearchIndexService
  reader: SearchIndexService
  /** SQL text of every read the reader sent through its executor, in order. */
  reads: string[]
  openWriter: () => Promise<SearchIndexService>
}

async function withIsolatedIndex(run: (harness: IndexHarness) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-search-meta-count-'))
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
    const openWriter = async (): Promise<SearchIndexService> => {
      const service = new SearchIndexService(drizzle(writerClient!) as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await service.warmup()
      return service
    }
    const writer = await openWriter()

    readerClient = createClient({ url: `file:${databasePath}` })
    const readerDb = drizzle(readerClient)
    const reads: string[] = []
    const executor: SearchIndexReadExecutor = {
      all: async <T>(query: SQL): Promise<T[]> => {
        reads.push(dialect.sqlToQuery(query).sql.replace(/\s+/g, ' ').trim())
        return await readerDb.all<T>(query)
      }
    }
    const reader = new SearchIndexService(readerDb as never, {
      initializationMode: 'reader',
      readiness: { waitUntilReady: async () => undefined },
      readExecutor: executor
    })
    await reader.warmup()
    reads.length = 0

    await run({ writerClient, writer, reader, reads, openWriter })
  } finally {
    readerClient?.close()
    writerClient?.close()
    await rm(directory, { recursive: true, force: true })
  }
}

const FTS_PROVIDER_SCAN = 'FROM search_index WHERE provider'

describe('SearchIndexService.countByProviderViaMeta', () => {
  it('answers the provider count from meta without scanning the FTS table', async () => {
    await withIsolatedIndex(async ({ writer, reader, reads }) => {
      await writer.applyProviderItems(APP_PROVIDER, buildItems(APP_PROVIDER, ['alpha', 'beta']))
      await writer.applyProviderItems(
        FILE_PROVIDER,
        buildItems(FILE_PROVIDER, ['one.md', 'two.md', 'three.md'])
      )

      await expect(reader.countByProviderViaMeta(APP_PROVIDER)).resolves.toBe(2)
      // One round trip on the read worker, and not the full-content FTS walk.
      expect(reads).toHaveLength(1)
      expect(reads[0]).not.toContain(FTS_PROVIDER_SCAN)
      expect(reads[0]).toContain('search_index_meta')

      // The same answer the FTS count gives while the two tables agree.
      await expect(reader.countByProvider(APP_PROVIDER)).resolves.toBe(2)
      await expect(reader.countByProviderViaMeta(FILE_PROVIDER)).resolves.toBe(3)
    })
  })

  it('stays in step with the FTS count through removals', async () => {
    await withIsolatedIndex(async ({ writer, reader }) => {
      await writer.applyProviderItems(
        APP_PROVIDER,
        buildItems(APP_PROVIDER, ['alpha', 'beta', 'gamma'])
      )
      await writer.removeProviderItems(APP_PROVIDER, ['/app-provider/beta'])

      await expect(reader.countByProviderViaMeta(APP_PROVIDER)).resolves.toBe(2)
      await expect(reader.countByProvider(APP_PROVIDER)).resolves.toBe(2)

      await writer.removeByProvider(APP_PROVIDER)
      await expect(reader.countByProviderViaMeta(APP_PROVIDER)).resolves.toBe(0)
    })
  })

  it('reports zero when the FTS table was emptied underneath surviving meta rows', async () => {
    await withIsolatedIndex(async ({ writerClient, writer, reader }) => {
      await writer.applyProviderItems(APP_PROVIDER, buildItems(APP_PROVIDER, ['alpha', 'beta']))
      // The shape a bulk wipe leaves behind: FTS emptied, meta untouched.
      await writerClient.execute('DELETE FROM search_index')
      const orphanMeta = await writerClient.execute(
        `SELECT count(*) AS cnt FROM search_index_meta WHERE provider_id = '${APP_PROVIDER}'`
      )
      expect(Number(orphanMeta.rows[0]?.cnt)).toBe(2)

      await expect(reader.countByProviderViaMeta(APP_PROVIDER)).resolves.toBe(0)
      await expect(reader.countByProvider(APP_PROVIDER)).resolves.toBe(0)
    })
  })

  it('falls back to the exact FTS count for rows written before meta existed', async () => {
    await withIsolatedIndex(async ({ writerClient, reader, reads }) => {
      for (const name of ['legacy-a', 'legacy-b', 'legacy-c']) {
        await writerClient.execute({
          sql: `INSERT INTO search_index (
            item_id, provider, type, title, title_compact, keywords, tags, path, content
          ) VALUES (?, ?, 'app', ?, ?, '', '', '', '')`,
          args: [`/legacy/${name}`, APP_PROVIDER, name, name]
        })
      }

      await expect(reader.countByProviderViaMeta(APP_PROVIDER)).resolves.toBe(3)
      // Meta had nothing for the provider, so the FTS decided.
      expect(reads.some((read) => read.includes(FTS_PROVIDER_SCAN))).toBe(true)
    })
  })

  it('drops meta rows orphaned by a rebuilt FTS table before other providers refill it', async () => {
    await withIsolatedIndex(async ({ writerClient, writer, reader, openWriter }) => {
      await writer.applyProviderItems(APP_PROVIDER, buildItems(APP_PROVIDER, ['alpha', 'beta']))

      // A rebuild drops the FTS table; the next writer initialization recreates it empty.
      await writerClient.execute('DROP TABLE search_index')
      const rebuilt = await openWriter()
      // Files come back first; the app rows have not been re-applied yet.
      await rebuilt.applyProviderItems(FILE_PROVIDER, buildItems(FILE_PROVIDER, ['one.md']))

      await expect(reader.countByProvider(APP_PROVIDER)).resolves.toBe(0)
      await expect(reader.countByProviderViaMeta(APP_PROVIDER)).resolves.toBe(0)
      await expect(reader.countByProviderViaMeta(FILE_PROVIDER)).resolves.toBe(1)
    })
  })

  it('keeps meta rows when the writer initializes over an existing FTS table', async () => {
    await withIsolatedIndex(async ({ writer, reader, openWriter }) => {
      await writer.applyProviderItems(APP_PROVIDER, buildItems(APP_PROVIDER, ['alpha', 'beta']))

      // An ordinary restart: the table exists, so nothing is orphaned and nothing is cleared.
      await openWriter()

      await expect(reader.countByProviderViaMeta(APP_PROVIDER)).resolves.toBe(2)
    })
  })
})
