import { createClient, type Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
