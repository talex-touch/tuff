#!/usr/bin/env tsx
import { createClient, type Client, type InArgs } from '@libsql/client'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import os from 'node:os'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const SEARCH_INDEX_COLUMNS = [
  'item_id',
  'provider',
  'type',
  'title',
  'title_compact',
  'keywords',
  'tags',
  'path',
  'content'
] as const

const SEARCH_INDEX_SHADOW_TABLES = [
  'search_index_data',
  'search_index_idx',
  'search_index_content',
  'search_index_docsize',
  'search_index_config'
] as const

interface CliOptions {
  db?: string
  evidenceScope?: SearchIndexFtsSimulationEvidenceScope
  output?: string
  copy?: string
  requireRealProfileEvidence: boolean
  sourceId: string
  pretty: boolean
  keepCopy: boolean
}

type SearchIndexFtsSimulationEvidenceScope = 'real-profile' | 'isolated-controlled' | 'unclassified'

interface SearchIndexFtsSimulationEvidenceSource {
  scope: SearchIndexFtsSimulationEvidenceScope
  detection: 'auto' | 'explicit'
  dbPathClass: 'temporary' | 'non-temporary'
  realProfileRequired: boolean
}

const TEMPORARY_DB_PATH_ROOTS = Array.from(new Set([os.tmpdir(), '/tmp', '/private/tmp']))

interface TableInfoRow {
  name?: unknown
}

interface CountRow {
  count?: unknown
  rows?: unknown
  providerId?: unknown
}

interface SearchIndexFtsSnapshot {
  searchIndexExists: boolean
  searchIndexColumns: string[]
  searchIndexHasRequiredColumns: boolean
  searchIndexRows: number
  sourceRows: number
  searchIndexShadowTables: Record<string, boolean>
  searchIndexMetaExists: boolean
  searchIndexMetaRows: number
  legacyFileFtsExists: boolean
  legacyFileFtsRows: number | null
  keywordMappingIndexes: Record<string, boolean>
}

interface SearchIndexFtsSimulationAction {
  id: string
  status: 'executed' | 'skipped'
  summary: string
}

