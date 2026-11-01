import { createClient, type Client } from '@libsql/client'
import type { SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { IndexedWorkerPersistEntryMapperService } from '@talex-touch/utils/search'
import * as schema from '../../../../../db/schema'
import { SqliteFileIndexPersistenceRepository } from '../../../search-engine/file-index-persistence-repository'
import { SearchIndexService } from '../../../search-engine/search-index-service'
import { FileProviderEnrichmentResumeService } from './file-provider-enrichment-resume-service'
import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type {
  PersistEntriesSummary,
  FilePersistenceEntry
} from '../../../search-engine/workers/search-index-worker-client'
import { describe, expect, it, vi } from 'vitest'
import type { FileProviderEmbeddingIndexOutcome } from './file-provider-embedding-index-service'
import { FileProviderIndexFlushBufferService } from './file-provider-index-flush-service'
import { FileProviderIndexFlushExecutorService } from './file-provider-index-flush-executor-service'

function createResult(fileId: number, content = `content-${fileId}`): IndexWorkerFileResult {
  return {
    type: 'file',
    taskId: `task-${fileId}`,
    fileId,
    progress: {
      status: 'completed',
      progress: 100,
      processedBytes: 1,
      totalBytes: 1,
      lastError: null,
      updatedAt: '2026-10-12T00:00:00.000Z'
    },
    fileUpdate: null,
    indexItem: {
      itemId: String(fileId),
      providerId: 'file-provider',
      type: 'file',
      name: `file-${fileId}`,
      content
    }
  }
}

function toPersistEntries(entries: IndexWorkerFileResult[]): FilePersistenceEntry[] {
  return entries.map((entry) => ({
    fileId: entry.fileId,
    fileUpdate: null,
    progress: {
      status: entry.progress.status,
      progress: entry.progress.progress,
      processedBytes: entry.progress.processedBytes,
      totalBytes: entry.progress.totalBytes,
      lastError: entry.progress.lastError,
      startedAt: entry.progress.startedAt ?? null,
      updatedAt: entry.progress.updatedAt ?? null
    }
  }))
}

function createPersistSummary(entries: FilePersistenceEntry[]): PersistEntriesSummary {
  return {
    entries: entries.length,
    chunks: entries.length > 0 ? 1 : 0,
    persistedRows: entries.length,
    fileUpdates: 0,
    progressRows: entries.length,
    embeddings: 0
  }
}

function createExecutor(options: {
  pending: Map<number, IndexWorkerFileResult>
  batchSize?: number
  checkContentCapacity?: () => Promise<boolean>
  indexEmbeddings?: (
    entries: IndexWorkerFileResult[]
  ) => Promise<FileProviderEmbeddingIndexOutcome | void>
  buildPersistEntries?: (entries: IndexWorkerFileResult[]) => FilePersistenceEntry[]
  inflight?: Map<number, IndexWorkerFileResult>
  dbUtils?: unknown | null
  searchIndex?: unknown | null
  ensureSearchIndexWorkerReady?: (reason: string) => Promise<boolean>
  persistEntries?: (entries: FilePersistenceEntry[]) => Promise<PersistEntriesSummary>
  publishRecords?: (entries: IndexWorkerFileResult[]) => Promise<number>
}) {
  const inflight = options.inflight ?? new Map<number, IndexWorkerFileResult>()
  const buffer = new FileProviderIndexFlushBufferService(options.pending, inflight)
  const recordDuration = vi.fn()
  const waitForCapacity = vi.fn(async () => undefined)
  const persistEntries = vi.fn(
    options.persistEntries ?? (async (entries) => createPersistSummary(entries))
  )
  const ensureSearchIndexWorkerReady = vi.fn(
    options.ensureSearchIndexWorkerReady ?? (async () => true)
  )
  const publishRecords = vi.fn(options.publishRecords ?? (async (entries) => entries.length))
  const nowValues = [100, 145]
  const now = vi.fn(() => nowValues.shift() ?? 145)

  return {
    inflight,
    recordDuration,
    waitForCapacity,
    persistEntries,
    publishRecords,
    ensureSearchIndexWorkerReady,
    executor: new FileProviderIndexFlushExecutorService({
      flushBatchScheduler: {
        currentSize: options.batchSize ?? 2,
        recordDuration
      },
      getDbUtils: () => ('dbUtils' in options ? options.dbUtils : {}),
      getSearchIndex: () => ('searchIndex' in options ? options.searchIndex : {}),
      buffer,
      ensureSearchIndexWorkerReady,
      getSearchIndexWorker: () => ({ persistEntries }),
      buildPersistEntries: options.buildPersistEntries ?? toPersistEntries,
      publishRecords,
      checkContentCapacity: options.checkContentCapacity,
      indexEmbeddings: options.indexEmbeddings,
      logDebug: vi.fn(),
      waitForCapacity,
      now,
      config: {
        dbBackpressureMaxQueued: 3
      }
    })
  }
}

function createImageResult(
  fileId: number,
  status: 'pending' | 'processing' = 'pending'
): IndexWorkerFileResult {
  const result = createResult(fileId, '')
  return {
    ...result,
    fileVersion: 2_000,
    fileSize: 16,
    progress: {
      ...result.progress,
      status,
      progress: 0,
      processedBytes: 0,
      totalBytes: 16,
      lastError: 'image-embedding-pending'
    },
    fileUpdate: { content: null, embeddingStatus: 'pending' },
    indexItem: {
      ...result.indexItem,
      path: `/images/dog-${fileId}.png`,
      name: `dog-${fileId}.png`
    }
  }
}

async function createProgressRepository(client: Client, entries: IndexWorkerFileResult[]) {
  await client.execute('PRAGMA foreign_keys = ON')
  await client.execute(`CREATE TABLE files (
    id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    display_name TEXT, extension TEXT, size INTEGER, mtime INTEGER NOT NULL,
    ctime INTEGER NOT NULL, last_indexed_at INTEGER NOT NULL DEFAULT 0,
    is_dir INTEGER NOT NULL DEFAULT 0, type TEXT NOT NULL DEFAULT 'file',
    content TEXT, embedding_status TEXT NOT NULL
  )`)
  await client.execute(`CREATE TABLE file_index_progress (
    file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    status TEXT NOT NULL, progress INTEGER NOT NULL, processed_bytes INTEGER,
    total_bytes INTEGER, last_error TEXT, started_at INTEGER, updated_at INTEGER NOT NULL
  )`)
  await client.execute(`CREATE TABLE file_extensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    key TEXT NOT NULL, value TEXT NOT NULL
  )`)
  await client.execute(`CREATE TABLE embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL,
    source_type TEXT NOT NULL, embedding TEXT NOT NULL, model TEXT NOT NULL,
    content_hash TEXT, created_at INTEGER NOT NULL
  )`)
  await client.batch(
    entries.map((entry) => ({
      sql: `INSERT INTO files (id, path, name, extension, size, mtime, ctime, embedding_status)
        VALUES (?, ?, ?, ?, 16, 2, 2, 'none')`,
      args: [
        entry.fileId,
        entry.indexItem.path ?? `/files/${entry.fileId}.txt`,
        entry.indexItem.name,
        entry.fileUpdate?.content === null ? '.png' : '.txt'
      ]
    })),
    'write'
  )
  const db = drizzle(client, { schema })
  return { db, repository: new SqliteFileIndexPersistenceRepository(db) }
}

async function commitImageEmbeddings(client: Client, entries: IndexWorkerFileResult[]) {
  for (const entry of entries) {
    if (entry.progress.lastError !== 'image-embedding-pending') continue
    // Model inference is the external boundary; its completion is a real atomic SQL write.
    await client.batch(
      [
        {
          sql: `INSERT INTO embeddings (source_id, source_type, embedding, model, content_hash, created_at)
            VALUES (?, 'file', '[1,0]', 'image-test-space/dim2', 'image-hash', 99)`,
          args: [String(entry.fileId)]
        },
        {
          sql: "UPDATE files SET embedding_status = 'completed' WHERE id = ?",
          args: [entry.fileId]
        },
        {
          sql: `UPDATE file_index_progress SET status = 'completed', progress = 100,
            processed_bytes = 16, last_error = NULL, updated_at = 99 WHERE file_id = ?`,
          args: [entry.fileId]
        }
      ],
      'write'
    )
  }
}

describe('file-provider-index-flush-executor-service', () => {
  it('persists a batch and commits inflight entries', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([
      [1, createResult(1)],
      [2, createResult(2)],
      [3, createResult(3)]
    ])
    const { executor, inflight, persistEntries, publishRecords, waitForCapacity, recordDuration } =
      createExecutor({
        pending
      })

    const result = await executor.execute()

    expect(result).toMatchObject({
      status: 'flushed',
      entries: 2,
      withContent: 2,
      pending: 1,
      inflight: 0,
      reason: 'persisted',
      metadata: { storeBoundary: 'indexed-write-flush', withContent: 2 },
      durationMs: 45
    })
    expect(result.metadata).toMatchObject({
      persistedRows: 2,
      indexedItems: 2,
      progressRows: 2,
      chunks: 1
    })
    expect(waitForCapacity).toHaveBeenCalledWith(3)
    expect(persistEntries).toHaveBeenCalledTimes(1)
    expect(persistEntries.mock.calls[0][0][0]).not.toHaveProperty('indexItem')
    expect(publishRecords).toHaveBeenCalledWith([
      expect.objectContaining({ indexItem: expect.objectContaining({ itemId: '1' }) }),
      expect.objectContaining({ indexItem: expect.objectContaining({ itemId: '2' }) })
    ])
    expect(recordDuration).toHaveBeenCalledWith(45)
    expect(pending.has(1)).toBe(false)
    expect(pending.has(2)).toBe(false)
    expect(pending.has(3)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('publishes only committed records when persistence marks a file stale', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([
      [1, createResult(1)],
      [2, createResult(2)]
    ])
    const { executor, publishRecords } = createExecutor({
      pending,
      persistEntries: async (entries) => ({
        ...createPersistSummary(entries),
        persistedRows: 1,
        progressRows: 1,
        staleFileIds: [2]
      })
    })

    const result = await executor.execute()

    expect(publishRecords).toHaveBeenCalledWith([
      expect.objectContaining({ indexItem: expect.objectContaining({ itemId: '1' }) })
    ])
    expect(result.metadata).toMatchObject({
      persistedRows: 1,
      progressRows: 1,
      indexedItems: 1,
      staleEntries: 1
    })
  })

  it('rolls back the batch when the worker is not ready', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const { executor, inflight, persistEntries } = createExecutor({
      pending,
      ensureSearchIndexWorkerReady: async () => false
    })

    const result = await executor.execute()

    expect(result).toMatchObject({
      status: 'worker-not-ready',
      entries: 1,
      pending: 1,
      inflight: 0,
      reason: 'not-ready',
      metadata: { storeBoundary: 'indexed-write-flush', withContent: 1 }
    })
    expect(persistEntries).not.toHaveBeenCalled()
    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('rolls back the batch when persist fails', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const persistError = new Error('persist failed')
    const { executor, inflight } = createExecutor({
      pending,
      persistEntries: async () => {
        throw persistError
      }
    })

    await expect(executor.execute()).rejects.toThrow('persist failed')

    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
  })

  it('keeps the local batch retryable when runtime publication fails after persistence', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const publishError = new Error('runtime publish failed')
    const { executor, inflight, persistEntries, publishRecords } = createExecutor({
      pending,
      publishRecords: async () => {
        throw publishError
      }
    })

    await expect(executor.execute()).rejects.toThrow('runtime publish failed')

    expect(persistEntries).toHaveBeenCalledTimes(1)
    expect(publishRecords).toHaveBeenCalledTimes(1)
    expect(pending.size).toBe(0)
    expect(inflight.get(1)?.indexItem.content).toBe('content-1')
  })

  it('returns idle when storage dependencies are unavailable', async () => {
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const { executor, persistEntries, waitForCapacity, ensureSearchIndexWorkerReady, inflight } =
      createExecutor({
        pending,
        dbUtils: null
      })

    await expect(executor.execute()).resolves.toMatchObject({
      status: 'idle',
      entries: 0,
      pending: 1,
      reason: 'unavailable'
    })
    expect(pending.has(1)).toBe(true)
    expect(inflight.size).toBe(0)
    expect(ensureSearchIndexWorkerReady).not.toHaveBeenCalled()
    expect(waitForCapacity).not.toHaveBeenCalled()
    expect(persistEntries).not.toHaveBeenCalled()
  })

  it('surfaces a real SQLite failure and keeps its uncommitted payload retryable', async () => {
    const client = createClient({ url: ':memory:' })
    const pending = new Map<number, IndexWorkerFileResult>([[1, createResult(1)]])
    const visible: number[] = []
    const { executor, inflight } = createExecutor({
      pending,
      persistEntries: async (entries) => {
        for (const entry of entries)
          await client.execute({
            sql: 'INSERT INTO progress VALUES (?, ?)',
            args: [entry.fileId, entry.progress.status]
          })
        return createPersistSummary(entries)
      },
      publishRecords: async (entries) => {
        visible.push(...entries.map((entry) => entry.fileId))
        return entries.length
      }
    })
    try {
      await expect(executor.execute()).rejects.toMatchObject({ code: 'SQLITE_ERROR' })
      expect(visible).toEqual([])
      expect(pending.get(1)?.indexItem.content).toBe('content-1')
      expect(inflight.size).toBe(0)
      await client.execute(
        'CREATE TABLE progress (file_id INTEGER PRIMARY KEY, status TEXT NOT NULL)'
      )
      await expect(executor.execute()).resolves.toMatchObject({
        status: 'flushed',
        pending: 0,
        inflight: 0
      })
      expect((await client.execute('SELECT file_id, status FROM progress')).rows).toEqual([
        { file_id: 1, status: 'completed' }
      ])
      expect(visible).toEqual([1])
    } finally {
      client.close()
    }
  })
})

describe('file flush image completion ownership', () => {
  it.each(['pending', 'processing'] as const)(
    'preserves the image transaction for an originally %s result, confirms text terminals, and resumes only the suffix',
    async (imageStatus) => {
      const client = createClient({ url: ':memory:' })
      let resume: FileProviderEnrichmentResumeService | undefined
      let shuttingDown = false
      try {
        const entries = [
          createImageResult(1, imageStatus),
          ...(['completed', 'skipped', 'failed'] as const).map((status, index) => {
            const result = createResult(index + 2)
            return {
              ...result,
              progress: {
                ...result.progress,
                status,
                progress: status === 'completed' ? 100 : 0,
                lastError:
                  status === 'skipped'
                    ? 'unsupported-extension'
                    : status === 'failed'
                      ? 'parser-error'
                      : null
              }
            }
          })
        ]
        const { db, repository } = await createProgressRepository(client, [
          ...entries,
          createImageResult(5)
        ])
        const pending = new Map(entries.map((entry) => [entry.fileId, entry]))
        const mapper = new IndexedWorkerPersistEntryMapperService()
        const { executor } = createExecutor({
          pending,
          batchSize: entries.length,
          checkContentCapacity: async () => true,
          buildPersistEntries: (records) => mapper.map(records) as FilePersistenceEntry[],
          persistEntries: (records) => repository.persistEntries(records),
          indexEmbeddings: (records) => commitImageEmbeddings(client, records)
        })

        await expect(executor.execute()).resolves.toMatchObject({ status: 'flushed' })

        expect(
          (
            await client.execute(`SELECT file_id, status, last_error
            FROM file_index_progress ORDER BY file_id`)
          ).rows
        ).toEqual([
          { file_id: 1, status: 'completed', last_error: null },
          { file_id: 2, status: 'completed', last_error: null },
          { file_id: 3, status: 'skipped', last_error: 'unsupported-extension' },
          { file_id: 4, status: 'failed', last_error: 'parser-error' }
        ])
        expect(
          (
            await client.execute(`SELECT progress, processed_bytes, updated_at
            FROM file_index_progress WHERE file_id = 1`)
          ).rows
        ).toEqual([{ progress: 100, processed_bytes: 16, updated_at: 99 }])
        expect(
          (await client.execute('SELECT content, embedding_status FROM files WHERE id = 1')).rows
        ).toEqual([{ content: null, embedding_status: 'completed' }])
        expect(
          (await client.execute('SELECT source_id, embedding FROM embeddings ORDER BY source_id'))
            .rows
        ).toEqual([{ source_id: '1', embedding: '[1,0]' }])

        // Use the real recovery query, not a supplied page: the completed prefix must no
        // longer consume admission, so the next normal flush can finish the missing suffix.
        const recoveredPages: number[][] = []
        const recovered = Promise.withResolvers<void>()
        // The reader-mode service checks these columns before its first read.
        await client.execute(
          'CREATE VIRTUAL TABLE search_index USING fts5(item_id UNINDEXED, provider UNINDEXED, content)'
        )
        const reader = new SearchIndexService(db, {
          initializationMode: 'reader',
          readiness: { waitUntilReady: async () => undefined },
          readExecutor: { all: async <T>(query: SQL): Promise<T[]> => await db.all<T>(query) }
        })
        resume = new FileProviderEnrichmentResumeService({
          getSearchIndex: () => reader,
          isShuttingDown: () => shuttingDown,
          isEnabled: () => true,
          isImageEmbeddingReady: () => true,
          withMutationLease: async (operation) => operation('image-completion-recovery'),
          scheduleIndexing: async (files) => {
            recoveredPages.push(files.map((file) => Number(file.id)))
            for (const file of files) {
              const fileId = Number(file.id)
              pending.set(fileId, createImageResult(fileId))
            }
            await executor.execute()
            return { accepted: files.length, deferred: 0 }
          },
          waitForSearchIndexDrain: async () => undefined,
          yieldToEventLoop: async () => undefined,
          logInfo: () => recovered.resolve(),
          logWarn: (_message, error) => recovered.reject(error)
        })
        resume.resume('image-completion-regression')
        await recovered.promise

        expect(recoveredPages).toEqual([[5]])
        expect(
          (
            await client.execute(`SELECT status, progress, last_error
            FROM file_index_progress WHERE file_id = 5`)
          ).rows
        ).toEqual([{ status: 'completed', progress: 100, last_error: null }])
        expect(
          (await client.execute('SELECT source_id, embedding FROM embeddings ORDER BY source_id'))
            .rows
        ).toEqual([
          { source_id: '1', embedding: '[1,0]' },
          { source_id: '5', embedding: '[1,0]' }
        ])
      } finally {
        shuttingDown = true
        resume?.stop()
        client.close()
      }
    }
  )

  it.each([
    { state: 'pending', outcome: 'encoder failure' },
    { state: 'processing', outcome: 'encoder failure' },
    { state: 'pending', outcome: 'encoder unavailable' },
    { state: 'processing', outcome: 'encoder unavailable' }
  ] as const)(
    'leaves an originally $state image retryable after $outcome without a completed transaction',
    async ({ state, outcome }) => {
      const client = createClient({ url: ':memory:' })
      try {
        const image = createImageResult(1, state)
        const { repository } = await createProgressRepository(client, [image])
        const mapper = new IndexedWorkerPersistEntryMapperService()
        const { executor } = createExecutor({
          pending: new Map([[image.fileId, image]]),
          checkContentCapacity: async () => true,
          buildPersistEntries: (entries) => mapper.map(entries) as FilePersistenceEntry[],
          persistEntries: (entries) => repository.persistEntries(entries),
          indexEmbeddings: async () => {
            if (outcome === 'encoder failure') throw new Error('Image encoder failed')
          }
        })

        await expect(executor.execute()).resolves.toMatchObject({ status: 'flushed' })

        expect(
          (
            await client.execute(`SELECT status, progress, last_error
            FROM file_index_progress WHERE file_id = 1`)
          ).rows
        ).toEqual([{ status: 'pending', progress: 0, last_error: 'image-embedding-pending' }])
        expect(
          (await client.execute('SELECT content, embedding_status FROM files WHERE id = 1')).rows
        ).toEqual([{ content: null, embedding_status: 'pending' }])
        expect((await client.execute('SELECT source_id FROM embeddings')).rows).toEqual([])
      } finally {
        client.close()
      }
    }
  )
})

describe('file flush text embedding retry ownership', () => {
  async function openBatch(client: Client) {
    const entries = [createResult(1), createResult(2)]
    const { repository } = await createProgressRepository(client, entries)
    const mapper = new IndexedWorkerPersistEntryMapperService()
    return {
      pending: new Map(entries.map((entry) => [entry.fileId, entry])),
      buildPersistEntries: (records: IndexWorkerFileResult[]) =>
        mapper.map(records) as FilePersistenceEntry[],
      persistEntries: (records: FilePersistenceEntry[]) => repository.persistEntries(records)
    }
  }
  const progress = (client: Client) =>
    client.execute('SELECT file_id, status FROM file_index_progress ORDER BY file_id')

  it('keeps a text file whose vectors failed pending for the retry lane and completes the rest', async () => {
    const client = createClient({ url: ':memory:' })
    try {
      const { executor } = createExecutor({
        ...(await openBatch(client)),
        checkContentCapacity: async () => true,
        indexEmbeddings: async () => ({ retryFileIds: [1] })
      })

      await expect(executor.execute()).resolves.toMatchObject({ status: 'flushed' })

      expect((await progress(client)).rows).toEqual([
        { file_id: 1, status: 'pending' },
        { file_id: 2, status: 'completed' }
      ])
    } finally {
      client.close()
    }
  })

  it('keeps that decision when the retained batch is replayed after the final capacity fence paused it', async () => {
    const client = createClient({ url: ':memory:' })
    try {
      let paused = false
      const indexEmbeddings = vi.fn(async () => {
        paused = true
        return { retryFileIds: [1] }
      })
      const { executor } = createExecutor({
        ...(await openBatch(client)),
        checkContentCapacity: async () => !paused,
        indexEmbeddings
      })

      await expect(executor.execute()).rejects.toThrow('FILE_CONTENT_STORAGE_PAUSED')
      paused = false
      await expect(executor.execute()).resolves.toMatchObject({ status: 'flushed' })

      expect(indexEmbeddings).toHaveBeenCalledTimes(1)
      expect((await progress(client)).rows).toEqual([
        { file_id: 1, status: 'pending' },
        { file_id: 2, status: 'completed' }
      ])
    } finally {
      client.close()
    }
  })

  it('completes every text file when the embedding step reports nothing to retry', async () => {
    const client = createClient({ url: ':memory:' })
    try {
      const { executor } = createExecutor({
        ...(await openBatch(client)),
        checkContentCapacity: async () => true,
        indexEmbeddings: async () => ({ retryFileIds: [] })
      })

      await expect(executor.execute()).resolves.toMatchObject({ status: 'flushed' })

      expect((await progress(client)).rows).toEqual([
        { file_id: 1, status: 'completed' },
        { file_id: 2, status: 'completed' }
      ])
    } finally {
      client.close()
    }
  })
})
