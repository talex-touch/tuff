import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../../../db/schema'
import {
  SqliteFileIndexPersistenceRepository,
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