export interface SearchIndexFtsOwnershipSimulationReport {
  kind: 'search-index-fts-ownership-simulation'
  generatedAt: string
  mode: 'copy-execute'
  destructiveActions: false
  simulationMutatesCopy: true
  sourceMutationPolicy: 'source-not-mutated-copy-execute'
  sourceSnapshotUnchanged: boolean
  evidenceSource: SearchIndexFtsSimulationEvidenceSource
  sourceDb: string
  simulationDb: string
  simulationDbKept: boolean
  sourceId: string
  sourceBefore: SearchIndexFtsSnapshot
  sourceAfter: SearchIndexFtsSnapshot
  before: SearchIndexFtsSnapshot
  actions: SearchIndexFtsSimulationAction[]
  after: SearchIndexFtsSnapshot
  impact: {
    rebuildRequired: boolean
    rowsDiscardedInSimulation: number
    fullReindexRequired: boolean
    legacyFileFtsPolicy: 'retain-unchanged' | 'not-present'
  }
  gate: {
    passed: boolean
    blockers: string[]
    warnings: string[]
  }
  verification: string[]
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:fts-ownership-simulate -- --db <sqlite.db> [options]

Options:
  --db <path>        Source SQLite database path. Required.
  --evidenceScope <scope>
                     Evidence source scope: real-profile, isolated-controlled, or unclassified.
  --requireRealProfileEvidence
                     Fail unless --evidenceScope real-profile is set and the source DB is not under the OS temp directory.
  --sourceId <id>    Provider id to inspect for row impact. Default: file-provider.
  --copy <path>      Write the simulation database copy to this path.
  --keepCopy         Keep the temporary simulation database when --copy is not provided.
  --output <file>    Write the JSON report to a file in addition to stdout.
  --compact          Print single-line JSON.
  --help             Show this help.

This command never mutates --db. It uses VACUUM INTO to create a simulation copy, then applies candidate durable FTS ownership DDL only on that copy.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    requireRealProfileEvidence: false,
    sourceId: 'file-provider',
    pretty: true,
    keepCopy: false
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
    if (arg === '--evidenceScope' && argv[index + 1]) {
      const scope = argv[++index]
      if (!isEvidenceScope(scope)) {
        throw new Error(
          '--evidenceScope must be one of: real-profile, isolated-controlled, unclassified'
        )
      }
      options.evidenceScope = scope
      continue
    }
    if (arg === '--requireRealProfileEvidence') {
      options.requireRealProfileEvidence = true
      continue
    }
    if (arg === '--sourceId' && argv[index + 1]) {
      options.sourceId = argv[++index]
      continue
    }
    if (arg === '--copy' && argv[index + 1]) {
      options.copy = argv[++index]
      options.keepCopy = true
      continue
    }
    if (arg === '--keepCopy') {
      options.keepCopy = true
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

function isEvidenceScope(value: string): value is SearchIndexFtsSimulationEvidenceScope {
  return value === 'real-profile' || value === 'isolated-controlled' || value === 'unclassified'
}

function isPathUnderDirectory(filePath: string, directoryPath: string): boolean {
  const resolvedFilePath = resolve(filePath)
  const resolvedDirectoryPath = resolve(directoryPath)
  return (
    resolvedFilePath === resolvedDirectoryPath ||
    resolvedFilePath.startsWith(`${resolvedDirectoryPath}${sep}`)
  )
}

function buildEvidenceSource(options: {
  db: string
  evidenceScope?: SearchIndexFtsSimulationEvidenceScope
  requireRealProfileEvidence?: boolean
}): SearchIndexFtsSimulationEvidenceSource {
  const dbPathClass = TEMPORARY_DB_PATH_ROOTS.some((root) => isPathUnderDirectory(options.db, root))
    ? 'temporary'
    : 'non-temporary'
  const autoScope: SearchIndexFtsSimulationEvidenceScope =
    dbPathClass === 'temporary' ? 'isolated-controlled' : 'unclassified'
  const scope = options.evidenceScope ?? autoScope

  if (scope === 'real-profile' && dbPathClass === 'temporary') {
    throw new Error('Temporary SQLite DB paths cannot be marked as real-profile evidence')
  }
  if (options.requireRealProfileEvidence && scope !== 'real-profile') {
    throw new Error(
      'Real profile evidence requires --evidenceScope real-profile and a non-temporary SQLite DB path'
    )
  }

  return {
    scope,
    detection: options.evidenceScope ? 'explicit' : 'auto',
    dbPathClass,
    realProfileRequired: options.requireRealProfileEvidence ?? false
  }
}

function toCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''")
}

async function queryRows(client: Client, sql: string, args?: InArgs): Promise<CountRow[]> {
  const result = await client.execute(args ? { sql, args } : sql)
  return result.rows as CountRow[]
}

async function tableExists(client: Client, tableName: string): Promise<boolean> {
  const rows = await queryRows(
    client,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName]
  )
  return rows.length > 0
}

async function indexExists(client: Client, indexName: string): Promise<boolean> {
  const rows = await queryRows(
    client,
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1",
    [indexName]
  )
  return rows.length > 0
}

async function safeCount(client: Client, sql: string, args?: InArgs): Promise<number> {
  try {
    return toCount((await queryRows(client, sql, args))[0]?.count)
  } catch {
    return 0
  }
}

async function readSearchIndexColumns(client: Client): Promise<string[]> {
  try {
    const rows = (await queryRows(
      client,
      "SELECT name FROM pragma_table_xinfo('search_index')"
    )) as TableInfoRow[]
    return rows.map((row) => toStringValue(row.name)).filter(Boolean)
  } catch {
    return []
  }
}

