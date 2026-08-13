import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mapIndexedFileSourceRecord } from '@talex-touch/utils/search'
import { describe, expect, it, vi } from 'vitest'
import { mapIndexedSourceRecordToSearchIndexItem } from '../../../search-engine/indexing-store-adapter'
import { SearchIndexService } from '../../../search-engine/search-index-service'
import {
  FILE_KEYWORD_BACKFILL_VERSION,
  FileProviderKeywordBackfillService,
  type FileProviderKeywordBackfillDeps
} from './file-provider-keyword-backfill-service'

interface Row {
  id: number
}

function makeService(
  overrides: Partial<FileProviderKeywordBackfillDeps<Row>> & { rows?: Row[] } = {}
): {
  service: FileProviderKeywordBackfillService<Row>
  deps: FileProviderKeywordBackfillDeps<Row>
  loadedAfterIds: number[]
  emittedIds: number[][]
} {
  const rows = overrides.rows ?? []
  const loadedAfterIds: number[] = []
  const emittedIds: number[][] = []

  const deps: FileProviderKeywordBackfillDeps<Row> = {
    getAppliedVersion: vi.fn(async () => null),
    setAppliedVersion: vi.fn(async () => {}),
    isReady: () => true,
    loadRowsPage: async (afterId, limit) => {
      loadedAfterIds.push(afterId)
      return rows.filter((row) => row.id > afterId).slice(0, limit)
    },
    emitRows: async (page) => {
      emittedIds.push(page.map((row) => row.id))
    },
    waitForWriteCapacity: vi.fn(async () => {}),
    logInfo: () => {},
    logWarn: () => {},
    ...overrides
  }

  return {
    service: new FileProviderKeywordBackfillService<Row>(deps),
    deps,
    loadedAfterIds,
    emittedIds
  }
}

describe('FileProviderKeywordBackfillService version gate', () => {
  it('runs when no version was ever recorded', async () => {
    const { service, deps, emittedIds } = makeService({ rows: [{ id: 1 }, { id: 2 }] })

    await expect(service.run()).resolves.toMatchObject({
      status: 'completed',
      scanned: 2,
      emitted: 2,
      failed: 0
    })
    expect(emittedIds).toEqual([[1, 2]])
    expect(deps.setAppliedVersion).toHaveBeenCalledWith(FILE_KEYWORD_BACKFILL_VERSION)
  })

  it('runs again when the recorded version is older than the current one', async () => {
    const { service, deps } = makeService({
      rows: [{ id: 7 }],
      getAppliedVersion: vi.fn(async () => FILE_KEYWORD_BACKFILL_VERSION - 1)
    })

    await expect(service.run()).resolves.toMatchObject({ status: 'completed', emitted: 1 })
    expect(deps.setAppliedVersion).toHaveBeenCalledWith(FILE_KEYWORD_BACKFILL_VERSION)
  })

  it('skips without reading anything when the current version is recorded', async () => {
    const { service, deps, loadedAfterIds } = makeService({
      rows: [{ id: 1 }],
      getAppliedVersion: vi.fn(async () => FILE_KEYWORD_BACKFILL_VERSION)
    })

    await expect(service.run()).resolves.toMatchObject({
      status: 'skipped',
      reason: 'already-applied',
      scanned: 0
    })
    expect(loadedAfterIds).toEqual([])
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
  })

  it('skips without recording a version when the write path is unavailable', async () => {
    const { service, deps, loadedAfterIds } = makeService({
      rows: [{ id: 1 }],
      isReady: () => false
    })

    await expect(service.run()).resolves.toMatchObject({
      status: 'skipped',
      reason: 'unavailable'
    })
    expect(loadedAfterIds).toEqual([])
    // Unrecorded: the next boot must retry once the write path is up.
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
  })
})

describe('FileProviderKeywordBackfillService paging', () => {
  it('walks the table with an id cursor and waits for write capacity per page', async () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({ id: index + 1 }))
    const { service, deps, loadedAfterIds, emittedIds } = makeService({ rows })

    await expect(service.run()).resolves.toMatchObject({ scanned: 250, emitted: 250, failed: 0 })

    // Cursor starts at 0 and then carries the last id of each page; the final
    // read returns nothing and ends the walk.
    expect(loadedAfterIds).toEqual([0, 100, 200, 250])
    expect(emittedIds.map((page) => page.length)).toEqual([100, 100, 50])
    expect(deps.waitForWriteCapacity).toHaveBeenCalledTimes(3)
  })

  it('leaves the version unrecorded when a page fails, and keeps walking', async () => {
    const rows = Array.from({ length: 150 }, (_, index) => ({ id: index + 1 }))
    const { service, deps, emittedIds } = makeService({
      rows,
      emitRows: async (page) => {
        if (page[0]?.id === 1) throw new Error('write path down')
        emittedIds.push(page.map((row) => row.id))
      }
    })

    await expect(service.run()).resolves.toMatchObject({
      status: 'completed',
      scanned: 150,
      emitted: 50,
      failed: 100
    })
    expect(deps.setAppliedVersion).not.toHaveBeenCalled()
  })
})

