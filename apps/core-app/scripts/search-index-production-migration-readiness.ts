#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

type ReadinessStatus = 'ready' | 'blocked'
type SchemaShape = 'missing' | 'path-only' | 'source-scoped' | 'unknown'
type MigrationStatus = 'present' | 'missing'
type FtsMigrationStatus = 'migration-present' | 'runtime-created' | 'missing'
type LegacyFileFtsMigrationPolicyStatus = 'retained' | 'blocked'

export interface ProductionMigrationReadinessOptions {
  schemaPath?: string
  migrationsDir?: string
  journalPath?: string
  searchIndexServicePath?: string
}

interface CliOptions extends ProductionMigrationReadinessOptions {
  output?: string
  pretty: boolean
}

export interface MigrationFileMatch {
  file: string
  inJournal: boolean
  evidence: string[]
}

export interface SchemaCheck {
  status: SchemaShape
  hasSourceId: boolean
  primaryKeyColumns: string[]
  evidence: string[]
}

export interface TableSchemaCheck {
  status: 'present' | 'missing'
  evidence: string[]
}

export interface MigrationCheck {
  status: MigrationStatus
  files: MigrationFileMatch[]
  evidence: string[]
}

export interface FtsOwnershipCheck {
  status: FtsMigrationStatus
  searchIndexMigrationFiles: MigrationFileMatch[]
  runtimeCreatesSearchIndex: boolean
  runtimeCreatesLegacyFileFts: boolean
  evidence: string[]
}

export interface LegacyFileFtsMigrationPolicyCheck {
  status: LegacyFileFtsMigrationPolicyStatus
  files: MigrationFileMatch[]
  evidence: string[]
}

export interface MigrationJournalSummary {
  exists: boolean
  latestTag: string | null
  entries: string[]
  sqlFiles: string[]
  journalEntriesWithoutSql: string[]
  sqlFilesWithoutJournalEntry: string[]
}

export interface SearchIndexProductionMigrationReadinessReport {
  kind: 'search-index-production-migration-readiness'
  generatedAt: string
  mode: 'source-read-only'
  destructiveActions: false
  inputs: {
    schemaPath: string
    migrationsDir: string
    journalPath: string
    searchIndexServicePath: string
  }
  migrationJournal: MigrationJournalSummary
  checks: {
    scanProgressSchema: SchemaCheck
    scanProgressSourceScopeMigration: MigrationCheck
    indexedSourceTaskStateSchema: TableSchemaCheck
    indexedSourceTaskStateMigration: MigrationCheck
    searchIndexMetaMigration: MigrationCheck
    ftsDurableOwnership: FtsOwnershipCheck
    legacyFileFtsMigrationPolicy: LegacyFileFtsMigrationPolicyCheck
  }
  readiness: {
    status: ReadinessStatus
    blockers: string[]
    actions: string[]
    verification: string[]
  }
}

interface JournalFile {
  entries?: Array<{ tag?: unknown }>
}

interface MigrationFile {
  name: string
  sql: string
  inJournal: boolean
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const defaultCoreAppRoot = resolve(scriptDir, '..')

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:production-migration-readiness -- [options]

Options:
  --schema <path>               Drizzle schema file. Default: src/main/db/schema.ts.
  --migrationsDir <path>        Resource migrations directory. Default: resources/db/migrations.
  --journal <path>              Drizzle migration journal. Default: <migrationsDir>/meta/_journal.json.
  --searchIndexService <path>   SearchIndexService source file. Default: src/main/modules/box-tool/search-engine/search-index-service.ts.
  --output <file>               Write JSON report to a file in addition to stdout.
  --compact                     Print single-line JSON.
  --help                        Show this help.

This command is source-read-only. It does not open SQLite, run migrations, rebuild FTS, or modify data.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = { pretty: true }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--schema' && argv[index + 1]) {
      options.schemaPath = argv[++index]
      continue
    }
    if (arg === '--migrationsDir' && argv[index + 1]) {
      options.migrationsDir = argv[++index]
      continue
    }
    if (arg === '--journal' && argv[index + 1]) {
      options.journalPath = argv[++index]
      continue
    }
    if (arg === '--searchIndexService' && argv[index + 1]) {
      options.searchIndexServicePath = argv[++index]
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

  return options
}