function hasRequiredSearchIndexColumns(columns: string[]): boolean {
  return SEARCH_INDEX_COLUMNS.every((column) => columns.includes(column))
}

async function readSnapshot(client: Client, sourceId: string): Promise<SearchIndexFtsSnapshot> {
  const searchIndexExists = await tableExists(client, 'search_index')
  const searchIndexColumns = searchIndexExists ? await readSearchIndexColumns(client) : []
  const searchIndexShadowTables: Record<string, boolean> = {}
  for (const table of SEARCH_INDEX_SHADOW_TABLES) {
    searchIndexShadowTables[table] = await tableExists(client, table)
  }

  const searchIndexMetaExists = await tableExists(client, 'search_index_meta')
  const legacyFileFtsExists = await tableExists(client, 'file_fts')
  const keywordMappingIndexes = {
    idx_keyword_mappings_provider_keyword: await indexExists(
      client,
      'idx_keyword_mappings_provider_keyword'
    ),
    idx_keyword_mappings_provider_item: await indexExists(
      client,
      'idx_keyword_mappings_provider_item'
    ),
    idx_keyword_mappings_provider_item_keyword: await indexExists(
      client,
      'idx_keyword_mappings_provider_item_keyword'
    )
  }

  return {
    searchIndexExists,
    searchIndexColumns,
    searchIndexHasRequiredColumns: hasRequiredSearchIndexColumns(searchIndexColumns),
    searchIndexRows: searchIndexExists
      ? await safeCount(client, 'SELECT count(*) AS count FROM search_index')
      : 0,
    sourceRows: searchIndexExists
      ? await safeCount(client, 'SELECT count(*) AS count FROM search_index WHERE provider = ?', [
          sourceId
        ])
      : 0,
    searchIndexShadowTables,
    searchIndexMetaExists,
    searchIndexMetaRows: searchIndexMetaExists
      ? await safeCount(client, 'SELECT count(*) AS count FROM search_index_meta')
      : 0,
    legacyFileFtsExists,
    legacyFileFtsRows: legacyFileFtsExists
      ? await safeCount(client, 'SELECT count(*) AS count FROM file_fts')
      : null,
    keywordMappingIndexes
  }
}

async function createSimulationCopy(sourceDb: string, targetDb: string): Promise<void> {
  const sourceClient = createClient({ url: `file:${sourceDb}` })
  try {
    await sourceClient.execute(`VACUUM INTO '${escapeSqlString(targetDb)}'`)
  } finally {
    sourceClient.close()
  }
}

function resolveSimulationPath(options: {
  copy?: string
  db: string
  keepCopy: boolean
  sourceId: string
}): { copyPath: string; tempDir: string | null } {
  if (options.copy) {
    const copyPath = resolve(options.copy)
    mkdirSync(dirname(copyPath), { recursive: true })
    return { copyPath, tempDir: null }
  }

  const tempDir = mkdtempSync(`${os.tmpdir()}/tuff-search-index-fts-sim-`)
  return { copyPath: resolve(tempDir, 'simulation.sqlite'), tempDir }
}

async function createSearchIndexFts(client: Client): Promise<void> {
  await client.execute(`
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      item_id UNINDEXED,
      provider UNINDEXED,
      type UNINDEXED,
      title,
      title_compact,
      keywords,
      tags,
      path,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `)
}

