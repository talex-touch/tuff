import { createClient, type Client } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SearchIndexReadWorkerClient } from './search-index-read-worker-client'

const defaultWorkerPath = fileURLToPath(
  new URL('../../../../../../out/main/search-index-read-worker.js', import.meta.url)
)
const configuredWorkerPath = process.env.TUFF_SEARCH_READ_WORKER_TEST_PATH?.trim()
const workerPath = configuredWorkerPath || defaultWorkerPath
const workerBuilt = existsSync(workerPath)

async function withDatabase(
  run: (databasePath: string, writer: Client) => Promise<void>
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'tuff-search-read-worker-'))
  const databasePath = join(directory, 'search-index.sqlite')
  const writer = createClient({ url: `file:${databasePath}` })
  try {
    await writer.execute('CREATE TABLE entries (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
    await writer.execute({
      sql: 'INSERT INTO entries (id, name) VALUES (?, ?), (?, ?)',
      args: [1, 'Café 測試', 2, '100% literal']
    })
    await run(databasePath, writer)
  } finally {
    writer.close()
    await rm(directory, { recursive: true, force: true })
  }
}

describe('search-index read worker artifact', () => {
  it('requires the bundled worker before its integration contracts run', () => {
    if (!workerBuilt) {
      throw new Error(
        `Missing ${workerPath}. Build it with \`pnpm -C apps/core-app exec electron-vite build\` before running this suite.`
      )
    }
  })
})

const describeBuiltWorker = workerBuilt ? describe : describe.skip

describeBuiltWorker('bundled search-index read worker', () => {
  it('reads an existing SQLite index without creating or mutating it', async () => {
    await withDatabase(async (databasePath, writer) => {
      const reader = new SearchIndexReadWorkerClient(databasePath, { workerPath })
      try {
        await expect(
          reader.all<{ id: number; name: string }>(
            sql`SELECT id, name FROM entries WHERE name LIKE ${'%literal'} ORDER BY id`
          )
        ).resolves.toEqual([{ id: 2, name: '100% literal' }])

        await expect(
          reader.all(sql`INSERT INTO entries (id, name) VALUES (3, 'forbidden')`)
        ).rejects.toThrow(/readonly|query only/i)
        await expect(
          writer.execute('SELECT id, name FROM entries ORDER BY id')
        ).resolves.toMatchObject({
          rows: [
            { id: 1, name: 'Café 測試' },
            { id: 2, name: '100% literal' }
          ]
        })
      } finally {
        await reader.close()
      }
    })
  })

  it('rejects a missing index without allowing libSQL to create a new file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tuff-search-read-worker-missing-'))
    const databasePath = join(directory, 'missing.sqlite')
    const reader = new SearchIndexReadWorkerClient(databasePath, { workerPath })
    try {
      await expect(reader.all(sql`SELECT 1`)).rejects.toThrow(/ENOENT|not found/i)
      expect(existsSync(databasePath)).toBe(false)
    } finally {
      await reader.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps the parent event loop schedulable while a native SQLite read is running', async () => {
    await withDatabase(async (databasePath) => {
      const reader = new SearchIndexReadWorkerClient(databasePath, { workerPath })
      try {
        let settled = false
        const expensiveRead = reader
          .all<{ total: number }>(
            sql`
            WITH RECURSIVE counter(value) AS (
              VALUES(0)
              UNION ALL
              SELECT value + 1 FROM counter WHERE value < 3000000
            )
            SELECT sum(value) AS total FROM counter
          `
          )
          .finally(() => {
            settled = true
          })

        await new Promise<void>((resolve) => setImmediate(resolve))
        expect(settled).toBe(false)
        await expect(expensiveRead).resolves.toEqual([{ total: 4500001500000 }])
      } finally {
        await reader.close()
      }
    })
  })
})
