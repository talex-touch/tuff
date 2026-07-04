import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditSearchIndexProductionMigrationReadiness } from './search-index-production-migration-readiness'

const repoRoot = path.resolve(__dirname, '../../..')
const scriptPath = path.join(__dirname, 'search-index-production-migration-readiness.ts')

function writeFixtureFile(filePath: string, content: string): string {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

function writeJournal(migrationsDir: string, tags: string[]): string {
  return writeFixtureFile(
    path.join(migrationsDir, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'sqlite',
      entries: tags.map((tag, idx) => ({ idx, version: '7', when: 1, tag, breakpoints: true }))
    })
  )
}

function writeCurrentLikeFixture(root: string): {
  schemaPath: string
  migrationsDir: string
  journalPath: string
  searchIndexServicePath: string
} {
  const schemaPath = writeFixtureFile(
    path.join(root, 'src/main/db/schema.ts'),
    `
      import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
      export const scanProgress = sqliteTable('scan_progress', {
        path: text('path').primaryKey(),
        lastScanned: integer('last_scanned').notNull()
      })
      export const indexedSourceTaskState = sqliteTable('indexed_source_task_state', {
        sourceId: text('source_id').primaryKey(),
        stateJson: text('state_json').notNull(),
        updatedAt: integer('updated_at').notNull()
      })
    `
  )
  const migrationsDir = path.join(root, 'resources/db/migrations')
  writeFixtureFile(
    path.join(migrationsDir, '0000_init.sql'),
    'CREATE TABLE `scan_progress` (`path` text PRIMARY KEY NOT NULL, `last_scanned` integer NOT NULL);'
  )
  writeFixtureFile(
    path.join(migrationsDir, '0021_search_index_meta.sql'),
    'CREATE TABLE `search_index_meta` (`provider_id` text NOT NULL, `item_id` text NOT NULL, `keyword_hash` text NOT NULL, `updated_at` integer NOT NULL, PRIMARY KEY(`provider_id`, `item_id`));'
  )
  const journalPath = writeJournal(migrationsDir, ['0000_init', '0021_search_index_meta'])
  const searchIndexServicePath = writeFixtureFile(
    path.join(root, 'src/main/modules/box-tool/search-engine/search-index-service.ts'),
    `
      await this.db.run(sql\`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(provider, item_id)\`)
      await this.db.run(sql\`CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(path)\`)
    `
  )

  return { schemaPath, migrationsDir, journalPath, searchIndexServicePath }
}

function writeReadyFixture(root: string): {
  schemaPath: string
  migrationsDir: string
  journalPath: string
  searchIndexServicePath: string
} {
  const schemaPath = writeFixtureFile(
    path.join(root, 'src/main/db/schema.ts'),
    `
      import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core'
      export const scanProgress = sqliteTable(
        'scan_progress',
        {
          sourceId: text('source_id').notNull(),
          path: text('path').notNull(),
          lastScanned: integer('last_scanned').notNull()
        },
        (table) => ({ pk: primaryKey({ columns: [table.sourceId, table.path] }) })
      )
      export const indexedSourceTaskState = sqliteTable(
        'indexed_source_task_state',
        {
          sourceId: text('source_id').primaryKey(),
          stateJson: text('state_json').notNull(),
          updatedAt: integer('updated_at').notNull()
        },
        (table) => ({ updatedIdx: index('idx_indexed_source_task_state_updated_at').on(table.updatedAt) })
      )
    `
  )
  const migrationsDir = path.join(root, 'resources/db/migrations')
  writeFixtureFile(
    path.join(migrationsDir, '0024_search_index_runtime_store.sql'),
    `
      CREATE TABLE "scan_progress" (
        "source_id" text NOT NULL,
        "path" text NOT NULL,
        "last_scanned" integer NOT NULL,
        PRIMARY KEY("source_id", "path")
      );
      CREATE TABLE "indexed_source_task_state" (
        "source_id" text PRIMARY KEY NOT NULL,
        "state_json" text NOT NULL,
        "updated_at" integer NOT NULL
      );
      CREATE TABLE "search_index_meta" (
        "provider_id" text NOT NULL,
        "item_id" text NOT NULL,
        "keyword_hash" text NOT NULL,
        "updated_at" integer NOT NULL,
        PRIMARY KEY("provider_id", "item_id")
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS "search_index" USING fts5(provider, item_id, title);
    `
  )
  const journalPath = writeJournal(migrationsDir, ['0024_search_index_runtime_store'])
  const searchIndexServicePath = writeFixtureFile(
    path.join(root, 'src/main/modules/box-tool/search-engine/search-index-service.ts'),
    'export class SearchIndexService {}'
  )

  return { schemaPath, migrationsDir, journalPath, searchIndexServicePath }
}

