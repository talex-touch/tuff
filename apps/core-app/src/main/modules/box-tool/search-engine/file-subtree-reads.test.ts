/**
 * The missing-file sweep's reads (`file-subtree-reads.ts`) against the real migrated schema.
 *
 * Without table statistics the planner's choices are decided by heuristics, so the plans are
 * asserted, not hoped for: the retired bound read every file row of the scope and sorted them
 * (6.7s cold for a home-directory scope on a 6.4GB index).
 */
import { createClient, type Client, type InArgs } from '@libsql/client'
import type { SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  FILE_SUBTREE_SMALL_SCOPE_LIMIT,
  isTransientSubtreeReadError,
  readFileSubtreeBound,
  readFileSubtreePage,
  type FileSubtreePageRow,
  type FileSubtreeReadAll
} from './file-subtree-reads'
import { SearchIndexService, type SearchIndexReadExecutor } from './search-index-service'
import {
  SearchIndexReadWorkerCancelledError,
  SearchIndexReadWorkerQueueFullError,
  SearchIndexReadWorkerTimeoutError,
  SearchIndexReadWorkerUnavailableError
} from './workers/search-index-read-worker-client'

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../resources/db/migrations'
)
const SECONDS = 1_700_000_000
const dialect = new SQLiteSyncDialect()

let directory: string
let client: Client
const compiled: Array<{ sql: string; params: unknown[] }> = []

const readAll: FileSubtreeReadAll = async <T>(query: SQL) => {
  const { sql, params } = dialect.sqlToQuery(query)
  compiled.push({ sql, params })
  const result = await client.execute({ sql, args: params as InArgs })
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((column, index) => [column, row[index]]))
  ) as T[]
}

async function seed(rows: Array<[path: string, type: string]>): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const chunk = rows.slice(offset, offset + 400)
    await client.execute({
      sql: `INSERT INTO files (path, name, mtime, ctime, last_indexed_at, type) VALUES ${chunk
        .map(() => '(?, ?, ?, ?, ?, ?)')
        .join(', ')}`,
      args: chunk.flatMap(([path, type]) => [
        path,
        path.slice(path.lastIndexOf('/') + 1),
        SECONDS,
        SECONDS,
        SECONDS,
        type
      ])
    })
  }
}

async function maxId(): Promise<number> {
  const result = await client.execute('SELECT max(id) AS id FROM files')
  return Number(result.rows[0]?.id)
}

/** Written without the range arithmetic under test: an exact match or a literal prefix. */
async function expectedFileIds(
  scope: string,
  throughId = Number.MAX_SAFE_INTEGER
): Promise<number[]> {
  const prefix = `${scope}/`
  const result = await client.execute({
    sql: `SELECT id FROM files
          WHERE type = 'file' AND id <= ? AND (path = ? OR substr(path, 1, ?) = ?)
          ORDER BY id`,
    args: [throughId, scope, prefix.length, prefix]
  })
  return result.rows.map((row) => Number(row.id))
}

async function pageThrough(
  scope: string,
  small: boolean,
  throughId: number,
  limit: number
): Promise<FileSubtreePageRow[][]> {
  const pages: FileSubtreePageRow[][] = []
  let afterId = 0
  for (;;) {
    const page = await readFileSubtreePage(readAll, scope, small, afterId, throughId, limit)
    if (page.length === 0) return pages
    pages.push(page)
    afterId = page[page.length - 1].id
  }
}

async function planOf(query: { sql: string; params: unknown[] }): Promise<string> {
  const result = await client.execute({
    sql: `EXPLAIN QUERY PLAN ${query.sql}`,
    args: query.params as InArgs
  })
  return result.rows.map((row) => String(row.detail)).join(' | ')
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-file-subtree-reads-'))
  client = createClient({ url: `file:${join(directory, 'search-index.db')}` })
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })

  const rows: Array<[string, string]> = []
  for (let i = 0; i < 1_500; i += 1) rows.push([`/data/bg/a${i}.txt`, 'file'])
  for (let i = 0; i < 40; i += 1) {
    rows.push([`/data/small/f${i}.txt`, 'file'])
    for (let j = 0; j < 100; j += 1) rows.push([`/data/bg/b${i}-${j}.txt`, 'file'])
    if (i === 5) {
      rows.push(
        ['/data/small', 'file'],
        ['/data/small.txt', 'file'],
        ['/data/small copy/x.txt', 'file'],
        ['/data/small-2/y.txt', 'file'],
        ['/data/smallx/z.txt', 'file'],
        ['/data/small0/w.txt', 'file'],
        ['/data/small/app.bundle', 'app'],
        ['/data/small/50%_off!.txt', 'file'],
        ['/data/small/dir.with.dots/n.txt', 'file'],
        ['/data/small/ünï/ç.txt', 'file'],
        ['/data/small/a/b/c/d.txt', 'file']
      )
    }
  }
  for (let i = 0; i < FILE_SUBTREE_SMALL_SCOPE_LIMIT; i += 1)
    rows.push([`/data/edge/e${i}.txt`, 'file'])
  for (let i = 0; i <= FILE_SUBTREE_SMALL_SCOPE_LIMIT; i += 1)
    rows.push([`/data/over/o${i}.txt`, 'file'])
  for (let i = 0; i < 300; i += 1) rows.push([`/data/bg/z${i}.txt`, 'file'])
  await seed(rows)
}, 120_000)