async function applyCandidateFtsOwnershipDdl(
  client: Client,
  before: SearchIndexFtsSnapshot
): Promise<SearchIndexFtsSimulationAction[]> {
  const actions: SearchIndexFtsSimulationAction[] = []

  if (!before.searchIndexExists) {
    await createSearchIndexFts(client)
    actions.push({
      id: 'create-search-index-fts',
      status: 'executed',
      summary: 'Created search_index FTS5 table on the simulation copy.'
    })
  } else if (!before.searchIndexHasRequiredColumns) {
    await client.execute('DROP TABLE IF EXISTS search_index')
    await createSearchIndexFts(client)
    actions.push({
      id: 'recreate-search-index-fts',
      status: 'executed',
      summary:
        'Recreated search_index FTS5 table on the simulation copy because required columns were missing.'
    })
  } else {
    actions.push({
      id: 'create-search-index-fts',
      status: 'skipped',
      summary: 'search_index FTS5 already has the required durable shape.'
    })
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS search_index_meta (
      provider_id text NOT NULL,
      item_id text NOT NULL,
      keyword_hash text NOT NULL,
      updated_at integer DEFAULT (strftime('%s', 'now')) NOT NULL,
      PRIMARY KEY(provider_id, item_id)
    )
  `)
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_search_index_meta_updated_at ON search_index_meta (updated_at)'
  )
  actions.push({
    id: 'ensure-search-index-meta',
    status: before.searchIndexMetaExists ? 'skipped' : 'executed',
    summary: 'Ensured search_index_meta table and updated_at index on the simulation copy.'
  })

  const keywordIndexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_keyword ON keyword_mappings(provider_id, keyword)',
    'CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_item ON keyword_mappings(provider_id, item_id)',
    'CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_item_keyword ON keyword_mappings(provider_id, item_id, keyword)'
  ]
  const hasKeywordMappings = await tableExists(client, 'keyword_mappings')
  if (hasKeywordMappings) {
    for (const statement of keywordIndexStatements) {
      await client.execute(statement)
    }
  }
  actions.push({
    id: 'ensure-keyword-mapping-indexes',
    status: hasKeywordMappings ? 'executed' : 'skipped',
    summary: hasKeywordMappings
      ? 'Ensured keyword_mappings provider indexes on the simulation copy.'
      : 'keyword_mappings table is missing; provider indexes were skipped.'
  })

  actions.push({
    id: 'legacy-file-fts',
    status: 'skipped',
    summary: before.legacyFileFtsExists
      ? 'Legacy file_fts was left unchanged by the R3 simulation; retention is the compatibility policy for this batch.'
      : 'Legacy file_fts is absent; no R3 action is needed.'
  })

  return actions
}

function buildGate(
  report: Omit<SearchIndexFtsOwnershipSimulationReport, 'gate' | 'verification'>
): SearchIndexFtsOwnershipSimulationReport['gate'] {
  const sourceUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter)
  const missingShadowTables = SEARCH_INDEX_SHADOW_TABLES.filter(
    (table) => !report.after.searchIndexShadowTables[table]
  )
  const blockers = [
    sourceUnchanged ? '' : 'source database search_index snapshot changed during simulation',
    report.after.searchIndexExists ? '' : 'simulation copy is missing search_index',
    report.after.searchIndexHasRequiredColumns
      ? ''
      : 'simulation copy search_index is missing required columns',
    missingShadowTables.length > 0
      ? `simulation copy missing search_index shadow tables: ${missingShadowTables.join(', ')}`
      : '',
    report.after.searchIndexMetaExists ? '' : 'simulation copy is missing search_index_meta'
  ].filter(Boolean)
  const warnings = [
    report.impact.rebuildRequired
      ? `search_index recreate would require provider-scoped/full reindex; rows discarded in simulation: ${report.impact.rowsDiscardedInSimulation}`
      : '',
    report.impact.legacyFileFtsPolicy === 'retain-unchanged'
      ? 'legacy file_fts exists and is retained unchanged by this R3 migration batch'
      : ''
  ].filter(Boolean)

  return {
    passed: blockers.length === 0,
    blockers,
    warnings
  }
}

export async function simulateSearchIndexFtsOwnership(options: {
  db: string
  copy?: string
  sourceId?: string
  keepCopy?: boolean
  evidenceScope?: SearchIndexFtsSimulationEvidenceScope
  requireRealProfileEvidence?: boolean
}): Promise<SearchIndexFtsOwnershipSimulationReport> {
  const sourceDb = resolve(options.db)
  if (!existsSync(sourceDb)) {
    throw new Error(`SQLite database does not exist: ${sourceDb}`)
  }

  const sourceId = options.sourceId ?? 'file-provider'
  const evidenceSource = buildEvidenceSource({
    db: sourceDb,
    evidenceScope: options.evidenceScope,
    requireRealProfileEvidence: options.requireRealProfileEvidence
  })
  const { copyPath, tempDir } = resolveSimulationPath({
    db: sourceDb,
    copy: options.copy,
    sourceId,
    keepCopy: options.keepCopy ?? Boolean(options.copy)
  })

  try {
    const sourceClient = createClient({ url: `file:${sourceDb}` })
    let sourceBefore: SearchIndexFtsSnapshot
    try {
      sourceBefore = await readSnapshot(sourceClient, sourceId)
    } finally {
      sourceClient.close()
    }

    await createSimulationCopy(sourceDb, copyPath)

    const client = createClient({ url: `file:${copyPath}` })
    try {
      const before = await readSnapshot(client, sourceId)
      const actions = await applyCandidateFtsOwnershipDdl(client, before)
      const after = await readSnapshot(client, sourceId)

      const afterSourceClient = createClient({ url: `file:${sourceDb}` })
      let sourceAfter: SearchIndexFtsSnapshot
      try {
        sourceAfter = await readSnapshot(afterSourceClient, sourceId)
      } finally {
        afterSourceClient.close()
      }

      const legacyFileFtsPolicy: SearchIndexFtsOwnershipSimulationReport['impact']['legacyFileFtsPolicy'] =
        before.legacyFileFtsExists ? 'retain-unchanged' : 'not-present'
      const impact = {
        rebuildRequired: before.searchIndexExists && !before.searchIndexHasRequiredColumns,
        rowsDiscardedInSimulation:
          before.searchIndexExists && !before.searchIndexHasRequiredColumns
            ? before.searchIndexRows
            : 0,
        fullReindexRequired: before.searchIndexExists && !before.searchIndexHasRequiredColumns,
        legacyFileFtsPolicy
      }
      const sourceSnapshotUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)
      const baseReport = {
        kind: 'search-index-fts-ownership-simulation' as const,
        generatedAt: new Date().toISOString(),
        mode: 'copy-execute' as const,
        destructiveActions: false as const,
        simulationMutatesCopy: true as const,
        sourceMutationPolicy: 'source-not-mutated-copy-execute' as const,
        sourceSnapshotUnchanged,
        evidenceSource,
        sourceDb,
        simulationDb: copyPath,
        simulationDbKept: options.keepCopy ?? Boolean(options.copy),
        sourceId,
        sourceBefore,
        sourceAfter,
        before,
        actions,
        after,
        impact
      }

      return {
        ...baseReport,
        gate: buildGate(baseReport),
        verification: [
          'Source --db was copied with VACUUM INTO and was not mutated.',
          'Candidate durable FTS DDL executed only against simulationDb.',
          'Rows discarded in simulation must be treated as full reindex impact before real approval.',
          'Legacy file_fts is intentionally retained unchanged in R3; any retirement requires a separate high-risk migration batch.'
        ]
      }
    } finally {
      client.close()
    }
  } finally {
    if (tempDir && !options.keepCopy) {
      rmSync(tempDir, { recursive: true, force: true })
    }
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
  if (!options.db) {
    throw new Error('Missing required --db <sqlite.db>')
  }
  const report = await simulateSearchIndexFtsOwnership({
    db: options.db,
    copy: options.copy,
    sourceId: options.sourceId,
    keepCopy: options.keepCopy,
    evidenceScope: options.evidenceScope,
    requireRealProfileEvidence: options.requireRealProfileEvidence
  })
  writeOutput(report, options)
  if (!report.gate.passed) {
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
