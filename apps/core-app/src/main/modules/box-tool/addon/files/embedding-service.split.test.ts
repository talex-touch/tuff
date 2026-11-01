import type { Client, InValue } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { IntelligenceInvokeResult } from '@talex-touch/tuff-intelligence'
import type { TuffQuery } from '@talex-touch/utils'
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { FileProviderContentCapacityService } from './services/file-provider-content-capacity-service'
vi.mock('../../../ai/intelligence-sdk', () => ({
  tuffIntelligence: { embedding: { generate: vi.fn(), generateLocalImage: vi.fn() } }
}))
import * as schema from '../../../../db/schema'
import {
  EmbeddingService,
  type EmbeddingDbRouting,
  type FileEmbeddingGenerator
} from './embedding-service'
import { readStoredVector } from '../../../../db/embedding-vector-codec'
import { SqliteFileIndexPersistenceRepository } from '../../search-engine/file-index-persistence-repository'
import { getSearchIndexReadWorkerTestPath } from '../../search-engine/workers/search-index-read-worker.test-harness'
import { hashFileContentChunk } from './services/file-content-match'
import { tuffIntelligence } from '../../../ai/intelligence-sdk'
import { getLocalEmbeddingRuntime } from '../../../ai/local-embedding-runtime'
import { LOCAL_EMBEDDING_MODEL_KEY } from '../../../ai/local-embedding-model'
import { currentEmbeddingPriority, EmbeddingJobQueue } from '../../../ai/local-embedding-queue'
import { FileProviderEmbeddingIndexService } from './services/file-provider-embedding-index-service'
import type { IndexWorkerFileResult } from './workers/file-index-worker-client'
import { FileProviderSearchResultService } from './services/file-provider-search-result-service'

interface EmbeddingTestDb {
  client: Client
  db: LibSQLDatabase<typeof schema>
  url: string
  databasePath: string
}

const EMBEDDINGS_DDL = `CREATE TABLE embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL,
  content_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT 0
)`
const FILES_DDL = `CREATE TABLE files (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL,
  display_name TEXT, extension TEXT, size INTEGER, mtime INTEGER NOT NULL,
  ctime INTEGER NOT NULL, last_indexed_at INTEGER NOT NULL DEFAULT 0,
  is_dir INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'file',
  content TEXT, embedding_status TEXT NOT NULL DEFAULT 'pending'
)`
const CHUNKS = [
  { text: 'Lease cover and rent payment schedule.', pageNumber: 1 },
  { text: 'Tenant shall not keep any pets without written consent.', pageNumber: 4 }
]
const QUERY = 'Are animals allowed in the rented apartment?'
const MODEL = 'lease-space@revision-a/dim3'
const clients: Client[] = []
const services: EmbeddingService[] = []
let directory: string | undefined
let workerPath: string
beforeAll(async () => {
  workerPath = await getSearchIndexReadWorkerTestPath()
})
async function makeDb(name: string) {
  directory ??= await mkdtemp(join(tmpdir(), 'embedding-contract-'))
  const databasePath = join(directory, `${name}.sqlite`)
  const url = `file:${databasePath}`
  const client = createClient({ url })
  clients.push(client)
  await client.execute('PRAGMA page_size = 4096')
  await client.execute(EMBEDDINGS_DDL)
  await client.execute('PRAGMA max_page_count = 128')
  await client.execute(FILES_DDL)
  await client.execute(
    "INSERT INTO files (id, path, name, mtime, ctime, size) VALUES (1, '/lease.pdf', 'lease.pdf', 2, 2, 64), (2, '/other.pdf', 'other.pdf', 2, 2, 64)"
  )
  return { client, db: drizzle(client, { schema }), url, databasePath }
}
function generateEmbedding(text: string): Promise<{ vector: number[]; model: string }> {
  return Promise.resolve({ vector: text === CHUNKS[0]!.text ? [0, 1, 0] : [1, 0, 0], model: MODEL })
}