function resolveOptions(
  options: ProductionMigrationReadinessOptions
): Required<ProductionMigrationReadinessOptions> {
  const migrationsDir = resolve(
    options.migrationsDir ?? `${defaultCoreAppRoot}/resources/db/migrations`
  )
  return {
    schemaPath: resolve(options.schemaPath ?? `${defaultCoreAppRoot}/src/main/db/schema.ts`),
    migrationsDir,
    journalPath: resolve(options.journalPath ?? `${migrationsDir}/meta/_journal.json`),
    searchIndexServicePath: resolve(
      options.searchIndexServicePath ??
        `${defaultCoreAppRoot}/src/main/modules/box-tool/search-engine/search-index-service.ts`
    )
  }
}

function readText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

function normalizeSql(sql: string): string {
  return sql.replace(/--.*$/gm, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function extractExportBlock(source: string | null, exportName: string): string | null {
  if (!source) return null
  const start = source.indexOf(`export const ${exportName}`)
  if (start < 0) return null
  const rest = source.slice(start + 1)
  const nextExport = rest.search(/\n\s*export const\s+/)
  if (nextExport < 0) return source.slice(start)
  return source.slice(start, start + 1 + nextExport)
}

function inferScanProgressSchema(source: string | null): SchemaCheck {
  const block = extractExportBlock(source, 'scanProgress')
  if (!block) {
    return {
      status: 'missing',
      hasSourceId: false,
      primaryKeyColumns: [],
      evidence: ['scanProgress export is missing from schema.ts']
    }
  }

  const hasTable = block.includes("'scan_progress'") || block.includes('"scan_progress"')
  const hasSourceId = block.includes("'source_id'") || block.includes('"source_id"')
  const hasPathPrimaryKey =
    /path\s*:\s*text\(['"]path['"]\)\.primaryKey\(/.test(block) ||
    /path\s*:\s*text\(['"]path['"]\)\.primaryKey\(\)/.test(block)
  const hasCompositePrimaryKey =
    /primaryKey\(\s*\{[\s\S]*columns\s*:\s*\[[\s\S]*table\.sourceId[\s\S]*table\.path[\s\S]*\]/.test(
      block
    )

  if (!hasTable) {
    return {
      status: 'unknown',
      hasSourceId,
      primaryKeyColumns: [],
      evidence: ['scanProgress export exists but scan_progress table name was not detected']
    }
  }

  if (hasSourceId && hasCompositePrimaryKey) {
    return {
      status: 'source-scoped',
      hasSourceId: true,
      primaryKeyColumns: ['source_id', 'path'],
      evidence: ['schema.ts defines scan_progress with source_id and composite primary key']
    }
  }

  if (hasPathPrimaryKey && !hasSourceId) {
    return {
      status: 'path-only',
      hasSourceId: false,
      primaryKeyColumns: ['path'],
      evidence: ['schema.ts defines scan_progress(path primary key) without source_id']
    }
  }

  return {
    status: 'unknown',
    hasSourceId,
    primaryKeyColumns: hasSourceId ? ['source_id?'] : [],
    evidence: [
      'schema.ts scan_progress shape is present but not recognized as path-only or source-scoped'
    ]
  }
}

function inferIndexedSourceTaskStateSchema(source: string | null): TableSchemaCheck {
  const block = extractExportBlock(source, 'indexedSourceTaskState')
  if (!block) {
    return {
      status: 'missing',
      evidence: ['indexedSourceTaskState export is missing from schema.ts']
    }
  }

  const requiredColumns = ['source_id', 'state_json', 'updated_at']
  const missingColumns = requiredColumns.filter(
    (column) => !block.includes(`'${column}'`) && !block.includes(`"${column}"`)
  )

  if (missingColumns.length > 0) {
    return {
      status: 'missing',
      evidence: [
        `indexed_source_task_state schema is missing columns: ${missingColumns.join(', ')}`
      ]
    }
  }

  return {
    status: 'present',
    evidence: ['schema.ts defines indexed_source_task_state with source_id/state_json/updated_at']
  }
}

function readJournal(journalPath: string): string[] {
  const text = readText(journalPath)
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as JournalFile
    return (parsed.entries ?? [])
      .map((entry) => (typeof entry.tag === 'string' ? entry.tag : null))
      .filter((tag): tag is string => Boolean(tag))
  } catch {
    return []
  }
}

function readMigrationFiles(migrationsDir: string, journalTags: string[]): MigrationFile[] {
  if (!existsSync(migrationsDir)) return []
  const journalSet = new Set(journalTags)
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      name,
      sql: readFileSync(resolve(migrationsDir, name), 'utf8'),
      inJournal: journalSet.has(name.replace(/\.sql$/, ''))
    }))
}

function hasCreateTable(sql: string, tableName: string): boolean {
  const normalized = normalizeSql(sql)
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+\`?"?${escaped}\`?"?`).test(
    normalized
  )
}

function hasCreateVirtualTable(sql: string, tableName: string): boolean {
  const normalized = normalizeSql(sql)
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `create\\s+virtual\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+\`?"?${escaped}\`?"?\\s+using\\s+fts5`
  ).test(normalized)
}

function hasSourceScopedScanProgressMigration(sql: string): boolean {
  const normalized = normalizeSql(sql)
  return (
    normalized.includes('scan_progress') &&
    normalized.includes('source_id') &&
    /primary\s+key\s*\(\s*`?"?source_id`?"?\s*,\s*`?"?path`?"?\s*\)/.test(normalized)
  )
}

function toMatch(file: MigrationFile, evidence: string[]): MigrationFileMatch {
  return {
    file: file.name,
    inJournal: file.inJournal,
    evidence
  }
}

function inferMigrationCheck(
  files: MigrationFile[],
  predicate: (sql: string) => boolean,
  presentEvidence: string,
  missingEvidence: string
): MigrationCheck {
  const matches = files
    .filter((file) => predicate(file.sql))
    .map((file) => toMatch(file, [presentEvidence]))

  if (matches.length === 0) {
    return {
      status: 'missing',
      files: [],
      evidence: [missingEvidence]
    }
  }

  return {
    status: 'present',
    files: matches,
    evidence: [presentEvidence]
  }
}

function inferFtsOwnership(
  files: MigrationFile[],
  searchIndexServiceSource: string | null
): FtsOwnershipCheck {
  const searchIndexMigrationFiles = files
    .filter((file) => hasCreateVirtualTable(file.sql, 'search_index'))
    .map((file) => toMatch(file, ['resource migration creates search_index FTS5 table']))
  const runtimeCreatesSearchIndex =
    searchIndexServiceSource?.includes('CREATE VIRTUAL TABLE IF NOT EXISTS search_index') ?? false
  const runtimeCreatesLegacyFileFts =
    searchIndexServiceSource?.includes('CREATE VIRTUAL TABLE IF NOT EXISTS file_fts') ?? false

  if (searchIndexMigrationFiles.length > 0) {
    return {
      status: 'migration-present',
      searchIndexMigrationFiles,
      runtimeCreatesSearchIndex,
      runtimeCreatesLegacyFileFts,
      evidence: ['resource migration owns search_index FTS5 creation']
    }
  }

  if (runtimeCreatesSearchIndex) {
    return {
      status: 'runtime-created',
      searchIndexMigrationFiles: [],
      runtimeCreatesSearchIndex,
      runtimeCreatesLegacyFileFts,
      evidence: ['SearchIndexService still creates search_index FTS5 at runtime']
    }
  }

  return {
    status: 'missing',
    searchIndexMigrationFiles: [],
    runtimeCreatesSearchIndex,
    runtimeCreatesLegacyFileFts,
    evidence: ['no search_index FTS5 resource migration or runtime creation was detected']
  }
}

function inferLegacyFileFtsMigrationPolicy(
  files: MigrationFile[]
): LegacyFileFtsMigrationPolicyCheck {
  const matches = files
    .filter((file) => normalizeSql(file.sql).includes('file_fts'))
    .map((file) =>
      toMatch(file, [
        'resource migration references legacy file_fts, which is outside the R3 durable ownership migration batch'
      ])
    )

  if (matches.length > 0) {
    return {
      status: 'blocked',
      files: matches,
      evidence: [
        'R3 must retain legacy file_fts unchanged; file_fts retirement or rebuild requires a separate high-risk migration batch'
      ]
    }
  }

  return {
    status: 'retained',
    files: [],
    evidence: ['resource migrations do not touch legacy file_fts; R3 retain-unchanged policy holds']
  }
}

function buildJournalSummary(
  journalPath: string,
  migrationsDir: string,
  journalTags: string[],
  files: MigrationFile[]
): MigrationJournalSummary {
  const sqlFileTags = files.map((file) => file.name.replace(/\.sql$/, ''))
  const sqlFileTagSet = new Set(sqlFileTags)
  const journalTagSet = new Set(journalTags)

  return {
    exists: existsSync(journalPath),
    latestTag: journalTags.at(-1) ?? null,
    entries: journalTags,
    sqlFiles: existsSync(migrationsDir) ? files.map((file) => file.name) : [],
    journalEntriesWithoutSql: journalTags.filter((tag) => !sqlFileTagSet.has(tag)),
    sqlFilesWithoutJournalEntry: sqlFileTags.filter((tag) => !journalTagSet.has(tag))
  }
}

function buildReadiness(
  checks: SearchIndexProductionMigrationReadinessReport['checks'],
  migrationJournal: MigrationJournalSummary
): SearchIndexProductionMigrationReadinessReport['readiness'] {
  const blockers: string[] = []
  const actions: string[] = []

  if (!migrationJournal.exists) {
    blockers.push('migration.journal_missing')
    actions.push(
      'Restore the Drizzle migration journal before production migration readiness can pass.'
    )
  }
  if (migrationJournal.journalEntriesWithoutSql.length > 0) {
    blockers.push('migration.journal_entries_without_sql')
    actions.push('Restore missing SQL files referenced by the Drizzle migration journal.')
  }
  if (migrationJournal.sqlFilesWithoutJournalEntry.length > 0) {
    blockers.push('migration.sql_files_without_journal_entry')
    actions.push(
      'Add new migration SQL files to the Drizzle migration journal before readiness evidence.'
    )
  }

  if (checks.scanProgressSchema.status !== 'source-scoped') {
    blockers.push('schema.scan_progress_source_scope_missing')
    actions.push('Update schema.ts so scan_progress uses source_id + path composite ownership.')
  }
  if (checks.scanProgressSourceScopeMigration.status !== 'present') {
    blockers.push('migration.scan_progress_source_scope_missing')
    actions.push('Add a production resource migration for scan_progress source scope.')
  }
  if (checks.indexedSourceTaskStateSchema.status !== 'present') {
    blockers.push('schema.indexed_source_task_state_missing')
    actions.push(
      'Define indexed_source_task_state in schema.ts before relying on durable task history.'
    )
  }
  if (checks.indexedSourceTaskStateMigration.status !== 'present') {
    blockers.push('migration.indexed_source_task_state_missing')
    actions.push('Add a production resource migration for indexed_source_task_state.')
  }
  if (checks.searchIndexMetaMigration.status !== 'present') {
    blockers.push('migration.search_index_meta_missing')
    actions.push(
      'Keep search_index_meta in resource migrations before production migration evidence.'
    )
  }
  if (checks.ftsDurableOwnership.status !== 'migration-present') {
    blockers.push('migration.search_index_fts_durable_missing')
    actions.push(
      'Move or explicitly approve search_index FTS5 creation under durable migration ownership.'
    )
  }
  if (checks.legacyFileFtsMigrationPolicy.status !== 'retained') {
    blockers.push('migration.legacy_file_fts_touched')
    actions.push(
      'Remove file_fts migration changes from R3 or move them to a separate high-risk migration batch.'
    )
  }

  const verification = [
    'Run search:production-migration-readiness and attach the JSON report to the migration approval request.',
    'Run search:index-migration:preflight against the target profile before any execute-mode migration.',
    'After approved migration, run the packaged Settings diagnostics probe and verifier on a real packaged profile.'
  ]

  return {
    status: blockers.length > 0 ? 'blocked' : 'ready',
    blockers,
    actions: Array.from(new Set(actions)),
    verification
  }
}

export function auditSearchIndexProductionMigrationReadiness(
  options: ProductionMigrationReadinessOptions = {}
): SearchIndexProductionMigrationReadinessReport {
  const resolved = resolveOptions(options)
  const schemaSource = readText(resolved.schemaPath)
  const searchIndexServiceSource = readText(resolved.searchIndexServicePath)
  const journalTags = readJournal(resolved.journalPath)
  const migrationFiles = readMigrationFiles(resolved.migrationsDir, journalTags)
  const migrationJournal = buildJournalSummary(
    resolved.journalPath,
    resolved.migrationsDir,
    journalTags,
    migrationFiles
  )

  const checks: SearchIndexProductionMigrationReadinessReport['checks'] = {
    scanProgressSchema: inferScanProgressSchema(schemaSource),
    scanProgressSourceScopeMigration: inferMigrationCheck(
      migrationFiles,
      hasSourceScopedScanProgressMigration,
      'resource migration creates scan_progress with source_id/path ownership',
      'no source-scoped scan_progress resource migration was detected'
    ),
    indexedSourceTaskStateSchema: inferIndexedSourceTaskStateSchema(schemaSource),
    indexedSourceTaskStateMigration: inferMigrationCheck(
      migrationFiles,
      (sql) =>
        hasCreateTable(sql, 'indexed_source_task_state') &&
        normalizeSql(sql).includes('state_json') &&
        normalizeSql(sql).includes('updated_at'),
      'resource migration creates indexed_source_task_state',
      'no indexed_source_task_state resource migration was detected'
    ),
    searchIndexMetaMigration: inferMigrationCheck(
      migrationFiles,
      (sql) => hasCreateTable(sql, 'search_index_meta'),
      'resource migration creates search_index_meta',
      'no search_index_meta resource migration was detected'
    ),
    ftsDurableOwnership: inferFtsOwnership(migrationFiles, searchIndexServiceSource),
    legacyFileFtsMigrationPolicy: inferLegacyFileFtsMigrationPolicy(migrationFiles)
  }

  return {
    kind: 'search-index-production-migration-readiness',
    generatedAt: new Date().toISOString(),
    mode: 'source-read-only',
    destructiveActions: false,
    inputs: resolved,
    migrationJournal,
    checks,
    readiness: buildReadiness(checks, migrationJournal)
  }
}

function writeOutput(value: unknown, options: CliOptions): void {
  const serialized = JSON.stringify(value, null, options.pretty ? 2 : 0)
  if (options.output) {
    const outputPath = resolve(options.output)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${serialized}\n`, 'utf8')
  }
  console.log(serialized)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return
  writeOutput(auditSearchIndexProductionMigrationReadiness(options), options)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