describe('search index production migration readiness', () => {
  it('reports blockers for the current path-only/runtime-created shape', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-prod-migration-current-'))
    try {
      const report = auditSearchIndexProductionMigrationReadiness(writeCurrentLikeFixture(dir))

      expect(report.destructiveActions).toBe(false)
      expect(report.mode).toBe('source-read-only')
      expect(report.readiness.status).toBe('blocked')
      expect(report.checks.scanProgressSchema.status).toBe('path-only')
      expect(report.checks.searchIndexMetaMigration.status).toBe('present')
      expect(report.checks.indexedSourceTaskStateMigration.status).toBe('missing')
      expect(report.checks.ftsDurableOwnership.status).toBe('runtime-created')
      expect(report.readiness.blockers).toEqual(
        expect.arrayContaining([
          'schema.scan_progress_source_scope_missing',
          'migration.scan_progress_source_scope_missing',
          'migration.indexed_source_task_state_missing',
          'migration.search_index_fts_durable_missing'
        ])
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when schema and resource migrations own the durable runtime tables', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-prod-migration-ready-'))
    try {
      const report = auditSearchIndexProductionMigrationReadiness(writeReadyFixture(dir))

      expect(report.readiness.status).toBe('ready')
      expect(report.readiness.blockers).toEqual([])
      expect(report.checks.scanProgressSchema.status).toBe('source-scoped')
      expect(report.checks.scanProgressSourceScopeMigration.status).toBe('present')
      expect(report.checks.indexedSourceTaskStateMigration.status).toBe('present')
      expect(report.checks.ftsDurableOwnership.status).toBe('migration-present')
      expect(report.checks.legacyFileFtsMigrationPolicy.status).toBe('retained')
      expect(report.migrationJournal).toMatchObject({
        exists: true,
        latestTag: '0024_search_index_runtime_store',
        journalEntriesWithoutSql: [],
        sqlFilesWithoutJournalEntry: []
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('blocks readiness when the Drizzle migration journal is missing', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-prod-migration-no-journal-'))
    try {
      const fixture = writeReadyFixture(dir)
      rmSync(fixture.journalPath, { force: true })

      const report = auditSearchIndexProductionMigrationReadiness(fixture)

      expect(report.readiness.status).toBe('blocked')
      expect(report.migrationJournal).toMatchObject({
        exists: false,
        entries: [],
        sqlFiles: ['0024_search_index_runtime_store.sql'],
        journalEntriesWithoutSql: [],
        sqlFilesWithoutJournalEntry: ['0024_search_index_runtime_store']
      })
      expect(report.readiness.blockers).toContain('migration.journal_missing')
      expect(report.readiness.blockers).toContain('migration.sql_files_without_journal_entry')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('blocks readiness when the Drizzle migration journal references a missing SQL file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-prod-migration-missing-sql-'))
    try {
      const fixture = writeReadyFixture(dir)
      writeJournal(fixture.migrationsDir, [
        '0024_search_index_runtime_store',
        '0025_scan_progress_source_scope'
      ])

      const report = auditSearchIndexProductionMigrationReadiness(fixture)

      expect(report.readiness.status).toBe('blocked')
      expect(report.migrationJournal.journalEntriesWithoutSql).toEqual([
        '0025_scan_progress_source_scope'
      ])
      expect(report.migrationJournal.sqlFilesWithoutJournalEntry).toEqual([])
      expect(report.readiness.blockers).toContain('migration.journal_entries_without_sql')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('blocks readiness when a migration SQL file is missing from the Drizzle journal', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-prod-migration-untracked-sql-'))
    try {
      const fixture = writeReadyFixture(dir)
      writeFixtureFile(
        path.join(fixture.migrationsDir, '0025_scan_progress_source_scope.sql'),
        'CREATE TABLE "scan_progress_shadow" ("source_id" text NOT NULL);'
      )

      const report = auditSearchIndexProductionMigrationReadiness(fixture)

      expect(report.readiness.status).toBe('blocked')
      expect(report.migrationJournal.journalEntriesWithoutSql).toEqual([])
      expect(report.migrationJournal.sqlFilesWithoutJournalEntry).toEqual([
        '0025_scan_progress_source_scope'
      ])
      expect(report.readiness.blockers).toContain('migration.sql_files_without_journal_entry')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('blocks R3 readiness when resource migrations touch legacy file_fts', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-prod-migration-file-fts-'))
    try {
      const fixture = writeReadyFixture(dir)
      writeFixtureFile(
        path.join(fixture.migrationsDir, '0025_drop_legacy_file_fts.sql'),
        'DROP TABLE IF EXISTS file_fts;'
      )
      writeJournal(fixture.migrationsDir, [
        '0024_search_index_runtime_store',
        '0025_drop_legacy_file_fts'
      ])

      const report = auditSearchIndexProductionMigrationReadiness(fixture)

      expect(report.readiness.status).toBe('blocked')
      expect(report.checks.legacyFileFtsMigrationPolicy).toMatchObject({
        status: 'blocked',
        files: [{ file: '0025_drop_legacy_file_fts.sql', inJournal: true }]
      })
      expect(report.readiness.blockers).toContain('migration.legacy_file_fts_touched')
      expect(report.readiness.actions).toContain(
        'Remove file_fts migration changes from R3 or move them to a separate high-risk migration batch.'
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes a source-read-only report from the CLI', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'search-index-prod-migration-cli-'))
    try {
      const fixture = writeCurrentLikeFixture(dir)
      const outputPath = path.join(dir, 'evidence', 'readiness.json')
      const stdout = execFileSync(
        'corepack',
        [
          'pnpm',
          'exec',
          'tsx',
          scriptPath,
          '--schema',
          fixture.schemaPath,
          '--migrationsDir',
          fixture.migrationsDir,
          '--journal',
          fixture.journalPath,
          '--searchIndexService',
          fixture.searchIndexServicePath,
          '--output',
          outputPath,
          '--compact'
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )

      const stdoutReport = JSON.parse(stdout)
      const fileReport = JSON.parse(readFileSync(outputPath, 'utf8'))
      expect(fileReport).toEqual(stdoutReport)
      expect(fileReport.kind).toBe('search-index-production-migration-readiness')
      expect(fileReport.readiness.status).toBe('blocked')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