function createEmbeddingService(
  routing: EmbeddingDbRouting,
  generate: FileEmbeddingGenerator = generateEmbedding
): EmbeddingService {
  const service = new EmbeddingService(routing, generate, { workerPath })
  services.push(service)
  return service
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const service of services.splice(0)) await service.close()
  for (const client of clients.splice(0)) client.close()
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe('EmbeddingService physical chunk ownership', () => {
  it('persists each page in the worker home, recalls page four after reopening, and removes all file vectors', async () => {
    const main = await makeDb('main')
    const search = await makeDb('search')
    const routing: EmbeddingDbRouting = {
      isSplitEnabled: () => true,
      getReadDb: () => search.db,
      getDatabasePath: () => search.databasePath,
      getPrimaryDb: () => main.db,
      execWrite: async (statements) =>
        search.client.batch(
          statements.map((statement) => ({
            sql: statement.sql,
            args: statement.args as InValue[]
          })),
          'write'
        )
    }
    const service = createEmbeddingService(routing, generateEmbedding)
    await search.client.execute({
      sql: 'UPDATE files SET content = ? WHERE id = 1',
      args: [CHUNKS.map((chunk) => chunk.text).join('\n\n')]
    })
    await service.indexFiles([
      {
        fileId: '1',
        content: CHUNKS.map((chunk) => chunk.text).join('\n\n'),
        chunks: CHUNKS,
        fileVersion: 2_000,
        fileSize: 64
      }
    ])
    const persisted = await search.client.execute(
      'SELECT source_id, content_hash FROM embeddings ORDER BY id'
    )
    expect(persisted.rows.map((row) => ({ id: row.source_id, hash: row.content_hash }))).toEqual(
      CHUNKS.map((chunk) => ({ id: '1', hash: hashFileContentChunk(chunk) }))
    )
    expect((await main.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
    await service.close()
    search.client.close()
    clients.splice(clients.indexOf(search.client), 1)
    search.client = createClient({ url: search.url })
    clients.push(search.client)
    search.db = drizzle(search.client, { schema })
    const reopened = createEmbeddingService(routing, generateEmbedding)
    const result = await reopened.semanticSearch(QUERY)
    expect(result[0]).toEqual({
      sourceId: '1',
      score: 1,
      contentHash: hashFileContentChunk(CHUNKS[1]!)
    })
    await reopened.removeFiles(['1'])
    expect(await reopened.semanticSearch(QUERY)).toEqual([])
  })

  it('resolves each read and write home at call time rather than capturing the split state', async () => {
    const main = await makeDb('main')
    const search = await makeDb('search')
    let split = false
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => split,
        getReadDb: () => (split ? search.db : main.db),
        getDatabasePath: () => (split ? search.databasePath : main.databasePath),
        getPrimaryDb: () => main.db,
        execWrite: async (statements) =>
          search.client.batch(
            statements.map((statement) => ({
              sql: statement.sql,
              args: statement.args as InValue[]
            })),
            'write'
          )
      },
      generateEmbedding
    )
    await main.client.execute({
      sql: 'UPDATE files SET content = ? WHERE id = 1',
      args: [CHUNKS[0]!.text]
    })
    await service.indexFile('1', CHUNKS[0]!.text)
    expect((await service.semanticSearch(CHUNKS[0]!.text)).map((row) => row.sourceId)).toEqual([
      '1'
    ])
    split = true
    await search.client.execute({
      sql: 'UPDATE files SET content = ? WHERE id = 2',
      args: [CHUNKS[1]!.text]
    })
    await service.indexFile('2', CHUNKS[1]!.text)
    expect(
      (await main.client.execute('SELECT source_id FROM embeddings')).rows.map(
        (row) => row.source_id
      )
    ).toEqual(['1'])
    expect(
      (await search.client.execute('SELECT source_id FROM embeddings')).rows.map(
        (row) => row.source_id
      )
    ).toEqual(['2'])
    expect((await service.semanticSearch(QUERY)).map((row) => row.sourceId)).toEqual(['2'])
  })

  it('does not compare query vectors to unrelated models even when dimensions and coordinates coincide', async () => {
    const home = await makeDb('models')
    await home.client.execute({
      sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
      args: [
        '2',
        'file',
        '[1,0,0]',
        'unrelated-space@revision-b/dim3',
        'foreign-hash',
        '1',
        'file',
        '[0.8,0.6,0]',
        MODEL,
        'same-model-hash'
      ]
    })
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => false,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => home.db,
        execWrite: async () => {
          throw new Error('Unexpected worker write')
        }
      },
      generateEmbedding
    )
    const result = await service.semanticSearch(QUERY)
    expect(result.map((row) => row.sourceId)).toEqual(['1'])
    expect(result[0]?.score).toBeCloseTo(0.8)
  })

  it('leaves the previous complete page set intact when one replacement embedding fails', async () => {
    const home = await makeDb('replacement')
    const routing: EmbeddingDbRouting = {
      isSplitEnabled: () => false,
      getReadDb: () => home.db,
      getDatabasePath: () => home.databasePath,
      getPrimaryDb: () => home.db,
      execWrite: async () => {
        throw new Error('Unexpected worker write')
      }
    }
    const original = createEmbeddingService(routing, generateEmbedding)
    await home.client.execute({
      sql: 'UPDATE files SET content = ? WHERE id = 1',
      args: [CHUNKS.map((chunk) => chunk.text).join('\n\n')]
    })
    await original.indexFiles([
      { fileId: '1', content: CHUNKS.map((chunk) => chunk.text).join('\n\n'), chunks: CHUNKS }
    ])
    const before = (
      await home.client.execute(
        'SELECT source_id, content_hash, embedding FROM embeddings ORDER BY id'
      )
    ).rows
    const failing = createEmbeddingService(routing, async (text) => {
      if (text === 'replacement second page') throw new Error('model inference failed')
      return generateEmbedding(text)
    })
    const outcome = await failing.indexFiles([
      {
        fileId: '1',
        content: 'replacement',
        chunks: [
          { text: 'replacement first page', pageNumber: 1 },
          { text: 'replacement second page', pageNumber: 4 }
        ]
      }
    ])
    expect(outcome).toMatchObject({ indexed: 0, failed: 1 })
    expect(
      (
        await home.client.execute(
          'SELECT source_id, content_hash, embedding FROM embeddings ORDER BY id'
        )
      ).rows
    ).toEqual(before)
    expect((await original.semanticSearch(QUERY))[0]?.contentHash).toBe(
      hashFileContentChunk(CHUNKS[1]!)
    )
  })

  it.each([
    {
      name: 'different model revision',
      second: { vector: [1, 0, 0], model: 'lease-space@revision-b/dim3' }
    },
    { name: 'different dimensions', second: { vector: [1, 0], model: MODEL } }
  ])(
    'rejects a $name midway through a file instead of publishing a mixed vector set',
    async ({ second }) => {
      const home = await makeDb('model-transition')
      const content = CHUNKS.map((chunk) => chunk.text).join('\n\n')
      await home.client.execute({
        sql: 'UPDATE files SET content = ? WHERE id = 1',
        args: [content]
      })
      const service = createEmbeddingService(
        {
          isSplitEnabled: () => false,
          getReadDb: () => home.db,
          getDatabasePath: () => home.databasePath,
          getPrimaryDb: () => home.db,
          execWrite: async () => {
            throw new Error('Unexpected worker write')
          }
        },
        async (text) => (text === CHUNKS[1]!.text ? second : generateEmbedding(text))
      )
      expect(await service.indexFiles([{ fileId: '1', content, chunks: CHUNKS }])).toMatchObject({
        indexed: 0,
        failed: 1
      })
      expect((await home.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
      expect(
        (await home.client.execute('SELECT embedding_status FROM files WHERE id = 1')).rows
      ).toEqual([{ embedding_status: 'pending' }])
    }
  )

  it('rolls back the delete and first inserted vector when the second split-off insert fails', async () => {
    const home = await makeDb('insert-rollback')
    const content = CHUNKS.map((chunk) => chunk.text).join('\n\n')
    await home.client.execute({ sql: 'UPDATE files SET content = ? WHERE id = 1', args: [content] })
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => false,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => home.db,
        execWrite: async () => {
          throw new Error('Unexpected worker write')
        }
      },
      generateEmbedding
    )
    expect(await service.indexFiles([{ fileId: '1', content, chunks: CHUNKS }])).toEqual({
      indexed: 1,
      skipped: 0,
      failed: 0
    })
    const before = (
      await home.client.execute(
        'SELECT source_id, content_hash, embedding, model FROM embeddings ORDER BY id'
      )
    ).rows
    const replacement = [
      { text: 'Replacement first page.', pageNumber: 1 },
      { text: 'Replacement second page.', pageNumber: 4 }
    ]
    const replacementContent = replacement.map((chunk) => chunk.text).join('\n\n')
    await home.client.execute({
      sql: "UPDATE files SET content = ?, embedding_status = 'pending' WHERE id = 1",
      args: [replacementContent]
    })
    await home.client.execute(`CREATE TRIGGER reject_second_replacement BEFORE INSERT ON embeddings
      WHEN NEW.content_hash = '${hashFileContentChunk(replacement[1]!)}'
      BEGIN SELECT RAISE(ABORT, 'second replacement insert rejected'); END`)

    expect(
      await service.indexFiles([{ fileId: '1', content: replacementContent, chunks: replacement }])
    ).toEqual({ indexed: 0, skipped: 0, failed: 1, retryFileIds: ['1'] })
    expect(
      (
        await home.client.execute(
          'SELECT source_id, content_hash, embedding, model FROM embeddings ORDER BY id'
        )
      ).rows
    ).toEqual(before)
    expect(
      (await home.client.execute('SELECT content, embedding_status FROM files WHERE id = 1')).rows
    ).toEqual([{ content: replacementContent, embedding_status: 'pending' }])
    expect((await service.semanticSearch(QUERY))[0]?.contentHash).toBe(
      hashFileContentChunk(CHUNKS[1]!)
    )
  })
})

