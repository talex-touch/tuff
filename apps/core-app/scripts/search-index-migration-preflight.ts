#!/usr/bin/env tsx
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { createClient, type Client } from '@libsql/client'
import {
  buildSearchIndexMigrationPreflightReport,
  type SearchIndexMigrationPreflightSnapshot,
  type SearchIndexMigrationTableColumn,
  type SearchIndexMigrationTableSnapshot
} from '../src/main/modules/box-tool/search-engine/search-index-migration-preflight'

interface CliOptions {
  db?: string
  output?: string
  sourceId: string
  pretty: boolean
}

interface SqliteRow {
  [key: string]: unknown
}

const TABLE_NAMES = {
  files: 'files',
  fileExtensions: 'file_extensions',
  fileIndexProgress: 'file_index_progress',
  scanProgress: 'scan_progress',
  fileFts: 'file_fts',
  searchIndex: 'search_index',
  searchIndexMeta: 'search_index_meta',
  keywordMappings: 'keyword_mappings',
  indexedSourceTaskState: 'indexed_source_task_state'
} as const

const SEARCH_INDEX_SHADOW_TABLES = [
  'search_index_data',
  'search_index_idx',
  'search_index_content',
  'search_index_docsize',
  'search_index_config'
]

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:index-migration:preflight -- --db <sqlite.db> [options]

Options:
  --db <path>          SQLite database path to inspect. Required.
  --sourceId <id>      Source/provider id to inspect. Default: file-provider.
  --output <file>      Write the JSON report to a file in addition to stdout.
  --compact            Print single-line JSON.
  --help               Show this help.

This command is read-only. It does not run migrations or modify SQLite data.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    sourceId: 'file-provider',
    pretty: true
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--db' && argv[index + 1]) {
      options.db = argv[++index]
      continue
    }
    if (arg === '--sourceId' && argv[index + 1]) {
      options.sourceId = argv[++index]
      continue
    }
    if (arg === '--output' && argv[index + 1]) {
      options.output = argv[++index]
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.db) {
    throw new Error('Missing required --db <sqlite.db>')
  }
  return options
}

