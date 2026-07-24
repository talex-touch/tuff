import type { InValue } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import * as schema from './schema'
import { createDbUtils, type DbUtilsSplitContext } from './utils'

/**
 * Integration test for the search-split write/read routing (issue #295).
 *
 * Proves that when the split is enabled, `dbUtils` file-index WRITES are
 * forwarded (via execWrite → the worker's connection, simulated here by a real
 * temp libsql db) to search-index.db and file-index READS come back from it —
 * with NO data leaking into the primary db. This is the silent-data-loss guard
 * for 2c/2d: same SQL, different connection, byte-identical results.
 */
async function makeDb(): Promise<{
  client: ReturnType<typeof createClient>
  db: ReturnType<typeof drizzle<typeof schema>>
}> {
  const client = createClient({ url: ':memory:' })
  await client.execute(`CREATE TABLE file_extensions (
    file_id integer NOT NULL,
    key text NOT NULL,
    value text,
    PRIMARY KEY (file_id, key)
  )`)
  return { client, db: drizzle(client, { schema }) }
}

describe('dbUtils search-split routing (execWrite forwarding)', () => {
  it('forwards file-index writes to the search db and reads them back — nothing in the primary db', async () => {
    const main = await makeDb()
    const search = await makeDb()

    // Simulate the worker: run forwarded statements on the search connection.
    const writer: DbUtilsSplitContext['writer'] = {
      execWrite: async (statements) => {
        for (const statement of statements) {
          await search.client.execute({ sql: statement.sql, args: statement.args as InValue[] })
        }
        return []
      }
    }

    const dbUtils = createDbUtils(main.db, main.db, {
      enabled: true,
      searchDb: search.db,
      writer
    })

    await dbUtils.addFileExtensions([
      { fileId: 1, key: 'bundleId', value: 'com.test.app' },
      { fileId: 1, key: 'icon', value: '/tmp/icon.png' }
    ])

    // The writes landed in the SEARCH db, and NOT the primary db.
    const inSearch = await search.client.execute('SELECT file_id, key, value FROM file_extensions')
    const inMain = await main.client.execute('SELECT file_id, key, value FROM file_extensions')
    expect(inSearch.rows).toHaveLength(2)
    expect(inMain.rows).toHaveLength(0)

    // Reads via dbUtils come from the SEARCH db.
    const read = await dbUtils.getFileExtensions(1)
    expect(read).toHaveLength(2)
    expect(read).toEqual(
      expect.arrayContaining([
        { fileId: 1, key: 'bundleId', value: 'com.test.app' },
        { fileId: 1, key: 'icon', value: '/tmp/icon.png' }
      ])
    )

    // A routed delete removes from the search db too.
    await dbUtils.removeFileExtensions(1, ['icon'])
    const afterDelete = await dbUtils.getFileExtensions(1)
    expect(afterDelete).toHaveLength(1)
    expect(afterDelete[0]).toMatchObject({ key: 'bundleId' })
  })

  it('with the split off, writes/reads stay on the primary db (baseline, byte-identical path)', async () => {
    const main = await makeDb()
    const dbUtils = createDbUtils(main.db)

    await dbUtils.addFileExtensions([{ fileId: 2, key: 'icon', value: 'x' }])

    const read = await dbUtils.getFileExtensions(2)
    expect(read).toHaveLength(1)
    const inMain = await main.client.execute('SELECT file_id FROM file_extensions')
    expect(inMain.rows).toHaveLength(1)
  })
})