describe('EmbeddingService semantic scan and publication fences', () => {
  it('finds the best matching file beyond the first thousand persisted vectors', async () => {
    const home = await makeDb('late-row')
    await home.client.batch(
      Array.from({ length: 999 }, (_, index) => ({
        sql: 'INSERT INTO files (id, path, name, mtime, ctime, content, embedding_status) VALUES (?, ?, ?, 2, 2, ?, ?)',
        args: [
          index + 3,
          `/file-${index + 3}.txt`,
          `file-${index + 3}.txt`,
          index === 998 ? CHUNKS[1]!.text : CHUNKS[0]!.text,
          'completed'
        ]
      })),
      'write'
    )
    await home.client.batch(
      Array.from({ length: 1001 }, (_, index) => ({
        sql: 'INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES (?, ?, ?, ?, ?)',
        args: [
          String(index + 1),
          'file',
          index === 1000 ? '[1,0,0]' : '[0,1,0]',
          MODEL,
          `chunk-${index + 1}`
        ]
      })),
      'write'
    )
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => false,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => home.db,
        execWrite: async () => {
          throw new Error('Unexpected worker write')
        }
      },
      generateEmbedding
    )
    expect(await service.semanticSearch(QUERY, 1)).toEqual([
      { sourceId: '1001', score: 1, contentHash: 'chunk-1001' }
    ])
  })

  it('cannot resurrect vectors when content is disabled while inference is in flight', async () => {
    const home = await makeDb('late-inference')
    await home.client.execute({
      sql: 'UPDATE files SET content = ? WHERE id = 1',
      args: [CHUNKS[1]!.text]
    })
    const started = Promise.withResolvers<void>()
    const answered = Promise.withResolvers<{ vector: number[]; model: string }>()
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => false,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => home.db,
        execWrite: async () => {
          throw new Error('Unexpected worker write')
        }
      },
      async (text) => {
        if (text === 'test') return generateEmbedding(text)
        started.resolve()
        return answered.promise
      }
    )
    const operation = service.indexFiles([
      { fileId: '1', content: CHUNKS[1]!.text, chunks: [CHUNKS[1]!] }
    ])
    try {
      await started.promise
      await home.client.execute(
        "UPDATE files SET content = NULL, embedding_status = 'none' WHERE id = 1"
      )
      answered.resolve({ vector: [1, 0, 0], model: MODEL })
      await operation
      expect((await home.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
      expect(
        (await home.client.execute('SELECT content, embedding_status FROM files WHERE id = 1')).rows
      ).toEqual([{ content: null, embedding_status: 'none' }])
    } finally {
      answered.resolve({ vector: [1, 0, 0], model: MODEL })
      await operation
    }
  })

  it('cannot republish chunks or vectors when cleanup commits after preflight but before the worker batch', async () => {
    const main = await makeDb('queued-main')
    const home = await makeDb('queued-worker')
    await home.client.execute(
      'CREATE TABLE file_extensions (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL)'
    )
    await home.client.execute(`CREATE TABLE file_index_progress (
      file_id INTEGER PRIMARY KEY, status TEXT NOT NULL, progress INTEGER NOT NULL,
      processed_bytes INTEGER, total_bytes INTEGER, last_error TEXT, started_at INTEGER, updated_at INTEGER NOT NULL
    )`)
    const content = CHUNKS.map((chunk) => chunk.text).join('\n\n')
    const repository = new SqliteFileIndexPersistenceRepository(home.db)
    const progress = {
      status: 'completed',
      progress: 100,
      processedBytes: 64,
      totalBytes: 64,
      lastError: null,
      startedAt: null,
      updatedAt: '2026-10-11T00:00:00.000Z'
    }
    await repository.persistEntries([
      {
        fileId: 1,
        fileVersion: 2_000,
        fileSize: 64,
        fileUpdate: { content, embeddingStatus: 'pending', contentHash: null, chunks: CHUNKS },
        progress
      }
    ])
    const queued = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => true,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => main.db,
        execWrite: async (statements) => {
          queued.resolve()
          await release.promise
          return home.client.batch(
            statements.map((statement) => ({
              sql: statement.sql,
              args: statement.args as InValue[]
            })),
            'write'
          )
        }
      },
      generateEmbedding
    )
    const operation = service.indexFiles([
      { fileId: '1', content, chunks: CHUNKS, fileVersion: 2_000, fileSize: 64 }
    ])
    try {
      await queued.promise
      await repository.persistEntries([
        {
          fileId: 1,
          fileVersion: 2_000,
          fileSize: 64,
          fileUpdate: { content: null, embeddingStatus: 'none', contentHash: null },
          progress
        }
      ])
      release.resolve()
      expect(await operation).toEqual({ indexed: 0, skipped: 1, failed: 0 })
      expect((await home.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
      expect(
        (
          await home.client.execute(
            "SELECT file_id FROM file_extensions WHERE key = 'content_chunks'"
          )
        ).rows
      ).toEqual([])
      expect(
        (
          await home.client.execute(
            'SELECT path, content, embedding_status FROM files WHERE id = 1'
          )
        ).rows
      ).toEqual([{ path: '/lease.pdf', content: null, embedding_status: 'none' }])
      expect(await service.semanticSearch(QUERY)).toEqual([])
    } finally {
      release.resolve()
      await operation
    }
  })
})

