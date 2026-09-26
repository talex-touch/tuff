import { createClient, type Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { IndexedWorkerPersistEntryMapperService } from '@talex-touch/utils/search'
import * as schema from '../../../db/schema'
import {
  SqliteFileIndexPersistenceRepository,
  type FileMetadataUpdateRecord,
  type FilePersistenceEntry
} from './file-index-persistence-repository'

function completedEntry(fileId: number): FilePersistenceEntry {
  return {
    fileId,
    fileUpdate: null,
    progress: {
      status: 'completed',
      progress: 100,
      processedBytes: 16,
      totalBytes: 16,
      lastError: null,
      startedAt: null,
      updatedAt: '2026-07-18T00:00:00.000Z'
    }
  }
}

describe('SqliteFileIndexPersistenceRepository', () => {
  let client: Client | undefined
  let directory: string | undefined

  afterEach(async () => {
    client?.close()
    client = undefined
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('commits valid progress and reports a concurrent missing parent without an orphan row', async () => {
    directory = await mkdtemp(join(tmpdir(), 'file-index-persistence-'))
    client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute(`
      CREATE TABLE files (
        id INTEGER PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        display_name TEXT,
        extension TEXT,
        size INTEGER,
        mtime INTEGER NOT NULL,
        ctime INTEGER NOT NULL,
        last_indexed_at INTEGER NOT NULL DEFAULT 0,
        is_dir INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'file',
        content TEXT,
        embedding_status TEXT NOT NULL DEFAULT 'none'
      )
    `)
    await client.execute(`
      CREATE TABLE file_index_progress (
        file_id INTEGER NOT NULL PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER NOT NULL DEFAULT 0,
        processed_bytes INTEGER,
        total_bytes INTEGER,
        last_error TEXT,
        started_at INTEGER,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `)
    await client.execute(`
      INSERT INTO files (id, path, name, mtime, ctime, last_indexed_at, is_dir, type)
      VALUES (1, '/indexed.txt', 'indexed.txt', 0, 0, 0, 0, 'file')
    `)

    const db = drizzle(client, { schema })
    const repository = new SqliteFileIndexPersistenceRepository(db)

    await expect(
      repository.persistEntries([completedEntry(1), completedEntry(404)])
    ).resolves.toMatchObject({
      entries: 2,
      chunks: 1,
      persistedRows: 1,
      progressRows: 1,
      staleFileIds: [404]
    })

    const progressRows = await db
      .select({ fileId: schema.fileIndexProgress.fileId, status: schema.fileIndexProgress.status })
      .from(schema.fileIndexProgress)

    expect(progressRows).toEqual([{ fileId: 1, status: 'completed' }])
  })
})

const FILES_TABLE_DDL = `
  CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    display_name TEXT,
    extension TEXT,
    size INTEGER,
    mtime INTEGER NOT NULL,
    ctime INTEGER NOT NULL,
    last_indexed_at INTEGER NOT NULL DEFAULT 0,
    is_dir INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'file',
    content TEXT,
    embedding_status TEXT NOT NULL DEFAULT 'none'
  )
`

const FILE_INDEX_PROGRESS_DDL = `
  CREATE TABLE file_index_progress (
    file_id INTEGER NOT NULL PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    processed_bytes INTEGER,
    total_bytes INTEGER,
    last_error TEXT,
    started_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT 0
  )
`

function metadataUpdateRecord(
  overrides: Partial<FileMetadataUpdateRecord> = {}
): FileMetadataUpdateRecord {
  return {
    id: 1,
    name: 'canary-renamed.md',
    extension: '.md',
    size: 64,
    ctime: new Date(2_000),
    mtime: new Date(3_000),
    lastIndexedAt: new Date(4_000),
    isDir: false,
    type: 'file',
    ...overrides
  }
}

interface MetadataTestContext {
  client: Client
  db: ReturnType<typeof drizzle<typeof schema>>
  repository: SqliteFileIndexPersistenceRepository
}

describe('SqliteFileIndexPersistenceRepository.updateFileMetadata', () => {
  let context: MetadataTestContext | undefined
  let directory: string | undefined

  async function seedFilesTable(rows: string[] = []): Promise<MetadataTestContext> {
    directory = await mkdtemp(join(tmpdir(), 'file-index-metadata-update-'))
    const client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute(FILES_TABLE_DDL)
    // updateFileMetadata flips dirty rows in file_index_progress inside its transaction, so the
    // fixture must carry the real production table instead of relying on a missing-table no-op.
    await client.execute(FILE_INDEX_PROGRESS_DDL)
    await client.execute(`
      INSERT INTO files (id, path, name, extension, size, mtime, ctime, last_indexed_at, is_dir, type)
      VALUES (1, '/synthetic/canary-alpha.txt', 'canary-alpha.txt', '.txt', 16, 1, 1, 1, 0, 'file')
    `)
    for (const row of rows) {
      await client.execute(row)
    }
    const db = drizzle(client, { schema })
    const repository = new SqliteFileIndexPersistenceRepository(db)
    context = { client, db, repository }
    return context
  }

  async function readFileRow(id: number): Promise<Record<string, unknown>> {
    if (!context) throw new Error('context not initialized')
    const rows = await context.db.select().from(schema.files).where(eq(schema.files.id, id))
    expect(rows).toHaveLength(1)
    return rows[0] as unknown as Record<string, unknown>
  }

  afterEach(async () => {
    context?.client.close()
    context = undefined
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  it('updates file metadata by id inside one transaction', async () => {
    const { repository } = await seedFilesTable()

    await expect(repository.updateFileMetadata([metadataUpdateRecord()])).resolves.toEqual({
      requested: 1,
      updated: 1,
      missingFileIds: []
    })

    const row = await readFileRow(1)
    expect(row).toMatchObject({
      path: '/synthetic/canary-alpha.txt',
      name: 'canary-renamed.md',
      extension: '.md',
      size: 64,
      isDir: false,
      type: 'file'
    })
    expect((row.mtime as Date).getTime()).toBe(3_000)
    expect((row.ctime as Date).getTime()).toBe(2_000)
    expect((row.lastIndexedAt as Date).getTime()).toBe(4_000)
  })

  it('skips missing ids without resurrecting rows by path', async () => {
    const { repository, db } = await seedFilesTable()

    await expect(
      repository.updateFileMetadata([
        metadataUpdateRecord(),
        metadataUpdateRecord({ id: 999, name: 'ghost.txt', extension: '.txt' })
      ])
    ).resolves.toEqual({ requested: 2, updated: 1, missingFileIds: [999] })

    const allRows = await db.select({ id: schema.files.id }).from(schema.files)
    expect(allRows).toEqual([{ id: 1 }])
    const row = await readFileRow(1)
    expect(row.name).toBe('canary-renamed.md')
  })

  it('rejects duplicate file ids before executing SQL', async () => {
    const { repository } = await seedFilesTable()

    await expect(
      repository.updateFileMetadata([
        metadataUpdateRecord({ name: 'first-name.md' }),
        metadataUpdateRecord({ name: 'second-name.md' })
      ])
    ).rejects.toThrow(/FILE_INDEX_METADATA_INVALID: duplicate-file-id/)

    const row = await readFileRow(1)
    expect(row).toMatchObject({
      name: 'canary-alpha.txt',
      extension: '.txt',
      size: 16,
      type: 'file'
    })
  })

  it('rejects oversize batches before executing SQL', async () => {
    const { repository } = await seedFilesTable()
    const records = Array.from({ length: 101 }, (_, index) =>
      metadataUpdateRecord({ id: index + 1 })
    )

    await expect(repository.updateFileMetadata(records)).rejects.toThrow(
      /FILE_INDEX_METADATA_INVALID/
    )
    const row = await readFileRow(1)
    expect(row.name).toBe('canary-alpha.txt')
  })

  it.each([
    ['non-finite id', { id: Number.NaN }],
    ['non-integer id', { id: 1.5 }],
    ['invalid Date instance', { mtime: new Date(Number.NaN) }],
    ['non-finite timestamp', { ctime: Number.POSITIVE_INFINITY }],
    ['invalid timestamp string', { lastIndexedAt: 'not-a-date' }],
    ['non-finite size', { size: Number.NaN }],
    ['negative size', { size: -1 }],
    ['hostile object name', { name: { malicious: true } as unknown as string }],
    ['hostile array extension', { extension: ['.md'] as unknown as string }],
    ['non-boolean isDir', { isDir: 'yes' as unknown as boolean }],
    ['empty type', { type: '' }]
  ])('rejects %s before executing SQL', async (_label, overrides) => {
    const { repository } = await seedFilesTable()

    await expect(repository.updateFileMetadata([metadataUpdateRecord(overrides)])).rejects.toThrow(
      /FILE_INDEX_METADATA_INVALID/
    )

    const row = await readFileRow(1)
    expect(row).toMatchObject({
      name: 'canary-alpha.txt',
      extension: '.txt',
      size: 16,
      type: 'file'
    })
    // Seed stored mtime = 1 second; drizzle `timestamp` mode reads seconds back as ms.
    expect((row.mtime as Date).getTime()).toBe(1_000)
  })

  it('accepts null optional scalars and epoch dates', async () => {
    const { repository } = await seedFilesTable()

    await expect(
      repository.updateFileMetadata([
        metadataUpdateRecord({
          extension: null,
          size: null,
          mtime: 0,
          ctime: '2026-01-01T00:00:00.000Z'
        })
      ])
    ).resolves.toEqual({ requested: 1, updated: 1, missingFileIds: [] })

    const row = await readFileRow(1)
    expect(row.extension).toBeNull()
    expect(row.size).toBeNull()
    expect((row.mtime as Date).getTime()).toBe(0)
    expect((row.ctime as Date).getTime()).toBe(Date.parse('2026-01-01T00:00:00.000Z'))
  })
})

describe('SqliteFileIndexPersistenceRepository fileVersion fencing', () => {
  let client: Client | undefined
  let directory: string | undefined

  afterEach(async () => {
    client?.close()
    client = undefined
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = undefined
    }
  })

  /**
   * Seeds one `files` row whose stored mtime is `mtimeSeconds` (drizzle timestamp mode stores
   * seconds, so the live version a worker must match is `mtimeSeconds * 1000` ms).
   */
  async function seedFile(
    mtimeSeconds: number,
    content: string | null,
    size: number | null = null
  ) {
    directory = await mkdtemp(join(tmpdir(), 'file-index-fencing-'))
    client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
    await client.execute('PRAGMA foreign_keys = ON')
    await client.execute(FILES_TABLE_DDL)
    await client.execute(FILE_INDEX_PROGRESS_DDL)
    await client.execute(`
      INSERT INTO files (id, path, name, size, mtime, ctime, last_indexed_at, is_dir, type, content, embedding_status)
      VALUES (1, '/synthetic/fenced.txt', 'fenced.txt', ${size === null ? 'NULL' : size}, ${mtimeSeconds}, ${mtimeSeconds}, 0, 0, 'file', ${
        content === null ? 'NULL' : `'${content}'`
      }, 'completed')
    `)
    const db = drizzle(client, { schema })
    return { db, repository: new SqliteFileIndexPersistenceRepository(db) }
  }

  function entry(
    fileId: number,
    fileVersion: number | null,
    fileSize: number | null = null
  ): FilePersistenceEntry {
    return {
      fileId,
      fileVersion,
      fileSize,
      fileUpdate: {
        content: 'stale-content',
        embeddingStatus: 'completed',
        contentHash: null
      },
      progress: {
        status: 'completed',
        progress: 100,
        processedBytes: 16,
        totalBytes: 16,
        lastError: null,
        startedAt: null,
        updatedAt: '2026-07-18T00:00:00.000Z'
      }
    }
  }

  /**
   * A worker-shaped result for the real mapper, carrying only what a parse of a live file can
   * know: the fence inputs plus the payload. `undefined` optionals exercise normalization.
   */
  function mappedWorkerResult(
    fileId: number,
    fileVersion: number | null,
    fileSize: number | null = null
  ) {
    return {
      fileId,
      fileVersion,
      fileSize,
      fileUpdate: {
        content: 'mapped-content',
        embeddingStatus: 'completed' as const,
        contentHash: undefined
      },
      progress: {
        status: 'completed' as const,
        progress: 100,
        processedBytes: undefined,
        totalBytes: 16,
        lastError: undefined,
        startedAt: undefined,
        updatedAt: '2026-07-18T00:00:00.000Z'
      },
      // Worker-only payload: it must not survive into the persistence entry.
      indexItem: {
        itemId: String(fileId),
        providerId: 'file-provider',
        type: 'file',
        name: 'fenced.txt'
      }
    }
  }

  it('fences mapper-produced entries against the live fingerprint', async () => {
    const { db, repository } = await seedFile(2, 'newer-content')
    const mapper = new IndexedWorkerPersistEntryMapperService()

    // This mapped entry came from a parse of the file at 1500ms, but the live file is at 2000ms.
    // A mapper that dropped the fence inputs would let this stale parse overwrite newer content.
    await expect(
      repository.persistEntries(mapper.map([mappedWorkerResult(1, 1_500)]))
    ).resolves.toMatchObject({
      persistedRows: 0,
      fileUpdates: 0,
      progressRows: 0,
      supersededFileIds: [1],
      staleFileIds: []
    })
    const staleFiles = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(staleFiles[0]?.content).toBe('newer-content')
    expect(await db.select().from(schema.fileIndexProgress)).toEqual([])

    // The same mapped entry re-read at the live version must persist content and progress.
    await expect(
      repository.persistEntries(mapper.map([mappedWorkerResult(1, 2_000)]))
    ).resolves.toMatchObject({
      persistedRows: 2,
      fileUpdates: 1,
      progressRows: 1,
      supersededFileIds: [],
      staleFileIds: []
    })
    const freshFiles = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(freshFiles[0]?.content).toBe('mapped-content')
    expect(await db.select().from(schema.fileIndexProgress)).toEqual([
      expect.objectContaining({ fileId: 1, status: 'completed' })
    ])
  })

  it('fences mapped entries by the live size when the mtime is unchanged', async () => {
    const { db, repository } = await seedFile(2, 'newer-content', 10)
    const mapper = new IndexedWorkerPersistEntryMapperService()

    // Same-second edit: mtime still matches, but the live size moved from 10 to 11, so this
    // mapped parse is stale. A mapper that dropped `fileSize` would let it overwrite.
    await expect(
      repository.persistEntries(mapper.map([mappedWorkerResult(1, 2_000, 11)]))
    ).resolves.toMatchObject({
      persistedRows: 0,
      fileUpdates: 0,
      progressRows: 0,
      supersededFileIds: [1],
      staleFileIds: []
    })
    const staleFiles = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(staleFiles[0]?.content).toBe('newer-content')
    expect(await db.select().from(schema.fileIndexProgress)).toEqual([])

    // The size the parse saw matches the live file again, so it must persist.
    await expect(
      repository.persistEntries(mapper.map([mappedWorkerResult(1, 2_000, 10)]))
    ).resolves.toMatchObject({
      persistedRows: 2,
      fileUpdates: 1,
      progressRows: 1,
      supersededFileIds: []
    })
    const freshFiles = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(freshFiles[0]?.content).toBe('mapped-content')
    expect(await db.select().from(schema.fileIndexProgress)).toEqual([
      expect.objectContaining({ fileId: 1, status: 'completed' })
    ])
  })

  it('keeps file content when a mapped skipped result persists only its progress', async () => {
    const { db, repository } = await seedFile(2, 'kept-content')
    const mapper = new IndexedWorkerPersistEntryMapperService()
    const skippedResult = {
      ...mappedWorkerResult(1, null),
      fileUpdate: null,
      progress: {
        status: 'skipped' as const,
        progress: 0,
        processedBytes: undefined,
        totalBytes: undefined,
        lastError: 'unsupported',
        startedAt: undefined,
        updatedAt: undefined
      }
    }

    await expect(repository.persistEntries(mapper.map([skippedResult]))).resolves.toMatchObject({
      progressRows: 1
    })

    const files = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(files[0]?.content).toBe('kept-content')
    expect(await db.select().from(schema.fileIndexProgress)).toEqual([
      expect.objectContaining({ fileId: 1, status: 'skipped' })
    ])
  })

  it('skips a result whose fileVersion no longer matches the live file version', async () => {
    const { db, repository } = await seedFile(2, 'newer-content')

    // The worker read version 1500ms; the file has since changed to 2000ms.
    await expect(repository.persistEntries([entry(1, 1_500)])).resolves.toMatchObject({
      entries: 1,
      persistedRows: 0,
      fileUpdates: 0,
      progressRows: 0,
      supersededFileIds: [1],
      staleFileIds: []
    })

    const files = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(files[0]?.content).toBe('newer-content')
    const progress = await db.select().from(schema.fileIndexProgress)
    expect(progress).toEqual([])
  })

  it('persists a result whose fileVersion matches the live file version', async () => {
    const { db, repository } = await seedFile(2, null)

    await expect(repository.persistEntries([entry(1, 2_000)])).resolves.toMatchObject({
      entries: 1,
      persistedRows: 2,
      fileUpdates: 1,
      progressRows: 1,
      supersededFileIds: [],
      staleFileIds: []
    })

    const files = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(files[0]?.content).toBe('stale-content')
    const progress = await db.select().from(schema.fileIndexProgress)
    expect(progress).toEqual([expect.objectContaining({ fileId: 1, status: 'completed' })])
  })

  it('supersedes a same-mtime result whose live size changed', async () => {
    const { db, repository } = await seedFile(2, 'newer-content', 10)

    // SQLite timestamps can be second-quantized, so an in-second edit keeps the same mtime but
    // changes size. The size is part of the fingerprint so stale content cannot overwrite it.
    await expect(repository.persistEntries([entry(1, 2_000, 11)])).resolves.toMatchObject({
      persistedRows: 0,
      fileUpdates: 0,
      progressRows: 0,
      supersededFileIds: [1]
    })

    const files = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(files[0]?.content).toBe('newer-content')
    expect(await db.select().from(schema.fileIndexProgress)).toEqual([])
  })

  it('persists only when both the version and the size match the live file', async () => {
    const { db, repository } = await seedFile(2, null, 10)

    await expect(repository.persistEntries([entry(1, 2_000, 10)])).resolves.toMatchObject({
      persistedRows: 2,
      supersededFileIds: []
    })

    const files = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(files[0]?.content).toBe('stale-content')
  })

  it('does not fence a legacy result that carries no fileVersion', async () => {
    const { db, repository } = await seedFile(2, null)

    await expect(repository.persistEntries([entry(1, null)])).resolves.toMatchObject({
      persistedRows: 2,
      supersededFileIds: [],
      staleFileIds: []
    })

    const files = await db.select().from(schema.files).where(eq(schema.files.id, 1))
    expect(files[0]?.content).toBe('stale-content')
  })

  it('reports a deleted parent as stale rather than superseded', async () => {
    const { repository } = await seedFile(2, null)

    await expect(
      repository.persistEntries([entry(1, 1_500), entry(404, 1_500)])
    ).resolves.toMatchObject({
      staleFileIds: [404],
      supersededFileIds: [1]
    })
  })

  it('fences a previously-completed row back to pending on upsertFiles, without inserting for new files', async () => {
    const { db, repository } = await seedFile(1, null, 10)
    await db.insert(schema.fileIndexProgress).values({
      fileId: 1,
      status: 'completed',
      progress: 100,
      processedBytes: 16,
      totalBytes: 16,
      lastError: null,
      updatedAt: new Date(1_000)
    })

    await repository.upsertFiles([
      {
        path: '/synthetic/fenced.txt',
        name: 'fenced.txt',
        extension: '.txt',
        size: 11,
        mtime: 5_000,
        ctime: 5_000,
        lastIndexedAt: 5_000,
        isDir: false,
        type: 'file'
      },
      {
        path: '/synthetic/added.txt',
        name: 'added.txt',
        extension: '.txt',
        size: 1,
        mtime: 6_000,
        ctime: 6_000,
        lastIndexedAt: 6_000,
        isDir: false,
        type: 'file'
      }
    ])

    // A changed file's stale completion becomes durably retryable in the same write; a brand-new
    // row is covered by the resume query's IS NULL branch and must not gain a progress row here.
    const progress = await db.select().from(schema.fileIndexProgress)
    expect(progress).toEqual([expect.objectContaining({ fileId: 1, status: 'pending' })])
  })

  it('fences a previously-completed row back to pending on updateFileMetadata', async () => {
    const { db, repository } = await seedFile(1, null, 10)
    await db.insert(schema.fileIndexProgress).values({
      fileId: 1,
      status: 'completed',
      progress: 100,
      processedBytes: 16,
      totalBytes: 16,
      lastError: null,
      updatedAt: new Date(1_000)
    })

    await repository.updateFileMetadata([
      {
        id: 1,
        name: 'fenced-renamed.txt',
        extension: '.txt',
        size: 11,
        mtime: 6_000,
        ctime: 6_000,
        lastIndexedAt: 6_000,
        isDir: false,
        type: 'file'
      }
    ])

    const progress = await db.select().from(schema.fileIndexProgress)
    expect(progress).toEqual([expect.objectContaining({ fileId: 1, status: 'pending' })])
  })
})
