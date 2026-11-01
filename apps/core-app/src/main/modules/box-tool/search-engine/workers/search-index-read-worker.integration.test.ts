import { createClient, type Client, type InValue } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { encodeVectorBlob } from '../../../../db/embedding-vector-codec'
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

async function createEmbeddings(writer: Client): Promise<void> {
  await writer.execute(`CREATE TABLE embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    embedding TEXT NOT NULL,
    model TEXT NOT NULL,
    content_hash TEXT
  )`)
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

  it('ranks distinct files by their best valid chunk and isolates the requested model and source type', async () => {
    await withDatabase(async (databasePath, writer) => {
      await createEmbeddings(writer)
      const model = 'semantic-contract/dim3'
      await writer.batch(
        [
          ['bad-json', 'file', '{broken', model, 'bad-json-hash'],
          ['nonfinite', 'file', '[1e309,0,0]', model, 'nonfinite-hash'],
          ['wrong-dimension', 'file', '[1,0]', model, 'wrong-dimension-hash'],
          ['zero', 'file', '[0,0,0]', model, 'zero-hash'],
          ['non-array', 'file', 'null', model, 'non-array-hash'],
          ['foreign-model', 'file', '[1,0,0]', 'another-model/dim3', 'foreign-model-hash'],
          ['foreign-source', 'note', '[1,0,0]', model, 'foreign-source-hash'],
          ['best', 'file', '[0.6,0.8,0]', model, 'best-weak-chunk'],
          ['runner-up', 'file', '[0.8,0.6,0]', model, 'runner-up-hash'],
          ['third', 'file', '[0.6,0.8,0]', model, 'third-hash'],
          ['best', 'file', '[1,0,0]', model, 'best-winning-chunk'],
          ['best', 'file', '[0,1,0]', model, 'best-last-chunk'],
          ['runner-up', 'file', '[1,0,0]', 'another-model/dim3', 'wrong-model-chunk'],
          ['third', 'note', '[1,0,0]', model, 'wrong-source-chunk']
        ].map((args) => ({
          sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES (?, ?, ?, ?, ?)',
          args
        })),
        'write'
      )
      const reader = new SearchIndexReadWorkerClient(databasePath, { workerPath })
      try {
        const expected = [
          { sourceId: 'best', score: 1, contentHash: 'best-winning-chunk' },
          { sourceId: 'runner-up', score: 0.8, contentHash: 'runner-up-hash' },
          { sourceId: 'third', score: 0.6, contentHash: 'third-hash' }
        ]
        await expect(reader.semanticSearch([1, 0, 0], model, 2)).resolves.toEqual(
          expected.slice(0, 2)
        )
        await expect(reader.semanticSearch([1, 0, 0], model, 10)).resolves.toEqual(expected)
      } finally {
        await reader.close()
      }
    })
  })

  it('ranks BLOB and legacy JSON vectors together and skips a BLOB of the wrong size', async () => {
    await withDatabase(async (databasePath, writer) => {
      await createEmbeddings(writer)
      const model = 'blob-contract/dim3'
      await writer.batch(
        [
          ['json-best', '[1,0,0]', 'json-hash'],
          ['blob-runner-up', encodeVectorBlob([0.8, 0.6, 0]), 'blob-runner-up-hash'],
          ['blob-best', encodeVectorBlob([0, 1, 0]), 'blob-weak-hash'],
          ['blob-best', encodeVectorBlob([0.9, 0.1, 0]), 'blob-winning-hash'],
          ['blob-short', encodeVectorBlob([1, 0]), 'blob-short-hash'],
          ['blob-nan', encodeVectorBlob([Number.NaN, 0, 0]), 'blob-nan-hash']
        ].map(([sourceId, embedding, contentHash]) => ({
          sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES (?, ?, ?, ?, ?)',
          args: [sourceId as string, 'file', embedding as InValue, model, contentHash as string]
        })),
        'write'
      )
      const reader = new SearchIndexReadWorkerClient(databasePath, { workerPath })
      try {
        const matches = await reader.semanticSearch([1, 0, 0], model, 10)

        expect(matches.map((match) => [match.sourceId, match.contentHash])).toEqual([
          ['json-best', 'json-hash'],
          ['blob-best', 'blob-winning-hash'],
          ['blob-runner-up', 'blob-runner-up-hash']
        ])
        expect(matches[1]!.score).toBeCloseTo(0.9 / Math.hypot(0.9, 0.1), 5)
      } finally {
        await reader.close()
      }
    })
  })

  it('finds the best file and its winning chunk after more than a thousand persisted vectors', async () => {
    await withDatabase(async (databasePath, writer) => {
      await createEmbeddings(writer)
      const model = 'paged-semantic-contract/dim3'
      await writer.batch(
        Array.from({ length: 1001 }, (_, index) => ({
          sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES (?, ?, ?, ?, ?)',
          args: [`file-${index}`, 'file', '[0,1,0]', model, `chunk-${index}`]
        })),
        'write'
      )
      await writer.batch(
        [
          ['late-best', '[1,0,0]', 'late-winning-chunk'],
          ['late-runner-up', '[0.8,0.6,0]', 'late-runner-up-hash'],
          ['late-best', '[0.6,0.8,0]', 'late-weaker-chunk']
        ].map(([sourceId, embedding, contentHash]) => ({
          sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES (?, ?, ?, ?, ?)',
          args: [sourceId!, 'file', embedding!, model, contentHash!]
        })),
        'write'
      )
      const reader = new SearchIndexReadWorkerClient(databasePath, { workerPath })
      try {
        await expect(reader.semanticSearch([1, 0, 0], model, 2)).resolves.toEqual([
          { sourceId: 'late-best', score: 1, contentHash: 'late-winning-chunk' },
          { sourceId: 'late-runner-up', score: 0.8, contentHash: 'late-runner-up-hash' }
        ])
      } finally {
        await reader.close()
      }
    })
  })
})
