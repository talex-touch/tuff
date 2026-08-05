/**
 * Split-routing regression for embeddings (adjacent defect of the search
 * split, issue #295 / task 08-04): EmbeddingService used to be constructed
 * with the PRIMARY db while dbUtils routed embedding writes to the
 * worker-owned search file — with the split on, embeddings split-brained
 * across two files. Embeddings must have exactly ONE home: the search file
 * when the split is on (writes forwarded to the worker, the sole writer of
 * its file), the primary when off. The routing is resolved PER CALL, never
 * captured at construction (the aux resolver-timing trap class).
 *
 * Modeled on db/utils.split.test.ts: two real libsql dbs, the worker
 * simulated by executing forwarded statements on the search connection.
 */
import type { InValue } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../db/schema'
import { EmbeddingService, type EmbeddingDbRouting } from './embedding-service'

vi.mock('../../../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    embedding: {
      generate: vi.fn(async () => ({ result: [0.1, 0.2, 0.3], model: 'test-model' }))
    }
  }
}))

// Shape from migration 0000 (the drizzle-migrated table both files get).
const EMBEDDINGS_DDL = `CREATE TABLE embeddings (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  source_id text NOT NULL,
  source_type text NOT NULL,
  embedding text NOT NULL,
  model text NOT NULL,
  content_hash text,
  created_at integer DEFAULT (strftime('%s', 'now')) NOT NULL
)`

async function makeDb(): Promise<{
  client: ReturnType<typeof createClient>
  db: ReturnType<typeof drizzle<typeof schema>>
}> {
  const client = createClient({ url: ':memory:' })
  await client.execute(EMBEDDINGS_DDL)
  return { client, db: drizzle(client, { schema }) }
}

describe('EmbeddingService split-aware routing', () => {
  it('split on: writes land only in the worker-owned search db and reads come back from it', async () => {
    const main = await makeDb()
    const search = await makeDb()

    // Simulate the worker: run forwarded statements on the search connection.
    const execWrite = vi.fn<EmbeddingDbRouting['execWrite']>(async (statements) => {
      for (const statement of statements) {
        await search.client.execute({ sql: statement.sql, args: statement.args as InValue[] })
      }
      return []
    })
    const service = new EmbeddingService({
      isSplitEnabled: () => true,
      getReadDb: () => search.db,
      getPrimaryDb: () => main.db,
      execWrite
    })

    await service.indexFile('file-1', 'hello world semantic content')

    // The delete+insert upsert pair is forwarded as ONE atomic transaction.
    expect(execWrite).toHaveBeenCalledTimes(1)
    expect(execWrite.mock.calls[0]![1]).toBe('transaction')

    const inSearch = await search.client.execute(
      'SELECT source_id, source_type, embedding FROM embeddings'
    )
    const inMain = await main.client.execute('SELECT source_id FROM embeddings')
    expect(inSearch.rows).toHaveLength(1)
    expect(inMain.rows).toHaveLength(0)
    // The compiled params went through the vector customType driver mapping.
    expect(JSON.parse(String(inSearch.rows[0]!.embedding))).toEqual([0.1, 0.2, 0.3])

    // Reads (existing-hash check, count, semantic scan) come from the search db.
    expect(await service.getEmbeddingCount()).toBe(1)
    const results = await service.semanticSearch('hello world')
    expect(results).toEqual([{ sourceId: 'file-1', score: expect.closeTo(1, 5) }])

    // Removal routes through the worker too.
    await service.removeFiles(['file-1'])
    const afterRemove = await search.client.execute('SELECT source_id FROM embeddings')
    expect(afterRemove.rows).toHaveLength(0)
  })

  it('split off: writes stay on the primary db; flipping the split moves the NEXT write (per-call resolution)', async () => {
    const main = await makeDb()
    const search = await makeDb()
    let splitEnabled = false

    const execWrite = vi.fn<EmbeddingDbRouting['execWrite']>(async (statements) => {
      for (const statement of statements) {
        await search.client.execute({ sql: statement.sql, args: statement.args as InValue[] })
      }
      return []
    })
    const service = new EmbeddingService({
      isSplitEnabled: () => splitEnabled,
      getReadDb: () => (splitEnabled ? search.db : main.db),
      getPrimaryDb: () => main.db,
      execWrite
    })

    await service.indexFile('file-off', 'primary content')

    expect(execWrite).not.toHaveBeenCalled()
    expect((await main.client.execute('SELECT source_id FROM embeddings')).rows).toHaveLength(1)
    expect((await search.client.execute('SELECT source_id FROM embeddings')).rows).toHaveLength(0)
    expect(await service.getEmbeddingCount()).toBe(1)

    // Guard against the resolver-timing trap: the decision is made per call,
    // so a service constructed before the split state settled still routes the
    // NEXT write to the file the worker owns — no reconstruction needed.
    splitEnabled = true
    await service.indexFile('file-on', 'search content')

    expect(execWrite).toHaveBeenCalledTimes(1)
    const inSearch = await search.client.execute('SELECT source_id FROM embeddings')
    const inMain = await main.client.execute('SELECT source_id FROM embeddings')
    expect(inSearch.rows).toHaveLength(1)
    expect(inSearch.rows[0]).toMatchObject({ source_id: 'file-on' })
    // The primary keeps only the split-off row — no dual-home writes.
    expect(inMain.rows).toHaveLength(1)
    expect(inMain.rows[0]).toMatchObject({ source_id: 'file-off' })
  })
})