describe('FileProviderKeywordBackfillService end-to-end', () => {
  const providerId = 'file-provider'

  async function withSearchIndex(
    run: (service: SearchIndexService, client: Client) => Promise<void>
  ): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-keyword-backfill-'))
    let client: Client | undefined
    try {
      client = createClient({ url: `file:${join(directory, 'search-index.sqlite')}` })
      await client.execute(`
        CREATE TABLE keyword_mappings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT NOT NULL,
          item_id TEXT NOT NULL,
          provider_id TEXT NOT NULL DEFAULT '',
          priority REAL NOT NULL DEFAULT 1.0
        )
      `)
      await client.execute(`
        CREATE TABLE search_index_meta (
          provider_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          keyword_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          PRIMARY KEY (provider_id, item_id)
        )
      `)
      const searchIndex = new SearchIndexService(drizzle(client) as never, {
        directMode: true,
        initializationMode: 'writer'
      })
      await searchIndex.warmup()
      await run(searchIndex, client)
    } finally {
      client?.close()
      await rm(directory, { recursive: true, force: true })
    }
  }

  async function keywordRows(client: Client): Promise<Array<{ id: number; keyword: string }>> {
    const result = await client.execute(
      'SELECT id, keyword FROM keyword_mappings ORDER BY keyword, id'
    )
    return result.rows.map((row) => ({ id: Number(row.id), keyword: String(row.keyword) }))
  }

  it('makes keywords the old charset dropped reachable, and rewrites nothing on a retry', async () => {
    await withSearchIndex(async (searchIndex, client) => {
      const filePath = '/home/me/café rapport.pdf'
      const row = {
        id: 1,
        path: filePath,
        name: 'café rapport.pdf',
        displayName: null,
        extension: '.pdf',
        type: 'file',
        isDir: false,
        mtime: new Date(0),
        ctime: new Date(0)
      }

      // The state an old-charset run left behind: the accented and spaced
      // keywords were vetoed whole, so only the plain ascii ones exist, under a
      // hash that predates the schema version.
      for (const keyword of ['rapport', 'pdf']) {
        await client.execute({
          sql: 'INSERT INTO keyword_mappings (keyword, item_id, provider_id, priority) VALUES (?,?,?,?)',
          args: [keyword, filePath, providerId, 1.1]
        })
      }
      await client.execute({
        sql: 'INSERT INTO search_index_meta (provider_id, item_id, keyword_hash) VALUES (?,?,?)',
        args: [providerId, filePath, 'legacy-charset-hash']
      })

      await expect(searchIndex.lookupByKeywords(providerId, ['café', 'cafe'], 50)).resolves.toEqual(
        new Map()
      )

      // Production re-emit chain: file row -> indexed-source record -> index item.
      const emitRows = async (rows: Array<typeof row>): Promise<void> => {
        const items = rows
          .map((entry) =>
            mapIndexedSourceRecordToSearchIndexItem(
              mapIndexedFileSourceRecord(entry as never, { sourceId: providerId })
            )
          )
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
        await searchIndex.indexItems(items)
      }

      const service = new FileProviderKeywordBackfillService<typeof row>({
        getAppliedVersion: async () => null,
        setAppliedVersion: async () => {},
        isReady: () => true,
        loadRowsPage: async (afterId) => (afterId === 0 ? [row] : []),
        emitRows,
        waitForWriteCapacity: async () => {},
        logInfo: () => {},
        logWarn: () => {}
      })

      await expect(service.run()).resolves.toMatchObject({
        status: 'completed',
        scanned: 1,
        emitted: 1,
        failed: 0
      })

      const found = await searchIndex.lookupByKeywords(
        providerId,
        ['café', 'cafe', 'café rapport pdf'],
        50
      )
      expect([...found.keys()].sort()).toEqual(['café', 'café rapport pdf', 'cafe'].sort())
      for (const entries of found.values()) {
        expect(entries.map((entry) => entry.itemId)).toEqual([filePath])
      }

      // A retry (version still unrecorded) must not rewrite a single row: the
      // writer compares the keyword hash before touching keyword_mappings, and
      // any rewrite would delete + reinsert, changing the autoincrement ids.
      const before = await keywordRows(client)
      await expect(service.run()).resolves.toMatchObject({ emitted: 1, failed: 0 })
      expect(await keywordRows(client)).toEqual(before)
    })
  })
})
