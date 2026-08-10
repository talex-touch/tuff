import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { describe, expect, it } from 'vitest'
import { upsertSourceScopedScanProgress } from './scan-progress-schema'

/**
 * Both scan-progress upserts built one INSERT with a VALUES row per path and no
 * cap, while normalizeScanProgressUpsert only dedupes and validates. SQLite
 * refuses more than 32766 bound parameters — measured against this build, 16383
 * two-column rows succeed and 16384 fail with "too many SQL variables" — so a
 * large enough scan lost the entire batch (#671).
 *
 * The source-scoped statement binds three per row, putting its real ceiling at
 * 10922, which is why these use a size above that rather than above 16383.
 */

const OVER_THE_LIMIT = 12_000

async function withDb(run: (client: Client) => Promise<void>): Promise<void> {
  const client = createClient({ url: ':memory:' })
  try {
    await client.execute(`
      CREATE TABLE scan_progress (
        source_id TEXT NOT NULL,
        path TEXT NOT NULL,
        last_scanned INTEGER NOT NULL,
        PRIMARY KEY (source_id, path)
      )
    `)
    await run(client)
  } finally {
    client.close()
  }
}

describe('scan progress upsert chunking', () => {
  it('writes a batch larger than SQLite accepts in one statement', async () => {
    await withDb(async (client) => {
      const paths = Array.from({ length: OVER_THE_LIMIT }, (_, i) => `/scan/file-${i}`)

      await upsertSourceScopedScanProgress(drizzle(client) as never, {
        sourceId: 'file-provider',
        paths,
        lastScannedAt: 1_700_000_000_000
      })

      const counted = await client.execute('SELECT COUNT(*) AS n FROM scan_progress')
      expect(Number(counted.rows[0].n)).toBe(OVER_THE_LIMIT)
    })
  })

  it('still upserts rather than duplicating on a second pass', async () => {
    await withDb(async (client) => {
      const paths = Array.from({ length: OVER_THE_LIMIT }, (_, i) => `/scan/file-${i}`)
      const db = drizzle(client) as never

      await upsertSourceScopedScanProgress(db, {
        sourceId: 'file-provider',
        paths,
        lastScannedAt: 1_700_000_000_000
      })
      await upsertSourceScopedScanProgress(db, {
        sourceId: 'file-provider',
        paths,
        lastScannedAt: 1_800_000_000_000
      })

      const counted = await client.execute('SELECT COUNT(*) AS n FROM scan_progress')
      expect(Number(counted.rows[0].n)).toBe(OVER_THE_LIMIT)

      // Chunking must not break the ON CONFLICT update across chunk boundaries.
      const stale = await client.execute(
        'SELECT COUNT(*) AS n FROM scan_progress WHERE last_scanned != 1800000000000'
      )
      expect(Number(stale.rows[0].n)).toBe(0)
    })
  })

  it('leaves a batch under the ceiling in one piece', async () => {
    await withDb(async (client) => {
      await upsertSourceScopedScanProgress(drizzle(client) as never, {
        sourceId: 'file-provider',
        paths: ['/scan/a', '/scan/b'],
        lastScannedAt: 1_700_000_000_000
      })

      const counted = await client.execute('SELECT COUNT(*) AS n FROM scan_progress')
      expect(Number(counted.rows[0].n)).toBe(2)
    })
  })
})
