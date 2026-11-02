/**
 * Regression tests for search-index.db schema parity (V1 failure, 2026-08-04).
 *
 * Drizzle migrations create `keyword_mappings` WITHOUT `provider_id` and
 * `scan_progress` in the legacy path-only shape; the primary database receives
 * both fixups out-of-band after migrate(). `initSearchDatabase()` must apply
 * the same fixups to the dedicated search file, or the worker's first init
 * dies (CREATE INDEX ... ON keyword_mappings(provider_id, keyword) →
 * SQLITE_ERROR) and source-scoped scan_progress writes have no home.
 *
 * Unlike `index.test.ts`, this suite uses REAL libsql clients, drizzle, and
 * the real generated migrations on temp files — the drift being tested lives
 * between the generated migrations and the runtime fixups.
 */
import type { Client } from '@libsql/client'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { copyFile, cp, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { dbLogMock, capOverride } = vi.hoisted(() => ({
  dbLogMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  capOverride: { bytes: null as number | null }
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: vi.fn(() => dbLogMock)
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  pollingService: {
    register: vi.fn(),
    unregister: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => '/tmp/tuff-app'),
    getPath: vi.fn(() => '/tmp/tuff-user-data')
  },
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => [])
  },
  dialog: {
    showMessageBox: vi.fn()
  }
}))

// Point the locator at the REAL resources/db/locator.json so
// resolveMigrationsFolder() finds the actual generated migrations.
vi.mock('../../../../resources/db/locator.json?commonjs-external&asset', () => {
  const testDir = dirname(fileURLToPath(import.meta.url))
  return { default: resolve(testDir, '../../../../resources/db/locator.json') }
})

vi.mock('../box-tool/search-engine/search-index-writer', () => ({
  searchIndexWriter: {
    getStatus: vi.fn(),
    withPausedAdmission: vi.fn()
  }
}))

// A test can set the cap to the size of its own fixture; null keeps the real volume-based cap.
vi.mock('../../db/search-index-size-cap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/search-index-size-cap')>()
  return {
    ...actual,
    readSearchIndexMaxBytes: async (directory: string) =>
      capOverride.bytes ?? (await actual.readSearchIndexMaxBytes(directory))
  }
})

// Force the split ON for initSearchDatabase (default is still off until the
// validated flip); keep every other runtime flag real.
vi.mock('../../db/runtime-flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db/runtime-flags')>()),
  DB_SEARCH_SPLIT_ENABLED: true
}))

import { DatabaseModule } from './index'
import { operationalErrorService } from '../observability'
import { SearchIndexService } from '../box-tool/search-engine/search-index-service'
import {
  acknowledgeFileDeletionCommitsInHome,
  removeFileRecordsInTransaction,
  type UpsertFileRecord
} from '../box-tool/search-engine/file-index-persistence-repository'
import {
  resolveSearchIndexReservePages,
  SEARCH_INDEX_RESERVE_REACHED
} from '../../db/search-index-size-cap'
import { isSqliteStorageFullError } from '../../db/sqlite-retry'

const LEGACY_KEYWORD_MAPPINGS_DDL = `CREATE TABLE keyword_mappings (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  keyword text NOT NULL,
  item_id text NOT NULL,
  priority real DEFAULT 1 NOT NULL
)`

// The exact statement that failed in the V1 run.
const V1_FAILING_INDEX_DDL =
  'CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_keyword ON keyword_mappings(provider_id, keyword)'

interface DatabaseModuleInternals {
  initSearchDatabase: (databaseDirPath: string) => Promise<void>
  applyKeywordMappingsProviderColumnFixup: (client: Client) => Promise<void>
  ensureKeywordMappingsProviderColumn: (client?: Client | null) => Promise<void>
  searchInitialized: boolean
  searchClient: Client | null
  searchDbPath: string
}

function moduleInternals(module: DatabaseModule): DatabaseModuleInternals {
  return module as unknown as DatabaseModuleInternals
}

