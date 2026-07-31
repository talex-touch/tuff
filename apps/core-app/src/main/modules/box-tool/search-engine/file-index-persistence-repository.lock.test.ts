/**
 * Issue #476 lock-contention regression.
 *
 * Uses a real temporary libSQL file with two independent connections to prove:
 * 1. The OLD main-process `UPDATE files` shape deterministically fails with a
 *    raw `DrizzleQueryError` (SQL + `params:` envelope, SQLITE_BUSY cause)
 *    while a second connection holds the WAL writer lock.
 * 2. After the lock is released the worker-owned repository update succeeds
 *    and is idempotent.
 * 3. While the lock is held, the worker-owned update exhausts retries with an
 *    error whose cause chain is still classified as SQLITE_BUSY (so upper
 *    layers can emit `FILE_INDEX_DATABASE_BUSY`, retryable) — and recovers
 *    once the lock is released.
 *
 * Synthetic rows only; no real profile data is ever touched.
 */
import { createClient, type Client } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../../../db/schema'
import { isSqliteBusyError } from '../../../db/sqlite-retry'
import {
  SqliteFileIndexPersistenceRepository,
  type FileMetadataUpdateRecord
} from './file-index-persistence-repository'

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

const SYNTHETIC_PATH = '/synthetic/canary-lock.txt'

function metadataRecord(
  overrides: Partial<FileMetadataUpdateRecord> = {}
): FileMetadataUpdateRecord {
  return {
    id: 1,
    name: 'canary-lock-renamed.md',
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

interface LockFixture {
  directory: string
  writerClient: Client
  lockClient: Client
  writerDb: LibSQLDatabase<typeof schema>
  repository: SqliteFileIndexPersistenceRepository
}

async function createLockFixture(): Promise<LockFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'file-index-update-lock-'))
  const url = `file:${join(directory, 'index.sqlite')}`

  const writerClient = createClient({ url })
  await writerClient.execute('PRAGMA journal_mode = WAL')
  await writerClient.execute('PRAGMA busy_timeout = 200')
  await writerClient.execute(FILES_TABLE_DDL)
  await writerClient.execute(`
    INSERT INTO files (id, path, name, extension, size, mtime, ctime, last_indexed_at, is_dir, type)
    VALUES (1, '${SYNTHETIC_PATH}', 'canary-lock.txt', '.txt', 16, 1, 1, 1, 0, 'file')
  `)

  const lockClient = createClient({ url })
  await lockClient.execute('PRAGMA journal_mode = WAL')
  await lockClient.execute('PRAGMA busy_timeout = 200')

  const writerDb = drizzle(writerClient, { schema })
  const repository = new SqliteFileIndexPersistenceRepository(writerDb)
  return { directory, writerClient, lockClient, writerDb, repository }
}

async function readRow(client: Client): Promise<Record<string, unknown>> {
  const result = await client.execute({
    sql: 'SELECT id, path, name, extension, size, is_dir, type FROM files WHERE id = ?',
    args: [1]
  })
  expect(result.rows).toHaveLength(1)
  return result.rows[0] as unknown as Record<string, unknown>
}

describe('file metadata update under a real second-connection writer lock', () => {
  let fixture: LockFixture | undefined

  afterEach(async () => {
    if (!fixture) return
    // Best-effort: release any lock a failing assertion left behind.
    await fixture.lockClient.execute('ROLLBACK').catch(() => undefined)
    fixture.writerClient.close()
    fixture.lockClient.close()
    await rm(fixture.directory, { recursive: true, force: true })
    fixture = undefined
  })

  it('reproduces the old main UPDATE files busy failure and proves lock-release recovery', async () => {
    fixture = await createLockFixture()
    const { writerDb, lockClient, writerClient } = fixture

    await lockClient.execute('BEGIN IMMEDIATE')

    // The OLD failure shape: a plain Drizzle `UPDATE files` on the main
    // connection while another writer holds the lock (issue #476 screenshot).
    const oldMainUpdate = writerDb
      .update(schema.files)
      .set({
        name: 'canary-lock-renamed.md',
        extension: '.md',
        size: 64,
        ctime: new Date(2_000),
        mtime: new Date(3_000),
        lastIndexedAt: new Date(4_000),
        isDir: false,
        type: 'file'
      })
      .where(eq(schema.files.id, 1))

    const busyError = await oldMainUpdate.then(
      () => null,
      (error: unknown) => error
    )
    expect(busyError).toBeTruthy()
    expect((busyError as Error).message).toContain('Failed query: update "files"')
    expect((busyError as Error).message).toContain('params:')
    expect(isSqliteBusyError(busyError)).toBe(true)

    // The failed update must not have partially applied.
    expect(await readRow(writerClient)).toMatchObject({
      name: 'canary-lock.txt',
      extension: '.txt',
      size: 16,
      type: 'file'
    })

    await lockClient.execute('ROLLBACK')

    // Recovery: the worker-owned repository update succeeds after release.
    await expect(fixture.repository.updateFileMetadata([metadataRecord()])).resolves.toEqual({
      requested: 1,
      updated: 1,
      missingFileIds: []
    })
    expect(await readRow(writerClient)).toMatchObject({
      path: SYNTHETIC_PATH,
      name: 'canary-lock-renamed.md',
      extension: '.md',
      size: 64,
      type: 'file'
    })

    // Idempotent: re-applying the same record updates in place, no duplicates.
    await expect(fixture.repository.updateFileMetadata([metadataRecord()])).resolves.toEqual({
      requested: 1,
      updated: 1,
      missingFileIds: []
    })
    const count = await writerClient.execute('SELECT COUNT(*) AS cnt FROM files')
    expect(Number((count.rows[0] as unknown as { cnt: unknown }).cnt)).toBe(1)
  })

  it(
    'classifies repository update failure under lock as busy and recovers after release',
    { timeout: 30_000 },
    async () => {
      fixture = await createLockFixture()
      const { lockClient, writerClient, repository } = fixture

      await lockClient.execute('BEGIN IMMEDIATE')

      const exhausted = await repository.updateFileMetadata([metadataRecord()]).then(
        () => null,
        (error: unknown) => error
      )
      expect(exhausted).toBeTruthy()
      expect(isSqliteBusyError(exhausted)).toBe(true)

      await lockClient.execute('ROLLBACK')

      await expect(repository.updateFileMetadata([metadataRecord()])).resolves.toEqual({
        requested: 1,
        updated: 1,
        missingFileIds: []
      })
      expect(await readRow(writerClient)).toMatchObject({
        name: 'canary-lock-renamed.md',
        extension: '.md'
      })
    }
  )
})