afterAll(async () => {
  client?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('file subtree bound', () => {
  it('is zero for a scope that holds nothing', async () => {
    expect(await readFileSubtreeBound(readAll, '/data/none')).toEqual({
      highWaterMark: 0,
      small: true
    })
  })

  it('bounds a small scope by its own rows, not by the newest row of the table', async () => {
    const bound = await readFileSubtreeBound(readAll, '/data/small')
    const ids = await expectedFileIds('/data/small')

    expect(bound.small).toBe(true)
    expect(bound.highWaterMark).toBeGreaterThanOrEqual(ids[ids.length - 1])
    expect(bound.highWaterMark).toBeLessThan((await maxId()) - 2_000)
  })

  it('bounds a large scope by the largest id of the table', async () => {
    expect(await readFileSubtreeBound(readAll, '/data/over')).toEqual({
      highWaterMark: await maxId(),
      small: false
    })
  })

  it('calls a scope small up to the limit and large one entry past it', async () => {
    expect((await readFileSubtreeBound(readAll, '/data/edge')).small).toBe(true)
    expect((await readFileSubtreeBound(readAll, '/data/over')).small).toBe(false)
  })

  it('never lets a later insert into the scope fall under the bound', async () => {
    for (const scope of ['/data/small', '/data/over']) {
      const bound = await readFileSubtreeBound(readAll, scope)
      await seed([[`${scope}/inserted-after-bound.txt`, 'file']])
      const inserted = await maxId()

      expect(inserted).toBeGreaterThan(bound.highWaterMark)
      const pages = await pageThrough(scope, bound.small, bound.highWaterMark, 64)
      expect(pages.flat().some((row) => row.path.endsWith('inserted-after-bound.txt'))).toBe(false)
    }
  })
})

describe('file subtree pages', () => {
  const siblings = [
    '/data/small.txt',
    '/data/small copy/x.txt',
    '/data/small-2/y.txt',
    '/data/smallx/z.txt',
    '/data/small0/w.txt',
    '/data/small/app.bundle'
  ]

  it.each([
    ['a small scope', '/data/small', 7],
    ['a large scope', '/data/over', 997],
    ['a scope that is a single file', '/data/small/f3.txt', 7]
  ])(
    'returns exactly the file rows of %s, in id order, whichever plan reads them',
    async (_name, scope, size) => {
      const bound = await readFileSubtreeBound(readAll, scope)
      const expected = await expectedFileIds(scope, bound.highWaterMark)

      for (const small of [true, false]) {
        const pages = await pageThrough(scope, small, bound.highWaterMark, size)
        const rows = pages.flat()

        expect(rows.map((row) => row.id)).toEqual(expected)
        expect(pages.every((page) => page.length <= size)).toBe(true)
        expect(rows.map((row) => row.path).filter((path) => siblings.includes(path))).toEqual([])
        expect(rows[0]).toEqual(
          expect.objectContaining({ mtime: SECONDS, ctime: SECONDS, lastIndexedAt: SECONDS })
        )
      }
      expect(expected.length).toBeGreaterThan(0)
    }
  )

  it('keeps names that LIKE would treat as patterns, and the scope row itself', async () => {
    const bound = await readFileSubtreeBound(readAll, '/data/small')
    const paths = (await pageThrough('/data/small', true, bound.highWaterMark, 64))
      .flat()
      .map((row) => row.path)

    expect(paths).toEqual(
      expect.arrayContaining([
        '/data/small',
        '/data/small/50%_off!.txt',
        '/data/small/dir.with.dots/n.txt',
        '/data/small/ünï/ç.txt',
        '/data/small/a/b/c/d.txt'
      ])
    )
  })

  it('starts after the cursor and stops at the bound', async () => {
    const bound = await readFileSubtreeBound(readAll, '/data/small')
    const ids = await expectedFileIds('/data/small', bound.highWaterMark)
    const middle = ids[Math.floor(ids.length / 2)]

    const page = await readFileSubtreePage(
      readAll,
      '/data/small',
      true,
      middle,
      ids[ids.length - 2],
      64
    )

    expect(page.map((row) => row.id)).toEqual(
      ids.filter((id) => id > middle && id <= ids[ids.length - 2])
    )
  })
})

describe('file subtree query plans', () => {
  it('probes the path index without touching a table row', async () => {
    compiled.length = 0
    await readFileSubtreeBound(readAll, '/data/over')

    expect(await planOf(compiled[0])).toMatch(
      /COVERING INDEX files_path_unique \(path>\? AND path<\?\)/
    )
    expect(await planOf(compiled[1])).not.toMatch(/SCAN/)
  })

  it('pages a small scope through the path index and a large one by rowid, sorting only the former', async () => {
    compiled.length = 0
    await readFileSubtreePage(readAll, '/data/small', true, 0, 1_000_000, 64)
    await readFileSubtreePage(readAll, '/data/over', false, 0, 1_000_000, 64)
    const [small, large] = await Promise.all(compiled.map(planOf))

    expect(small).toMatch(/files_path_unique/)
    expect(small).not.toMatch(/SCAN/)
    expect(large).toMatch(/SEARCH files USING INTEGER PRIMARY KEY \(rowid>\? AND rowid<\?\)/)
    expect(large).not.toMatch(/TEMP B-TREE|files_path_unique|idx_files_type/)
  })
})

describe('SearchIndexService subtree reads', () => {
  it('answers both reads through the read executor, not the main-thread connection', async () => {
    const sent: string[] = []
    const executor: SearchIndexReadExecutor = {
      all: async <T>(query: SQL) => {
        sent.push(dialect.sqlToQuery(query).sql)
        return await readAll<T>(query)
      }
    }
    const serviceClient = createClient({ url: `file:${join(directory, 'service.db')}` })
    await serviceClient.execute(`
      CREATE TABLE keyword_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        item_id TEXT NOT NULL,
        provider_id TEXT NOT NULL DEFAULT '',
        priority REAL NOT NULL DEFAULT 1.0
      )
    `)
    await serviceClient.execute(`
      CREATE TABLE search_index_meta (
        provider_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        keyword_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (provider_id, item_id)
      )
    `)
    const db = drizzle(serviceClient)
    const service = new SearchIndexService(db as never, {
      directMode: true,
      initializationMode: 'writer',
      readExecutor: executor
    })
    await service.warmup()
    const onMainThread = (db as unknown as { all: (...args: unknown[]) => unknown }).all
    ;(db as unknown as { all: () => never }).all = () => {
      throw new Error('main-thread connection used')
    }

    try {
      const bound = await service.readFileSubtreeBound('/data/small')
      const page = await service.readFileSubtreePage(
        '/data/small',
        bound.small,
        0,
        bound.highWaterMark,
        5
      )

      expect(page).toHaveLength(5)
      expect(sent).toHaveLength(2)
    } finally {
      ;(db as unknown as { all: unknown }).all = onMainThread
      serviceClient.close()
    }
  })
})

describe('which read failures a sweep may leave for a later pass', () => {
  it.each([
    ['an unavailable reader', new SearchIndexReadWorkerUnavailableError('closed')],
    ['a full queue', new SearchIndexReadWorkerQueueFullError(64)],
    ['a timed-out read', new SearchIndexReadWorkerTimeoutError('read-1', 15_000)]
  ])('treats %s as transient', (_label, error) => {
    expect(isTransientSubtreeReadError(error)).toBe(true)
  })

  it.each([
    ['a cancelled read', new SearchIndexReadWorkerCancelledError()],
    ['a database fault', Object.assign(new Error('malformed'), { code: 'SQLITE_CORRUPT' })],
    ['an error without a code', new Error('boom')],
    ['a bare string', 'SEARCH_INDEX_READ_TIMEOUT'],
    ['null', null]
  ])('does not treat %s as transient', (_label, error) => {
    expect(isTransientSubtreeReadError(error)).toBe(false)
  })
})