async function hasProviderIdColumn(client: Client): Promise<boolean> {
  const check = await client.execute(
    "SELECT 1 FROM pragma_table_info('keyword_mappings') WHERE name = 'provider_id' LIMIT 1"
  )
  return check.rows.length > 0
}

async function readScanProgressPrimaryKey(client: Client): Promise<string[]> {
  const info = await client.execute('PRAGMA table_info(scan_progress)')
  return info.rows
    .map((row) => row as unknown as { name: string; pk: number })
    .filter((row) => Number(row.pk) > 0)
    .sort((left, right) => Number(left.pk) - Number(right.pk))
    .map((row) => row.name)
}

describe('keyword_mappings provider_id fixup (parameterized)', () => {
  let dir = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    dir = await mkdtemp(join(tmpdir(), 'tuff-kw-provider-fixup-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('adds provider_id to a legacy-shaped table and is idempotent', async () => {
    const client = createClient({ url: `file:${join(dir, 'legacy.sqlite')}` })
    try {
      await client.execute(LEGACY_KEYWORD_MAPPINGS_DDL)
      await expect(client.execute(V1_FAILING_INDEX_DDL)).rejects.toThrow()

      const module = new DatabaseModule()
      await moduleInternals(module).applyKeywordMappingsProviderColumnFixup(client)
      expect(await hasProviderIdColumn(client)).toBe(true)

      // Second run must be a no-op, not a duplicate-column failure.
      await moduleInternals(module).applyKeywordMappingsProviderColumnFixup(client)
      const columns = await client.execute(
        "SELECT count(*) AS cnt FROM pragma_table_info('keyword_mappings') WHERE name = 'provider_id'"
      )
      expect(Number((columns.rows[0] as unknown as { cnt: number }).cnt)).toBe(1)

      // The exact V1 failing statement now succeeds.
      await expect(client.execute(V1_FAILING_INDEX_DDL)).resolves.toBeDefined()
    } finally {
      client.close()
    }
  })

  it('throws from the core fixup but is swallowed by the primary wrapper', async () => {
    // No keyword_mappings table at all: the ALTER fails.
    const client = createClient({ url: `file:${join(dir, 'missing-table.sqlite')}` })
    try {
      const module = new DatabaseModule()
      await expect(
        moduleInternals(module).applyKeywordMappingsProviderColumnFixup(client)
      ).rejects.toThrow()

      // The primary-path wrapper keeps its historical warn-and-continue policy.
      await expect(
        moduleInternals(module).ensureKeywordMappingsProviderColumn(client)
      ).resolves.toBeUndefined()
      expect(dbLogMock.warn).toHaveBeenCalledWith(
        'Failed to set up `provider_id` column pre-migration',
        expect.objectContaining({ error: expect.anything() })
      )
    } finally {
      client.close()
    }
  })
})