describe('EmbeddingService device capacity admission', () => {
  it('does not send file bodies to inference while capacity is blocked', async () => {
    const home = await makeDb('capacity-blocked')
    const inferred: string[] = []
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => false,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => home.db,
        execWrite: async () => {
          throw new Error('Unexpected worker write')
        },
        checkContentCapacity: async () => false
      },
      async (text) => {
        inferred.push(text)
        return generateEmbedding(text)
      }
    )
    await service.indexFiles([{ fileId: '1', content: CHUNKS[0]!.text }])
    expect(inferred.filter((text) => text !== 'test')).toEqual([])
    expect((await home.client.execute('SELECT embedding FROM embeddings')).rows).toEqual([])
    expect(
      (await home.client.execute('SELECT embedding_status FROM files WHERE id = 1')).rows
    ).toEqual([{ embedding_status: 'pending' }])
  })

  it.each([
    { name: 'between chunks', pauseOn: CHUNKS[0]!.text, inferredBodies: [CHUNKS[0]!.text] },
    {
      name: 'after generation before replacement write',
      pauseOn: CHUNKS[1]!.text,
      inferredBodies: CHUNKS.map((chunk) => chunk.text)
    }
  ])(
    'preserves the previous complete vectors when capacity vanishes $name',
    async ({ pauseOn, inferredBodies }) => {
      const home = await makeDb('capacity-replacement')
      const content = CHUNKS.map((chunk) => chunk.text).join('\n\n')
      await home.client.execute({
        sql: 'UPDATE files SET content = ? WHERE id = 1',
        args: [content]
      })
      await home.client.execute(
        "INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES ('1', 'file', '[0,1,0]', 'previous-model', 'previous-hash')"
      )
      let admitted = true
      const inferred: string[] = []
      const service = createEmbeddingService(
        {
          isSplitEnabled: () => false,
          getReadDb: () => home.db,
          getDatabasePath: () => home.databasePath,
          getPrimaryDb: () => home.db,
          execWrite: async () => {
            throw new Error('Unexpected worker write')
          },
          checkContentCapacity: async () => admitted
        },
        async (text) => {
          inferred.push(text)
          if (text === pauseOn) admitted = false
          return generateEmbedding(text)
        }
      )
      await service.indexFiles([{ fileId: '1', content, chunks: CHUNKS }])
      expect(inferred.filter((text) => text !== 'test')).toEqual(inferredBodies)
      expect(
        (await home.client.execute('SELECT embedding, model, content_hash FROM embeddings')).rows
      ).toEqual([{ embedding: '[0,1,0]', model: 'previous-model', content_hash: 'previous-hash' }])
      expect(
        (await home.client.execute('SELECT content, embedding_status FROM files WHERE id = 1')).rows
      ).toEqual([{ content, embedding_status: 'pending' }])
    }
  )

  it('pauses at a wrapped disk-full worker write and does not infer the rest of the batch', async () => {
    const home = await makeDb('capacity-worker-full')
    const capacity = new FileProviderContentCapacityService({
      getDirectory: () => '/synthetic/search-index',
      statfs: async () => ({ bavail: 4 * 1024 ** 3, bsize: 1 })
    })
    await capacity.check(true)
    await home.client.execute({
      sql: 'UPDATE files SET content = ? WHERE id = 1',
      args: [CHUNKS[0]!.text]
    })
    await home.client.execute({
      sql: 'UPDATE files SET content = ? WHERE id = 2',
      args: [CHUNKS[1]!.text]
    })
    const inferred: string[] = []
    let writes = 0
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => true,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => home.db,
        checkContentCapacity: () => capacity.check(),
        recordStorageFailure: (error) => capacity.recordFailure(error),
        execWrite: async () => {
          writes++
          throw new Error('worker batch failed', {
            cause: Object.assign(new Error('database full'), { code: 'SQLITE_FULL' })
          })
        }
      },
      async (text) => {
        inferred.push(text)
        return generateEmbedding(text)
      }
    )
    try {
      const files = CHUNKS.map((chunk, index) => ({
        fileId: String(index + 1),
        content: chunk.text
      }))
      await service.indexFiles(files)
      await service.indexFiles(files)
      expect(capacity.isReady()).toBe(false)
      expect(inferred.filter((text) => text !== 'test')).toEqual([CHUNKS[0]!.text])
      expect(writes).toBe(1)
      expect((await home.client.execute('SELECT embedding FROM embeddings')).rows).toEqual([])
      expect(
        (await home.client.execute('SELECT embedding_status FROM files ORDER BY id')).rows
      ).toEqual([{ embedding_status: 'pending' }, { embedding_status: 'pending' }])
    } finally {
      capacity.dispose()
    }
  })
})