function toCount(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

async function queryRows(client: Client, sql: string, args?: unknown[]): Promise<SqliteRow[]> {
  const result = await client.execute(args ? { sql, args } : sql)
  return result.rows as SqliteRow[]
}

async function tableExists(client: Client, tableName: string): Promise<boolean> {
  const rows = await queryRows(
    client,
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ? LIMIT 1",
    [tableName]
  )
  return rows.length > 0
}

async function getTableColumns(
  client: Client,
  tableName: string
): Promise<SearchIndexMigrationTableColumn[]> {
  const rows = await queryRows(client, `PRAGMA table_info(${JSON.stringify(tableName)})`)
  return rows.map((row) => ({
    name: toStringValue(row.name),
    type: typeof row.type === 'string' ? row.type : undefined,
    notNull: Boolean(row.notnull),
    primaryKeyOrder: toCount(row.pk)
  }))
}

async function countRows(client: Client, tableName: string): Promise<number> {
  const rows = await queryRows(client, `SELECT count(*) AS count FROM "${tableName}"`)
  return toCount(rows[0]?.count)
}

async function readTableSnapshot(
  client: Client,
  tableName: string
): Promise<SearchIndexMigrationTableSnapshot> {
  const exists = await tableExists(client, tableName)
  if (!exists) return { exists: false }
  return {
    exists: true,
    rowCount: await countRows(client, tableName),
    columns: await getTableColumns(client, tableName)
  }
}

function primaryKeyColumns(table: SearchIndexMigrationTableSnapshot): string[] {
  return (table.columns ?? [])
    .filter((column) => (column.primaryKeyOrder ?? 0) > 0)
    .sort((left, right) => (left.primaryKeyOrder ?? 0) - (right.primaryKeyOrder ?? 0))
    .map((column) => column.name)
}

function hasColumn(table: SearchIndexMigrationTableSnapshot, columnName: string): boolean {
  return table.columns?.some((column) => column.name === columnName) ?? false
}

async function safeCount(client: Client, sql: string, args?: unknown[]): Promise<number> {
  const rows = await queryRows(client, sql, args)
  return toCount(rows[0]?.count)
}

async function countByProvider(
  client: Client,
  tableName: string,
  providerColumn: string
): Promise<Array<{ providerId: string; rows: number }>> {
  if (!(await tableExists(client, tableName))) return []
  const rows = await queryRows(
    client,
    `SELECT COALESCE(${providerColumn}, '') AS providerId, count(*) AS rows FROM "${tableName}" GROUP BY ${providerColumn} ORDER BY rows DESC, providerId ASC`
  )
  return rows.map((row) => ({
    providerId: toStringValue(row.providerId),
    rows: toCount(row.rows)
  }))
}

async function buildSnapshot(
  client: Client,
  sourceId: string
): Promise<SearchIndexMigrationPreflightSnapshot> {
  const tables = {
    files: await readTableSnapshot(client, TABLE_NAMES.files),
    fileExtensions: await readTableSnapshot(client, TABLE_NAMES.fileExtensions),
    fileIndexProgress: await readTableSnapshot(client, TABLE_NAMES.fileIndexProgress),
    scanProgress: await readTableSnapshot(client, TABLE_NAMES.scanProgress),
    fileFts: await readTableSnapshot(client, TABLE_NAMES.fileFts),
    searchIndex: await readTableSnapshot(client, TABLE_NAMES.searchIndex),
    searchIndexMeta: await readTableSnapshot(client, TABLE_NAMES.searchIndexMeta),
    keywordMappings: await readTableSnapshot(client, TABLE_NAMES.keywordMappings),
    indexedSourceTaskState: await readTableSnapshot(client, TABLE_NAMES.indexedSourceTaskState)
  }

  const scanProgressSourceIdColumn = hasColumn(tables.scanProgress, 'source_id')
  const scanProgressBlankPathRows = tables.scanProgress.exists
    ? await safeCount(
        client,
        "SELECT count(*) AS count FROM scan_progress WHERE trim(COALESCE(path, '')) = ''"
      )
    : 0
  const scanProgressInvalidTimestampRows = tables.scanProgress.exists
    ? await safeCount(
        client,
        'SELECT count(*) AS count FROM scan_progress WHERE last_scanned IS NULL OR last_scanned < 0'
      )
    : 0
  const duplicateSourcePathRows =
    tables.scanProgress.exists && scanProgressSourceIdColumn
      ? await safeCount(
          client,
          `SELECT count(*) AS count FROM (
            SELECT source_id, path
            FROM scan_progress
            GROUP BY source_id, path
            HAVING count(*) > 1
          )`
        )
      : null
  const sharedPathAcrossSourcesRows =
    tables.scanProgress.exists && scanProgressSourceIdColumn
      ? await safeCount(
          client,
          `SELECT count(*) AS count FROM (
            SELECT path
            FROM scan_progress
            GROUP BY path
            HAVING count(DISTINCT source_id) > 1
          )`
        )
      : null

  const searchIndexShadowTables: Record<string, boolean> = {}
  for (const tableName of SEARCH_INDEX_SHADOW_TABLES) {
    searchIndexShadowTables[tableName] = await tableExists(client, tableName)
  }

  const hasSearchIndex = tables.searchIndex.exists
  const hasKeywordMappings = tables.keywordMappings.exists
  const hasSearchIndexMeta = tables.searchIndexMeta.exists
  const sourceIndexedRows = hasSearchIndex
    ? await safeCount(client, 'SELECT count(*) AS count FROM search_index WHERE provider = ?', [
        sourceId
      ])
    : 0
  const sourceKeywordRows = hasKeywordMappings
    ? await safeCount(
        client,
        'SELECT count(*) AS count FROM keyword_mappings WHERE provider_id = ?',
        [sourceId]
      )
    : 0
  const sourceMetaRows = hasSearchIndexMeta
    ? await safeCount(
        client,
        'SELECT count(*) AS count FROM search_index_meta WHERE provider_id = ?',
        [sourceId]
      )
    : 0

  return {
    generatedAt: new Date().toISOString(),
    sourceId,
    tables,
    scanProgress: {
      sourceIdColumn: scanProgressSourceIdColumn,
      primaryKeyColumns: primaryKeyColumns(tables.scanProgress),
      blankPathRows: scanProgressBlankPathRows,
      invalidTimestampRows: scanProgressInvalidTimestampRows,
      duplicateSourcePathRows,
      sharedPathAcrossSourcesRows
    },
    ftsOwnership: {
      searchIndexShadowTables,
      searchIndexByProvider: await countByProvider(client, 'search_index', 'provider'),
      keywordMappingsByProvider: await countByProvider(client, 'keyword_mappings', 'provider_id'),
      searchIndexMetaByProvider: await countByProvider(client, 'search_index_meta', 'provider_id'),
      sourceIndexedRows,
      sourceKeywordRows,
      sourceMetaRows,
      filesRows: tables.files.rowCount ?? 0,
      fileFtsRows: tables.fileFts.exists ? (tables.fileFts.rowCount ?? 0) : null,
      orphanKeywordRows:
        hasKeywordMappings && hasSearchIndex
          ? await safeCount(
              client,
              `SELECT count(*) AS count
               FROM keyword_mappings km
               WHERE km.provider_id = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM search_index si
                   WHERE si.provider = km.provider_id
                     AND si.item_id = km.item_id
                 )`,
              [sourceId]
            )
          : 0,
      orphanMetaRows:
        hasSearchIndexMeta && hasSearchIndex
          ? await safeCount(
              client,
              `SELECT count(*) AS count
               FROM search_index_meta sm
               WHERE sm.provider_id = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM search_index si
                   WHERE si.provider = sm.provider_id
                     AND si.item_id = sm.item_id
                 )`,
              [sourceId]
            )
          : 0,
      searchIndexRowsMissingMeta:
        hasSearchIndexMeta && hasSearchIndex
          ? await safeCount(
              client,
              `SELECT count(*) AS count
               FROM search_index si
               WHERE si.provider = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM search_index_meta sm
                   WHERE sm.provider_id = si.provider
                     AND sm.item_id = si.item_id
                 )`,
              [sourceId]
            )
          : 0,
      keywordRowsMissingMeta:
        hasKeywordMappings && hasSearchIndexMeta
          ? await safeCount(
              client,
              `SELECT count(*) AS count
               FROM keyword_mappings km
               WHERE km.provider_id = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM search_index_meta sm
                   WHERE sm.provider_id = km.provider_id
                     AND sm.item_id = km.item_id
                 )`,
              [sourceId]
            )
          : 0
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  const dbPath = options.db

  if (!dbPath) {
    throw new Error('Missing required --db <sqlite.db>')
  }
  if (!existsSync(dbPath)) {
    throw new Error(`SQLite database does not exist: ${dbPath}`)
  }

  const client = createClient({ url: `file:${dbPath}` })
  try {
    await client.execute('PRAGMA query_only = ON')
    const snapshot = await buildSnapshot(client, options.sourceId)
    const report = buildSearchIndexMigrationPreflightReport(snapshot)
    const serializedReport = JSON.stringify(report, null, options.pretty ? 2 : 0)

    if (options.output) {
      const outputPath = resolve(options.output)
      mkdirSync(dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, `${serializedReport}\n`, 'utf8')
    }

    console.log(serializedReport)

    if (!report.gate.passed) {
      process.exitCode = 1
    }
  } finally {
    client.close()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
