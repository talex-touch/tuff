/**
 * Connection-reuse regression on the file-index write path.
 *
 * `@libsql/client`'s local driver used to open a connection per transaction and never close it —
 * measured 200 transactions → 200 open handles — so the file-index write path (a transaction per
 * 5–20-file batch) accumulated thousands of open handles. These tests hold that write path
 * against a real temporary libSQL file and prove:
 *
 * 1. Repeating `upsertFiles` does not grow the number of open handles on the database file (the
 *    process's own fd listing, read the way the leak was measured). The assertion is on the
 *    observable result, not on the call shape: whatever transaction/batch form the write path
 *    takes, none of them may leave a handle behind per call.
 * 2. The pending mark the upsert carries lands on exactly the upserted `type='file'` rows —
 *    out-of-batch rows and non-file rows are untouched, and an already-pending row is not
 *    rewritten.
 * 3. The upsert still returns drizzle-mapped rows (camelCase fields, boolean `isDir`).
 *
 * Synthetic rows only; no real profile data is ever touched.
 */
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { execFileSync } from 'node:child_process'
import { readdirSync, readlinkSync } from 'node:fs'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as schema from '../../../db/schema'
import {
  SqliteFileIndexPersistenceRepository,
  type UpsertFileRecord
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

/** The db file name `countOpenDbHandles` filters on; unique per fixture, so a process-wide
 * `lsof` listing can only match this test's own database (never `-wal`/`-shm` sidecars). */
const CONNECTION_DB_FILE = 'connection-handles.sqlite'

const WRITE_PATH_ITERATIONS = 60

interface SeededFileRow {
  id: number
  path: string
  type: string
  isDir?: boolean
}

interface SeededProgressRow {
  fileId: number
  status: string
  progress: number
  lastError: string | null
}

interface ConnectionSeed {
  files?: SeededFileRow[]
  progress?: SeededProgressRow[]
}

interface ConnectionFixture {
  directory: string
  dbPath: string
  client: Client
  repository: SqliteFileIndexPersistenceRepository
}

async function createConnectionFixture(seed: ConnectionSeed = {}): Promise<ConnectionFixture> {
  const directory = await mkdtemp(join(tmpdir(), 'file-index-connection-'))
  const dbPath = join(directory, CONNECTION_DB_FILE)
  const client = createClient({ url: `file:${dbPath}` })
  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute(FILES_TABLE_DDL)
  await client.execute(FILE_INDEX_PROGRESS_DDL)

  for (const file of seed.files ?? []) {
    await client.execute({
      sql: `INSERT INTO files
              (id, path, name, extension, size, mtime, ctime, last_indexed_at, is_dir, type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        file.id,
        file.path,
        basename(file.path),
        extname(file.path),
        16,
        1_000,
        1_000,
        1_000,
        file.isDir ? 1 : 0,
        file.type
      ]
    })
  }
  for (const progress of seed.progress ?? []) {
    await client.execute({
      sql: `INSERT INTO file_index_progress (file_id, status, progress, last_error, updated_at)
            VALUES (?, ?, ?, ?, ?)`,
      args: [progress.fileId, progress.status, progress.progress, progress.lastError, 1]
    })
  }

  const db = drizzle(client, { schema })
  return {
    directory,
    dbPath,
    client,
    repository: new SqliteFileIndexPersistenceRepository(db)
  }
}

function upsertRecord(seed: number, overrides: Partial<UpsertFileRecord> = {}): UpsertFileRecord {
  return {
    path: `/synthetic/connection-${seed}.txt`,
    name: `connection-${seed}.txt`,
    extension: '.txt',
    size: 128 + seed,
    mtime: new Date(5_000 + seed),
    ctime: new Date(4_000 + seed),
    lastIndexedAt: new Date(6_000 + seed),
    isDir: false,
    type: 'file',
    ...overrides
  }
}

/**
 * Distinct open handles this process holds on the fixture's database file, measured the way the
 * leak was measured: the process's own fd listing, one entry per open handle. Matches only the
 * base file name so the WAL/SHM sidecars (which the write path legitimately holds while it
 * works) never count.
 */
function countOpenDbHandles(dbFileName: string): number {
  const targets: string[] = []
  if (process.platform === 'linux') {
    // The CI image ships no `lsof`; /proc/<pid>/fd is the same listing, one symlink per handle.
    const fdDirectory = `/proc/${process.pid}/fd`
    for (const fd of readdirSync(fdDirectory)) {
      try {
        targets.push(readlinkSync(join(fdDirectory, fd)))
      } catch {
        // Closed between the listing and the readlink: not an open handle.
      }
    }
  } else {
    // `lsof -Fnft` emits one handle as `f<fd>`, `t<type>`, `n<name>` in that order.
    const output = execFileSync('lsof', ['-p', String(process.pid), '-Fnft'], { encoding: 'utf8' })
    const handles = new Set<string>()
    let currentFd: string | null = null
    for (const line of output.split('\n')) {
      const field = line.charAt(0)
      if (field === 'f') {
        currentFd = line.slice(1)
      } else if (field === 'p' || field === 'F') {
        currentFd = null
      } else if (field === 'n' && currentFd !== null) {
        // Keep the fd in the target so two names can never collapse into one handle.
        handles.add(`${currentFd}:${line.slice(1)}`)
      }
    }
    targets.push(...handles)
  }
  return targets.filter((target) => target.endsWith(dbFileName)).length
}

function toPlainRows(rows: ReadonlyArray<unknown>): Array<Record<string, unknown>> {
  return rows.map((row) => ({ ...(row as Record<string, unknown>) }))
}

describe('file index persistence on a real libSQL file', () => {
  let fixture: ConnectionFixture | undefined

  afterEach(async () => {
    if (!fixture) return
    fixture.client.close()
    await rm(fixture.directory, { recursive: true, force: true })
    fixture = undefined
  })

  it('does not grow open database handles when the write path repeats', async () => {
    fixture = await createConnectionFixture()
    const records = [upsertRecord(1), upsertRecord(2), upsertRecord(3)]

    // Warm-up: the first write acquires the client's pooled connection, so the baseline has to
    // be taken after it and only *growth* across later writes is a leak.
    await fixture.repository.upsertFiles(records)
    const before = countOpenDbHandles(CONNECTION_DB_FILE)

    // Probe self-check: the counter must see a handle this process holds itself, otherwise a
    // flat count would just mean `lsof` parsing went blind and the assertion below is vacuous.
    const probe = await open(fixture.dbPath, 'r')
    const withProbe = countOpenDbHandles(CONNECTION_DB_FILE)
    await probe.close()

    for (let iteration = 0; iteration < WRITE_PATH_ITERATIONS; iteration += 1) {
      await fixture.repository.upsertFiles(records)
    }
    const after = countOpenDbHandles(CONNECTION_DB_FILE)

    expect(
      withProbe,
      `probe handle on ${CONNECTION_DB_FILE} not observed: baseline ${before}, with probe ${withProbe}`
    ).toBe(before + 1)
    expect(
      after,
      `open handles on ${CONNECTION_DB_FILE}: ${before} before vs ${after} after ` +
        `${WRITE_PATH_ITERATIONS} upsertFiles calls`
    ).toBeLessThanOrEqual(before + 2)
  })

  it('marks only the upserted file-type rows pending', async () => {
    fixture = await createConnectionFixture({
      files: [
        { id: 1, path: '/synthetic/in-batch.txt', type: 'file' },
        { id: 2, path: '/synthetic/out-of-batch.txt', type: 'file' },
        { id: 3, path: '/synthetic/in-batch.app', type: 'app' },
        { id: 4, path: '/synthetic/already-pending.txt', type: 'file' }
      ],
      progress: [
        { fileId: 1, status: 'completed', progress: 100, lastError: null },
        { fileId: 2, status: 'completed', progress: 100, lastError: null },
        { fileId: 3, status: 'completed', progress: 100, lastError: null },
        { fileId: 4, status: 'pending', progress: 42, lastError: 'previous-failure' }
      ]
    })

    await fixture.repository.upsertFiles([
      upsertRecord(1, { path: '/synthetic/in-batch.txt', name: 'in-batch.txt' }),
      upsertRecord(2, {
        path: '/synthetic/in-batch.app',
        name: 'in-batch.app',
        extension: '.app',
        type: 'app'
      }),
      upsertRecord(3, {
        path: '/synthetic/already-pending.txt',
        name: 'already-pending.txt'
      })
    ])

    const result = await fixture.client.execute(
      'SELECT file_id, status, progress, last_error FROM file_index_progress ORDER BY file_id'
    )
    expect(toPlainRows(result.rows)).toEqual([
      { file_id: 1, status: 'pending', progress: 0, last_error: null },
      { file_id: 2, status: 'completed', progress: 100, last_error: null },
      { file_id: 3, status: 'completed', progress: 100, last_error: null },
      { file_id: 4, status: 'pending', progress: 42, last_error: 'previous-failure' }
    ])
  })

  it('returns drizzle-mapped rows from the upsert', async () => {
    fixture = await createConnectionFixture()

    const returned = await fixture.repository.upsertFiles([
      upsertRecord(1, { isDir: true, type: 'app' }),
      upsertRecord(2)
    ])

    expect(returned).toHaveLength(2)
    const directoryRow = returned.find((row) => row.path === '/synthetic/connection-1.txt')
    expect(directoryRow).toMatchObject({
      path: '/synthetic/connection-1.txt',
      name: 'connection-1.txt',
      extension: '.txt',
      isDir: true,
      type: 'app'
    })
    // Raw SQL column names must not leak to the caller; `returning()` is drizzle-mapped.
    expect(directoryRow).not.toHaveProperty('is_dir')
    expect(directoryRow).not.toHaveProperty('last_indexed_at')
  })
})