describe('EmbeddingService real image publication contracts', () => {
  async function prepareImage(home: EmbeddingTestDb) {
    const path = join(directory!, 'IMG_2048.png')
    await sharp({ create: { width: 2, height: 2, channels: 3, background: '#996633' } })
      .png()
      .toFile(path)
    // SQLite owns the integer-second version; the image runtime owns exact disk milliseconds.
    await utimes(path, new Date(2_471), new Date(2_471))
    const details = await stat(path)
    const image = { path, mtime: details.mtimeMs, size: details.size }
    await home.client.execute({
      sql: "UPDATE files SET path = ?, name = 'IMG_2048.png', extension = '.png', size = ?, content = NULL, embedding_status = 'pending' WHERE id = 1",
      args: [path, details.size]
    })
    await home.client.execute(`CREATE TABLE file_index_progress (
      file_id INTEGER PRIMARY KEY, status TEXT NOT NULL, progress INTEGER NOT NULL,
      processed_bytes INTEGER, total_bytes INTEGER, last_error TEXT, started_at INTEGER, updated_at INTEGER NOT NULL
    )`)
    await home.client.execute(
      "INSERT INTO file_index_progress (file_id, status, progress, updated_at) VALUES (1, 'pending', 0, 0)"
    )
    await home.client.execute(
      'CREATE TABLE file_extensions (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL)'
    )
    vi.spyOn(getLocalEmbeddingRuntime(), 'isImageReady').mockReturnValue(true)
    vi.spyOn(tuffIntelligence.embedding, 'generateLocalImage').mockImplementation(async (input) => {
      const source = await stat(input.path)
      if (source.mtimeMs !== input.mtime || source.size !== input.size) {
        throw new Error('MODEL_IMAGE_IDENTITY_MISMATCH')
      }
      return {
        result: [1, 0, 0],
        model: LOCAL_EMBEDDING_MODEL_KEY,
        provider: 'local',
        traceId: 'image-fixture',
        latency: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }
    })
    return {
      image,
      input: { fileId: '1', content: null, image, fileVersion: 2_000, fileSize: details.size },
      entry: {
        type: 'file',
        taskId: 'image-fixture',
        fileId: 1,
        fileVersion: 2_000,
        fileSize: details.size,
        progress: {
          status: 'pending',
          progress: 0,
          processedBytes: 0,
          totalBytes: details.size,
          lastError: 'image-embedding-pending'
        },
        fileUpdate: { content: null, embeddingStatus: 'pending' },
        indexItem: {
          itemId: path,
          providerId: 'files',
          type: 'file',
          path,
          name: 'IMG_2048.png',
          extension: '.png'
        }
      } satisfies IndexWorkerFileResult
    }
  }

  function imageService(
    primary: EmbeddingTestDb,
    home = primary,
    options: {
      split?: boolean
      execWrite?: EmbeddingDbRouting['execWrite']
      capacity?: () => Promise<boolean>
      generate?: FileEmbeddingGenerator
    } = {}
  ): EmbeddingService {
    return createEmbeddingService(
      {
        isSplitEnabled: () => options.split ?? false,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => primary.db,
        checkContentCapacity: options.capacity,
        execWrite:
          options.execWrite ??
          (async (statements) =>
            home.client.batch(
              statements.map((statement) => ({
                sql: statement.sql,
                args: statement.args as InValue[]
              })),
              'write'
            ))
      },
      options.generate ?? (async () => ({ vector: [1, 0, 0], model: LOCAL_EMBEDDING_MODEL_KEY }))
    )
  }

  it('indexes a content-null committed image only in the worker home, recalls it by text, and deletes its vector', async () => {
    const primary = await makeDb('image-primary')
    const home = await makeDb('image-worker')
    const { entry, image } = await prepareImage(home)
    const service = imageService(primary, home, { split: true })
    const consumer = new FileProviderEmbeddingIndexService({
      getEmbeddingService: () => service,
      logDebug: () => {}
    })
    await consumer.indexCommittedEntries([entry])
    const [stored] = (
      await home.client.execute('SELECT source_id, source_type, embedding, model FROM embeddings')
    ).rows
    expect(stored).toBeDefined()
    expect({
      ...stored,
      embedding: Array.from(readStoredVector(stored!.embedding, 3) ?? [])
    }).toEqual({
      source_id: '1',
      source_type: 'file',
      embedding: [1, 0, 0],
      model: LOCAL_EMBEDDING_MODEL_KEY
    })
    expect(stored!.embedding).toBeInstanceOf(ArrayBuffer)
    expect((await primary.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
    expect(
      (await home.client.execute('SELECT path, content, embedding_status FROM files WHERE id = 1'))
        .rows
    ).toEqual([{ path: image.path, content: null, embedding_status: 'completed' }])
    expect(
      (
        await home.client.execute(
          "SELECT file_id FROM file_extensions WHERE key = 'content_chunks'"
        )
      ).rows
    ).toEqual([])
    expect(
      (await service.semanticSearch('猫')).map((result) => ({
        id: result.sourceId,
        score: result.score
      }))
    ).toEqual([{ id: '1', score: 1 }])
    const results = new FileProviderSearchResultService({
      providerId: 'files',
      getDbUtils: () => ({ getDb: () => primary.db, getFileIndexReadDb: () => home.db }) as never,
      getSearchIndex: () => null,
      isContentIndexingEnabled: () => true,
      isPathAdmitted: (path) => path.startsWith(directory!),
      buildItem: (file) => ({
        id: file.path,
        kind: 'file',
        source: { id: 'files', name: 'Files', type: 'file' },
        render: { mode: 'default', basic: { title: file.name } },
        meta: { file: { path: file.path } }
      }),
      normalizeItem: (item) => item,
      sanitizeExtensions: (extensions) => extensions,
      cleanupStaleCandidates: () => {},
      semanticSearch: (query, limit, signal) => service.semanticSearch(query, limit, signal),
      logDebug: () => {},
      formatDuration: (duration) => `${duration}ms`
    })
    const recalled = await results.semanticRecall(
      { text: '猫' } as TuffQuery,
      new Set(),
      new AbortController().signal
    )
    expect(recalled.map((item) => item.id)).toEqual([image.path])
    expect(recalled[0]?.meta?.deepMatch).toEqual({ kind: 'semantic', score: 1 })
    await consumer.deleteByFileIds(home.db, [1])
    expect(await service.semanticSearch('宠物')).toEqual([])
  })

  it('continues indexing committed text in a mixed batch when image media is unavailable', async () => {
    const home = await makeDb('mixed-media-missing')
    const { entry } = await prepareImage(home)
    vi.mocked(getLocalEmbeddingRuntime().isImageReady).mockReturnValue(false)
    const content = CHUNKS[1]!.text
    await home.client.execute({ sql: 'UPDATE files SET content = ? WHERE id = 2', args: [content] })
    const text: IndexWorkerFileResult = {
      ...entry,
      fileId: 2,
      fileSize: 64,
      progress: {
        status: 'completed',
        progress: 100,
        processedBytes: 64,
        totalBytes: 64,
        lastError: null
      },
      fileUpdate: { content, embeddingStatus: 'pending' },
      indexItem: {
        itemId: '/other.pdf',
        providerId: 'files',
        type: 'file',
        path: '/other.pdf',
        name: 'other.pdf',
        extension: '.pdf',
        content
      }
    }
    const consumer = new FileProviderEmbeddingIndexService({
      getEmbeddingService: () => imageService(home),
      logDebug: () => {}
    })
    await consumer.indexCommittedEntries([entry, text])
    expect((await home.client.execute('SELECT source_id, model FROM embeddings')).rows).toEqual([
      { source_id: '2', model: LOCAL_EMBEDDING_MODEL_KEY }
    ])
    expect(
      (await home.client.execute('SELECT id, content, embedding_status FROM files ORDER BY id'))
        .rows
    ).toEqual([
      { id: 1, content: null, embedding_status: 'pending' },
      { id: 2, content, embedding_status: 'completed' }
    ])
  })

  it('lets a semantic search queue behind a running image embedding instead of aborting it', async () => {
    const home = await makeDb('search-beside-image')
    const { input } = await prepareImage(home)
    const slot = new EmbeddingJobQueue(() => new Error('cancelled'))
    const imageRunning = Promise.withResolvers<void>()
    const imageDone = Promise.withResolvers<void>()
    const events: string[] = []
    const queryPriorities: string[] = []
    let imageSignal: AbortSignal | undefined
    vi.mocked(tuffIntelligence.embedding.generateLocalImage).mockImplementation(
      async (_image, options) => {
        const release = await slot.acquire(currentEmbeddingPriority(), options?.signal)
        try {
          imageSignal = options?.signal
          imageRunning.resolve()
          // The real runtime terminates its helper when a running request is aborted.
          await Promise.race([
            imageDone.promise,
            new Promise<never>((_, reject) =>
              options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
                once: true
              })
            )
          ])
          events.push('image')
          return {
            result: [1, 0, 0],
            model: LOCAL_EMBEDDING_MODEL_KEY,
            provider: 'local',
            traceId: 'image-beside-search',
            latency: 0,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
          }
        } finally {
          release()
        }
      }
    )
    const service = imageService(home, home, {
      generate: async (_text, signal) => {
        queryPriorities.push(currentEmbeddingPriority())
        const release = await slot.acquire(currentEmbeddingPriority(), signal)
        try {
          events.push('query')
          return { vector: [1, 0, 0], model: LOCAL_EMBEDDING_MODEL_KEY }
        } finally {
          release()
        }
      }
    })
    const indexing = service.indexFiles([input])
    try {
      await imageRunning.promise
      let searched = false
      const search = service.semanticSearch('猫').then(() => {
        searched = true
      })
      await vi.waitFor(() => expect(queryPriorities).toHaveLength(1))
      expect(imageSignal?.aborted).toBe(false)
      expect(queryPriorities).toEqual(['interactive'])
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
      expect(searched).toBe(false)

      imageDone.resolve()
      expect(await indexing).toEqual({ indexed: 1, skipped: 0, failed: 0 })
      await search
      expect(events).toEqual(['image', 'query'])
      expect((await home.client.execute('SELECT source_id, model FROM embeddings')).rows).toEqual([
        { source_id: '1', model: LOCAL_EMBEDDING_MODEL_KEY }
      ])
      expect(
        (await home.client.execute('SELECT embedding_status FROM files WHERE id = 1')).rows
      ).toEqual([{ embedding_status: 'completed' }])
      expect((await service.semanticSearch('猫')).map((row) => row.sourceId)).toEqual(['1'])
    } finally {
      imageDone.resolve()
      await indexing
    }
  })

  it('does not report a failed image for the text retry lane', async () => {
    const home = await makeDb('image-failure-not-retried')
    const { input } = await prepareImage(home)
    vi.mocked(tuffIntelligence.embedding.generateLocalImage).mockRejectedValue(
      new Error('image encoder failed')
    )
    expect(await imageService(home).indexFiles([input])).toEqual({
      indexed: 0,
      skipped: 0,
      failed: 1
    })
  })

  it('does not read an image whose watch root was withdrawn before the flush consumer ran', async () => {
    const home = await makeDb('withdrawn-image-root')
    const { entry, image } = await prepareImage(home)
    let imageRead = false
    vi.mocked(tuffIntelligence.embedding.generateLocalImage).mockImplementation(async () => {
      imageRead = true
      throw new Error('WITHDRAWN_ROOT_IMAGE_READ')
    })
    const consumer = new FileProviderEmbeddingIndexService({
      getEmbeddingService: () => imageService(home),
      isPathAdmitted: () => false,
      logDebug: () => {}
    })
    await consumer.indexCommittedEntries([entry])
    expect(imageRead).toBe(false)
    expect((await home.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
    expect(
      (await home.client.execute('SELECT path, content, embedding_status FROM files WHERE id = 1'))
        .rows
    ).toEqual([{ path: image.path, content: null, embedding_status: 'pending' }])
  })

  it.each([
    { name: 'file deletion', sql: 'DELETE FROM files WHERE id = 1' },
    { name: 'path replacement', sql: "UPDATE files SET path = '/replacement.png' WHERE id = 1" },
    { name: 'mtime replacement', sql: 'UPDATE files SET mtime = 3 WHERE id = 1' },
    { name: 'size replacement', sql: 'UPDATE files SET size = size + 1 WHERE id = 1' },
    {
      name: 'text ownership',
      sql: "UPDATE files SET content = 'new extracted owner' WHERE id = 1"
    },
    { name: 'content cleanup', sql: "UPDATE files SET embedding_status = 'none' WHERE id = 1" }
  ])(
    'does not publish a queued image vector after $name invalidates its SQLite fence',
    async ({ sql }) => {
      const primary = await makeDb('image-queue-primary')
      const home = await makeDb('image-queue-worker')
      const { input } = await prepareImage(home)
      const queued = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const service = imageService(primary, home, {
        split: true,
        execWrite: async (statements) => {
          queued.resolve()
          await release.promise
          return home.client.batch(
            statements.map((statement) => ({
              sql: statement.sql,
              args: statement.args as InValue[]
            })),
            'write'
          )
        }
      })
      const operation = service.indexFiles([input])
      try {
        await queued.promise
        await home.client.execute(sql)
        release.resolve()
        expect(await operation).toEqual({ indexed: 0, skipped: 1, failed: 0 })
        expect((await home.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
        expect(
          (await home.client.execute('SELECT status FROM file_index_progress WHERE file_id = 1'))
            .rows
        ).toEqual([{ status: 'pending' }])
      } finally {
        release.resolve()
        await operation
      }
    }
  )

  it('does not republish an image when content indexing is cancelled during inference', async () => {
    const home = await makeDb('image-cancel')
    const { input } = await prepareImage(home)
    const entered = Promise.withResolvers<void>()
    const answer = Promise.withResolvers<IntelligenceInvokeResult<number[]>>()
    vi.mocked(tuffIntelligence.embedding.generateLocalImage).mockImplementation(async () => {
      entered.resolve()
      return answer.promise
    })
    const service = imageService(home)
    const operation = service.indexFiles([input])
    try {
      await entered.promise
      service.cancelPending()
      await home.client.execute(
        "UPDATE files SET embedding_status = 'none', content = NULL WHERE id = 1"
      )
      answer.resolve({
        result: [1, 0, 0],
        model: LOCAL_EMBEDDING_MODEL_KEY,
        provider: 'local',
        traceId: 'late-image',
        latency: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      })
      expect(await operation).toEqual({ indexed: 0, skipped: 1, failed: 0 })
      expect((await home.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
      expect(
        (await home.client.execute('SELECT content, embedding_status FROM files WHERE id = 1')).rows
      ).toEqual([{ content: null, embedding_status: 'none' }])
    } finally {
      service.cancelPending()
      answer.resolve({
        result: [1, 0, 0],
        model: LOCAL_EMBEDDING_MODEL_KEY,
        provider: 'local',
        traceId: 'late-image',
        latency: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      })
      await operation
    }
  })

  it('does not publish a vector for bytes replaced while the image model was answering', async () => {
    const home = await makeDb('image-source-change')
    const { input, image } = await prepareImage(home)
    vi.mocked(tuffIntelligence.embedding.generateLocalImage).mockImplementation(async () => {
      await writeFile(image.path, 'replacement bytes')
      return {
        result: [1, 0, 0],
        model: LOCAL_EMBEDDING_MODEL_KEY,
        provider: 'local',
        traceId: 'changed-image',
        latency: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      }
    })
    const result = await imageService(home).indexFiles([input])
    expect(result.indexed).toBe(0)
    expect((await home.client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
    expect(
      (await home.client.execute('SELECT path, content, embedding_status FROM files WHERE id = 1'))
        .rows
    ).toEqual([{ path: image.path, content: null, embedding_status: 'pending' }])
  })

  it('does not start image inference or alter an existing vector under low storage', async () => {
    const home = await makeDb('image-capacity')
    const { input } = await prepareImage(home)
    await home.client.execute(
      "INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash) VALUES ('1', 'file', '[0,1,0]', 'previous-image-space', 'previous-image')"
    )
    vi.mocked(tuffIntelligence.embedding.generateLocalImage).mockRejectedValue(
      new Error('IMAGE_MODEL_STARTED_WHILE_STORAGE_PAUSED')
    )
    expect(
      await imageService(home, home, { capacity: async () => false }).indexFiles([input])
    ).toEqual({ indexed: 0, skipped: 1, failed: 0 })
    expect(
      (await home.client.execute('SELECT embedding, model, content_hash FROM embeddings')).rows
    ).toEqual([
      { embedding: '[0,1,0]', model: 'previous-image-space', content_hash: 'previous-image' }
    ])
  })
})

describe('EmbeddingService failed text vectors', () => {
  async function brokenTextFile(name: string) {
    const home = await makeDb(name)
    const content = CHUNKS[1]!.text
    await home.client.execute({ sql: 'UPDATE files SET content = ? WHERE id = 1', args: [content] })
    let broken = true
    const service = createEmbeddingService(
      {
        isSplitEnabled: () => false,
        getReadDb: () => home.db,
        getDatabasePath: () => home.databasePath,
        getPrimaryDb: () => home.db,
        execWrite: async () => {
          throw new Error('Unexpected worker write')
        }
      },
      async (text) => {
        if (broken && text === content) throw new Error('model inference failed')
        return generateEmbedding(text)
      }
    )
    const entry: IndexWorkerFileResult = {
      type: 'file',
      taskId: 'text-retry',
      fileId: 1,
      fileVersion: 2_000,
      fileSize: 64,
      progress: {
        status: 'completed',
        progress: 100,
        processedBytes: 64,
        totalBytes: 64,
        lastError: null
      },
      fileUpdate: { content, embeddingStatus: 'pending' },
      indexItem: {
        itemId: '/lease.pdf',
        providerId: 'files',
        type: 'file',
        path: '/lease.pdf',
        name: 'lease.pdf',
        extension: '.pdf',
        content
      }
    }
    return {
      service,
      entry,
      input: { fileId: '1', content, fileVersion: 2_000, fileSize: 64 },
      setBroken: (value: boolean) => {
        broken = value
      }
    }
  }
  const FAILED = { indexed: 0, skipped: 0, failed: 1 }

  it('reports a failed text file for the retry lane until its third failure, then lets it finish', async () => {
    const { service, input } = await brokenTextFile('text-retry-cap')
    expect(await service.indexFiles([input])).toEqual({ ...FAILED, retryFileIds: ['1'] })
    expect(await service.indexFiles([input])).toEqual({ ...FAILED, retryFileIds: ['1'] })
    expect(await service.indexFiles([input])).toEqual(FAILED)
  })

  it('forgets earlier failures once the file embeds', async () => {
    const { service, input, setBroken } = await brokenTextFile('text-retry-reset')
    await service.indexFiles([input])
    await service.indexFiles([input])
    setBroken(false)
    expect(await service.indexFiles([input])).toEqual({ indexed: 1, skipped: 0, failed: 0 })
    setBroken(true)
    expect(await service.indexFiles([input])).toEqual({ ...FAILED, retryFileIds: ['1'] })
  })

  it('never evicts a tracked file, so a failing batch larger than the table still converges', async () => {
    // One warning per failed attempt, twelve thousand of them.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { service, input } = await brokenTextFile('text-retry-overflow')
    const tableSize = 4096
    const ids = Array.from({ length: tableSize + 4 }, (_, index) => String(index + 1))
    const attempts = new Map<string, number>()
    const listedPerRound: number[] = []
    let round = ids
    for (let pass = 0; pass < 3; pass++) {
      const result = await service.indexFiles(round.map((fileId) => ({ ...input, fileId })))
      for (const fileId of round) attempts.set(fileId, (attempts.get(fileId) ?? 0) + 1)
      round = result.retryFileIds ?? []
      listedPerRound.push(round.length)
    }
    // The first 4,096 are tracked and listed until their third failure; the four that found the
    // table full are given up on at once instead of swapping an earlier file out.
    expect(listedPerRound).toEqual([tableSize, tableSize, 0])
    expect(ids.slice(0, tableSize).every((fileId) => attempts.get(fileId) === 3)).toBe(true)
    expect(ids.slice(tableSize).map((fileId) => attempts.get(fileId))).toEqual([1, 1, 1, 1])
    // Everything tracked has finished, so a file that fails now is tracked again.
    expect(await service.indexFiles([{ ...input, fileId: '9000' }])).toEqual({
      ...FAILED,
      retryFileIds: ['9000']
    })
  })

  it('hands the flush consumer the numeric ids of the text files to retry', async () => {
    const { service, entry } = await brokenTextFile('text-retry-consumer')
    const consumer = new FileProviderEmbeddingIndexService({
      getEmbeddingService: () => service,
      logDebug: () => {}
    })
    expect(await consumer.indexCommittedEntries([entry])).toEqual({ retryFileIds: [1] })
  })
})
