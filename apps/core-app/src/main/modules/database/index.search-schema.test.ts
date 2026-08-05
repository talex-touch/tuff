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
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { dbLogMock } = vi.hoisted(() => ({
  dbLogMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
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

// Force the split ON for initSearchDatabase (default is still off until the
// validated flip); keep every other runtime flag real.
vi.mock('../../db/runtime-flags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../db/runtime-flags')>()),
  DB_SEARCH_SPLIT_ENABLED: true
}))

import { DatabaseModule } from './index'

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

  it(
    'creates search-index.db with provider_id and source-scoped scan_progress',
    async () => {
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
      } finally {
        searchClient?.close()
      }
    },
    60_000
  )

  it(
    'fails search init closed and falls back when the scan_progress fixup is blocked',
    async () => {
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
    },
    60_000
  )
})