describe('initSearchDatabase schema parity with the primary fixups', () => {
  let dir = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    dir = await mkdtemp(join(tmpdir(), 'tuff-search-db-init-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates search-index.db with provider_id and source-scoped scan_progress', async () => {
    const module = new DatabaseModule()
    const internals = moduleInternals(module)

    await internals.initSearchDatabase(dir)

    expect(internals.searchInitialized).toBe(true)
    expect(internals.searchDbPath).toBe(join(dir, 'search-index.db'))
    const searchClient = internals.searchClient
    expect(searchClient).not.toBeNull()
    try {
      expect(await hasProviderIdColumn(searchClient!)).toBe(true)
      expect(await readScanProgressPrimaryKey(searchClient!)).toEqual(['source_id', 'path'])
      // Regression: the statement that killed the V1 worker init must work
      // against the fresh search file.
      await expect(searchClient!.execute(V1_FAILING_INDEX_DDL)).resolves.toBeDefined()
      // Perf-index parity: embeddings are split-routed, so the search file
      // needs the same (source_type, source_id) index the primary gets from
      // ensureSearchPerformanceIndexes().
      const perfIndex = await searchClient!.execute(
        "SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_embeddings_source' LIMIT 1"
      )
      expect(perfIndex.rows).toHaveLength(1)
      await searchClient!.execute(`INSERT INTO search_index_meta
        (provider_id, item_id, keyword_hash, updated_at, fts_rowid, document_hash)
        VALUES ('provider-a', 'shared', 'keyword-a', 111, 31, 'document-a'),
               ('provider-b', 'shared', 'keyword-b', 222, 32, 'document-b')`)
      await searchClient!.execute(
        "DELETE FROM search_index_meta WHERE provider_id = 'provider-a' AND item_id = 'shared'"
      )
      expect(
        (
          await searchClient!.execute(`SELECT provider_id, item_id, fts_rowid, document_hash
        FROM search_index_meta`)
        ).rows
      ).toEqual([
        { provider_id: 'provider-b', item_id: 'shared', fts_rowid: 32, document_hash: 'document-b' }
      ])
      await searchClient!.execute(
        "INSERT INTO search_index_maintenance_progress(task, cursor) VALUES ('locators', 32)"
      )
      expect(
        (await searchClient!.execute('SELECT task, cursor FROM search_index_maintenance_progress'))
          .rows
      ).toEqual([{ task: 'locators', cursor: 32 }])
      const expectedRecord = JSON.stringify({
        id: 1,
        path: '/root/a.txt',
        mtime: 11,
        ctime: 7,
        size: 3,
        lastIndexedAt: 13,
        itemId: 'file:1'
      })
      const deletedRecords = `[${expectedRecord}]`
      await searchClient!.execute({
        sql: `INSERT INTO search_index_pending_commits(commit_id,source_id,deleted_records,removed_indexed_items)
          VALUES ('commit-a','provider-a',?,1),('commit-b','provider-b',?,1)`,
        args: [deletedRecords, deletedRecords]
      })
      await searchClient!.execute(
        "DELETE FROM search_index_pending_commits WHERE source_id = 'provider-a' AND commit_id = 'commit-a'"
      )
      expect(
        (
          await searchClient!.execute(
            'SELECT commit_id,source_id,deleted_records,removed_indexed_items FROM search_index_pending_commits'
          )
        ).rows
      ).toEqual([
        {
          commit_id: 'commit-b',
          source_id: 'provider-b',
          deleted_records: deletedRecords,
          removed_indexed_items: 1
        }
      ])
      await searchClient!.execute({
        sql: `INSERT INTO search_index_file_maintenance(task_id,source_id,reason,file_path,expected_record,cursor)
          VALUES ('work-a','provider-a','missing-root','/root',NULL,64),
                 ('work-b','provider-b','stale-file','/root/a.txt',?,7)`,
        args: [expectedRecord]
      })
      await searchClient!.execute(
        "UPDATE search_index_file_maintenance SET cursor = 65 WHERE source_id = 'provider-a' AND task_id = 'work-a'"
      )
      expect(
        (
          await searchClient!.execute(
            'SELECT task_id,source_id,cursor,expected_record FROM search_index_file_maintenance ORDER BY task_id'
          )
        ).rows
      ).toEqual([
        { task_id: 'work-a', source_id: 'provider-a', cursor: 65, expected_record: null },
        { task_id: 'work-b', source_id: 'provider-b', cursor: 7, expected_record: expectedRecord }
      ])
    } finally {
      searchClient?.close()
    }
  }, 60_000)

  it('fails search init closed and falls back when the scan_progress fixup is blocked', async () => {
    // Pre-migrate the search file, then poison scan_progress with a blank
    // path row so the source-scope plan reports 'blocked'.
    const searchDbPath = join(dir, 'search-index.db')
    const seedClient = createClient({ url: `file:${searchDbPath}` })
    const testDir = dirname(fileURLToPath(import.meta.url))
    const migrationsFolder = resolve(testDir, '../../../../resources/db/migrations')
    await migrate(drizzle(seedClient), { migrationsFolder })
    await seedClient.execute("INSERT INTO scan_progress (path, last_scanned) VALUES ('', 1)")
    seedClient.close()

    const module = new DatabaseModule()
    const internals = moduleInternals(module)

    await internals.initSearchDatabase(dir)

    // Fixup failure must follow the existing fallback: no split, primary
    // topology preserved (this is exactly the flag-off behavior).
    expect(internals.searchInitialized).toBe(false)
    expect(internals.searchClient).toBeNull()
    expect(internals.searchDbPath).toBe('')
    expect(dbLogMock.warn).toHaveBeenCalledWith(
      'scan_progress source-scope migration blocked on search database',
      expect.objectContaining({
        meta: expect.objectContaining({
          blockers: expect.arrayContaining(['scan_progress blank path rows'])
        })
      })
    )
    expect(dbLogMock.warn).toHaveBeenCalledWith(
      'Search index database initialization failed; falling back to primary DB',
      expect.objectContaining({ error: expect.anything() })
    )
  }, 60_000)
})

describe('initSearchDatabase size cap', () => {
  let dir = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    dir = await mkdtemp(join(tmpdir(), 'tuff-search-size-cap-'))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(dir, { recursive: true, force: true })
  })

  it('deletes an oversized index before opening it and caps the connection to the fresh one', async () => {
    const dbPath = join(dir, 'search-index.db')
    // Sparse: stat reports 9 GiB without a single block written.
    const handle = await open(dbPath, 'w')
    await handle.truncate(9 * 1024 ** 3)
    await handle.close()
    await writeFile(`${dbPath}-wal`, 'stale')
    const report = vi.spyOn(operationalErrorService, 'report')

    const module = new DatabaseModule()
    const internals = moduleInternals(module)
    await internals.initSearchDatabase(dir)
    try {
      const storage = await module.getSearchIndexStorage()
      expect(storage.resetFromBytes).toBe(9 * 1024 ** 3)
      expect(storage.fileBytes).toBeLessThan(storage.maxBytes)
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SEARCH_INDEX_SIZE_CAP_RESET' })
      )

      const client = internals.searchClient!
      const pageSize = Number(
        (await client.execute('PRAGMA page_size')).rows[0]?.page_size as number
      )
      const maxPages = Number(
        (await client.execute('PRAGMA max_page_count')).rows[0]?.max_page_count as number
      )
      expect(maxPages * pageSize).toBeLessThanOrEqual(storage.maxBytes)
      expect(await hasProviderIdColumn(client)).toBe(true)
    } finally {
      internals.searchClient?.close()
    }
  })

  it('creates a fresh index in incremental auto-vacuum, so freed pages can go back to the disk', async () => {
    const module = new DatabaseModule()
    const internals = moduleInternals(module)
    await internals.initSearchDatabase(dir)
    try {
      const client = internals.searchClient!
      // Set after WAL, the pragma would silently stay 0 (none) until a VACUUM.
      expect(Number((await client.execute('PRAGMA auto_vacuum')).rows[0]?.auto_vacuum)).toBe(2)
    } finally {
      internals.searchClient?.close()
    }
  })

  it('rebuilds an index too full for a pending migration instead of falling back to the primary', async () => {
    // An index at its cap on the schema before keyword postings: upgrading needs pages for the
    // new table and index, and there are none.
    const dbPath = join(dir, 'search-index.db')
    const testDir = dirname(fileURLToPath(import.meta.url))
    const previous = join(dir, 'migrations-previous')
    await cp(resolve(testDir, '../../../../resources/db/migrations'), previous, { recursive: true })
    const journalPath = join(previous, 'meta', '_journal.json')
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    journal.entries = journal.entries.filter(
      (entry) => entry.tag < '0055_search_keyword_postings'
    )
    await writeFile(journalPath, JSON.stringify(journal))
    const seed = createClient({ url: `file:${dbPath}` })
    await migrate(drizzle(seed), { migrationsFolder: previous })
    await seed.execute(`INSERT INTO search_index_meta (provider_id, item_id, keyword_hash)
      WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 4000)
      SELECT 'filler', printf('filler-item-%080d', i), 'h' FROM n`)
    const pageSize = Number((await seed.execute('PRAGMA page_size')).rows[0]?.page_size)
    const pageCount = Number((await seed.execute('PRAGMA page_count')).rows[0]?.page_count)
    seed.close()
    capOverride.bytes = pageCount * pageSize
    const report = vi.spyOn(operationalErrorService, 'report')

    const module = new DatabaseModule()
    const internals = moduleInternals(module)
    try {
      await internals.initSearchDatabase(dir)
      expect(internals.searchInitialized).toBe(true)
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SEARCH_INDEX_SETUP_STORAGE_FULL' })
      )
      const client = internals.searchClient!
      expect(
        (await client.execute("SELECT 1 FROM search_index_meta WHERE provider_id = 'filler'")).rows
      ).toEqual([])
      expect(
        (
          await client.execute(
            "SELECT 1 FROM pragma_table_info('search_index_meta') WHERE name = 'doc_id'"
          )
        ).rows
      ).toHaveLength(1)
      expect(
        (
          await client.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'search_keyword_postings'"
          )
        ).rows
      ).toHaveLength(1)
      const maxPages = Number(
        (await client.execute('PRAGMA max_page_count')).rows[0]?.max_page_count
      )
      expect(maxPages).toBe(pageCount)
      expect(dbLogMock.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('falling back to primary DB'),
        expect.anything()
      )
    } finally {
      capOverride.bytes = null
      internals.searchClient?.close()
    }
  }, 60_000)

  async function scalar(client: Client, query: string): Promise<number> {
    return Number((await client.execute(query)).rows[0]?.[0])
  }

  function openWriter(client: Client): SearchIndexService {
    return new SearchIndexService(drizzle(client) as never, {
      directMode: true,
      initializationMode: 'writer'
    })
  }

  const POSTED_KEYWORDS = `SELECT m.provider_id, m.item_id, p.keyword, p.priority
    FROM search_keyword_postings p JOIN search_index_meta m ON m.doc_id = p.doc_id
    ORDER BY m.provider_id, m.item_id, p.keyword`

  /**
   * An index as a build before keyword postings leaves it, compacted to no free page: file
   * documents whose keyword rows sit in `keyword_mappings`, stored in `order`. Made by this build,
   * then migration 0055 undone by hand — a later migration of these tables needs undoing here too.
   * Returns the keyword rows the postings held.
   */
  async function seedBeforeKeywordPostings(seedDir: string, order: string) {
    const module = moduleInternals(new DatabaseModule())
    await module.initSearchDatabase(seedDir)
    const client = module.searchClient!
    try {
      const writer = openWriter(client)
      await writer.warmup()
      for (let start = 0; start < 300; start += 100) {
        await writer.indexItems(
          Array.from({ length: 100 }, (_, offset) => {
            const index = start + offset
            const path = `/Users/someone/Projects/app-${index % 17}/src/feature-${index % 53}`
            const name = `component-${index}-${(index * 7919) % 10007}.ts`
            return {
              providerId: 'file-provider',
              itemId: `${path}/${name}`,
              type: 'file',
              name,
              path
            }
          })
        )
      }
      const keywords = (await client.execute(POSTED_KEYWORDS)).rows
      await client.execute(`INSERT INTO keyword_mappings (provider_id, keyword, item_id, priority)
        SELECT p.provider_id, p.keyword, m.item_id, p.priority
        FROM search_keyword_postings p JOIN search_index_meta m ON m.doc_id = p.doc_id
        ORDER BY ${order}`)
      await client.execute('DROP TABLE search_keyword_postings')
      await client.execute('DROP INDEX idx_search_index_meta_doc_id')
      await client.execute('ALTER TABLE search_index_meta DROP COLUMN doc_id')
      const testDir = dirname(fileURLToPath(import.meta.url))
      const journal = JSON.parse(
        await readFile(
          resolve(testDir, '../../../../resources/db/migrations/meta/_journal.json'),
          'utf8'
        )
      ) as { entries: Array<{ tag: string; when: number }> }
      const migration = journal.entries.find(
        (entry) => entry.tag === '0055_search_keyword_postings'
      )
      // Every later journal row must be undone too, or the migrator skips 0055 on reopen.
      await client.execute('DROP TABLE ai_orchestrator_run_messages')
      const undone = await client.execute({
        sql: 'DELETE FROM __drizzle_migrations WHERE created_at >= ?',
        args: [migration!.when]
      })
      expect(undone.rowsAffected).toBe(
        journal.entries.filter((entry) => entry.when >= migration!.when).length
      )
      await client.execute('VACUUM')
      await client.execute('PRAGMA wal_checkpoint(TRUNCATE)')
      return {
        keywords,
        pageSize: await scalar(client, 'PRAGMA page_size'),
        pageCount: await scalar(client, 'PRAGMA page_count')
      }
    } finally {
      client.close()
    }
  }

  it.each([
    ['grouped by document', 'm.item_id, p.keyword'],
    ['grouped by keyword', 'p.keyword, m.item_id'],
    ['grouped by neither', 'substr(p.keyword, -2), m.item_id']
  ])(
    'upgrades an index at its cap and moves its legacy keyword rows, %s',
    async (_layout, order) => {
      const seedDir = join(dir, 'seed')
      await mkdir(seedDir)
      const seed = await seedBeforeKeywordPostings(seedDir, order)
      const report = vi.spyOn(operationalErrorService, 'report')
      // The tightest cap the upgrade passes leaves no free page. There the writer must still
      // start: one that cannot fails every write, the deletes that could free a page included,
      // and as setup let the index through, nothing would rebuild it.
      for (let headroom = 0; headroom <= 8; headroom += 1) {
        const caseDir = join(dir, `headroom-${headroom}`)
        await mkdir(caseDir)
        await copyFile(join(seedDir, 'search-index.db'), join(caseDir, 'search-index.db'))
        capOverride.bytes = (seed.pageCount + headroom) * seed.pageSize
        report.mockClear()
        const module = moduleInternals(new DatabaseModule())
        try {
          await module.initSearchDatabase(caseDir)
          const rebuilt = report.mock.calls.some(
            ([event]) => event.code === 'SEARCH_INDEX_SETUP_STORAGE_FULL'
          )
          if (rebuilt) continue
          const client = module.searchClient!
          expect(await scalar(client, 'PRAGMA freelist_count')).toBe(0)
          expect(await scalar(client, 'PRAGMA page_count')).toBe(
            await scalar(client, 'PRAGMA max_page_count')
          )
          const writer = openWriter(client)
          await writer.warmup()
          let done = false
          for (let slice = 0; slice < 400 && !done; slice += 1) {
            const result = await writer.runIndexMaintenanceSlice('file-provider', 64)
            for (const notification of result.notifications)
              await writer.acknowledgeIndexMaintenanceCommit(notification)
            done = result.done && result.notifications.length === 0
          }
          expect(done).toBe(true)
          expect(await scalar(client, 'SELECT count(*) FROM keyword_mappings')).toBe(0)
          expect((await client.execute(POSTED_KEYWORDS)).rows).toEqual(seed.keywords)
          return
        } finally {
          capOverride.bytes = null
          module.searchClient?.close()
        }
      }
      throw new Error('no cap up to eight pages over the index let the upgrade through')
    },
    60_000
  )

  it('refuses new files before the pages deletions need, which scattered deletions then get', async () => {
    // Deleting files whose rows lie far apart frees no whole page, so at the cap a deletion needs
    // pages of its own; with none left, these batches fail and the files stay in the index.
    capOverride.bytes = 2_000 * 4096
    const module = moduleInternals(new DatabaseModule())
    try {
      await module.initSearchDatabase(dir)
      const client = module.searchClient!
      expect(await scalar(client, 'PRAGMA max_page_count')).toBe(2_000)
      const writer = openWriter(client)
      await writer.warmup()
      const file = (index: number, mtimeSeconds: number) => {
        const directory = `/Users/someone/Projects/app-${index % 17}/src/feature-${index % 53}`
        const name = `component-${index}-${(index * 7919) % 10007}.ts`
        const record: UpsertFileRecord = {
          path: `${directory}/${name}`,
          name,
          extension: '.ts',
          size: 1_000 + index,
          mtime: new Date(mtimeSeconds * 1000),
          ctime: new Date(mtimeSeconds * 1000),
          lastIndexedAt: new Date(mtimeSeconds * 1000),
          isDir: false,
          type: 'file'
        }
        return {
          record,
          item: {
            providerId: 'file-provider',
            itemId: record.path,
            type: 'file' as const,
            name,
            path: directory
          }
        }
      }
      const persist = async (indexes: number[], mtimeSeconds: number) => {
        const files = indexes.map((index) => file(index, mtimeSeconds))
        await writer.persistAndApplyProviderItems(
          files.map(({ record }) => record),
          'file-provider',
          files.map(({ item }) => item)
        )
      }

      let next = 0
      let refusal: unknown = null
      for (const batch of [10, 1]) {
        refusal = null
        while (refusal === null) {
          const indexes = Array.from({ length: batch }, (_, offset) => next + offset)
          try {
            await persist(indexes, 1_700_000_000)
            next += batch
          } catch (error) {
            refusal = error
          }
        }
      }
      expect(isSqliteStorageFullError(refusal)).toBe(true)
      expect(String((refusal as Error).message)).toContain(SEARCH_INDEX_RESERVE_REACHED)
      const live = await scalar(
        client,
        'SELECT (SELECT page_count FROM pragma_page_count()) - (SELECT freelist_count FROM pragma_freelist_count())'
      )
      expect(2_000 - live).toBeLessThanOrEqual(resolveSearchIndexReservePages(2_000))

      // Indexed files still update.
      await persist([0, 1, 2], 1_700_000_100)
      expect(
        await scalar(
          client,
          "SELECT count(*) FROM files WHERE mtime = 1700000100 AND type = 'file'"
        )
      ).toBe(3)

      const rows = await client.execute(
        "SELECT id, path, mtime, ctime, size, last_indexed_at AS lastIndexedAt FROM files WHERE type = 'file' ORDER BY id"
      )
      const victims = rows.rows
        .filter((_, position) => position % 7 === 3)
        .map((row) => ({
          id: Number(row.id),
          path: String(row.path),
          itemId: String(row.path),
          mtime: Number(row.mtime),
          ctime: Number(row.ctime),
          size: row.size === null ? null : Number(row.size),
          lastIndexedAt: Number(row.lastIndexedAt)
        }))
      expect(victims.length).toBeGreaterThan(128)
      const db = drizzle(client)
      for (let start = 0; start < victims.length; start += 64) {
        const result = await db.transaction(
          async (tx) =>
            await removeFileRecordsInTransaction(
              tx as never,
              writer,
              'file-provider',
              victims.slice(start, start + 64)
            ),
          { behavior: 'immediate' }
        )
        if (result.commitId)
          await acknowledgeFileDeletionCommitsInHome(db as never, 'file-provider', [
            result.commitId
          ])
      }
      expect(await scalar(client, "SELECT count(*) FROM files WHERE type = 'file'")).toBe(
        next - victims.length
      )
      expect(
        await scalar(
          client,
          "SELECT count(*) FROM search_index_meta WHERE provider_id = 'file-provider'"
        )
      ).toBe(next - victims.length)
    } finally {
      capOverride.bytes = null
      module.searchClient?.close()
    }
  }, 120_000)

  it('keeps an index within the cap', async () => {
    const first = new DatabaseModule()
    await moduleInternals(first).initSearchDatabase(dir)
    await moduleInternals(first).searchClient!.execute(
      "INSERT INTO search_index_meta (provider_id, item_id, keyword_hash) VALUES ('p', 'kept', 'h')"
    )
    moduleInternals(first).searchClient!.close()

    const second = new DatabaseModule()
    await moduleInternals(second).initSearchDatabase(dir)
    try {
      expect((await second.getSearchIndexStorage()).resetFromBytes).toBeNull()
      const kept = await moduleInternals(second).searchClient!.execute(
        "SELECT item_id FROM search_index_meta WHERE item_id = 'kept'"
      )
      expect(kept.rows).toHaveLength(1)
    } finally {
      moduleInternals(second).searchClient?.close()
    }
  })
})
