#!/usr/bin/env tsx
import { createClient, type Client, type InArgs } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import os from 'node:os'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  planScanProgressSourceScopeMigration,
  runScanProgressSourceScopeMigration,
  type ScanProgressSourceScopeMigrationPlan
} from '../src/main/modules/box-tool/search-engine/scan-progress-schema'
import { buildSearchIndexDatabaseIdentity } from './search-index-evidence-source'

interface CliOptions {
  db?: string
  evidenceScope?: ScanProgressSimulationEvidenceScope
  output?: string
  copy?: string
  requireRealProfileEvidence: boolean
  sourceId: string
  pretty: boolean
  keepCopy: boolean
}

type ScanProgressSimulationEvidenceScope = 'real-profile' | 'isolated-controlled' | 'unclassified'

interface ScanProgressSimulationEvidenceSource {
  scope: ScanProgressSimulationEvidenceScope
  detection: 'auto' | 'explicit'
  dbPathClass: 'temporary' | 'non-temporary'
  dbIdentity: string
  realProfileRequired: boolean
}

const TEMPORARY_DB_PATH_ROOTS = Array.from(new Set([os.tmpdir(), '/tmp', '/private/tmp']))

interface ScanProgressSimulationSnapshot {
  tableExists: boolean
  sourceScoped: boolean
  primaryKeyColumns: string[]
  rowCount: number
  sourceRows: Array<{ sourceId: string; rows: number }>
  backupTableExists: boolean
  backupRows: number
}

export interface ScanProgressSourceScopeSimulationReport {
  kind: 'scan-progress-source-scope-simulation'
  generatedAt: string
  mode: 'copy-execute'
  destructiveActions: false
  sourceMutationPolicy: 'source-not-mutated-copy-execute'
  sourceSnapshotUnchanged: boolean
  evidenceSource: ScanProgressSimulationEvidenceSource
  sourceDb: string
  simulationDb: string
  simulationDbKept: boolean
  sourceId: string
  sourceBefore: ScanProgressSimulationSnapshot
  sourceAfter: ScanProgressSimulationSnapshot
  before: {
    plan: ScanProgressSourceScopeMigrationPlan
    snapshot: ScanProgressSimulationSnapshot
  }
  execution: {
    executed: boolean
    migratedRows: number
    backupTable: string | null
  }
  after: {
    plan: ScanProgressSourceScopeMigrationPlan
    snapshot: ScanProgressSimulationSnapshot
  }
  gate: {
    passed: boolean
    blockers: string[]
  }
  verification: string[]
}

interface TableInfoRow {
  name?: unknown
  pk?: unknown
}

interface CountRow {
  count?: unknown
  rows?: unknown
  sourceId?: unknown
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:scan-progress-simulate -- --db <sqlite.db> [options]

Options:
  --db <path>        Source SQLite database path. Required.
  --evidenceScope <scope>
                     Evidence source scope: real-profile, isolated-controlled, or unclassified.
  --requireRealProfileEvidence
                     Fail unless --evidenceScope real-profile is set and the source DB is not under the OS temp directory.
  --sourceId <id>    Source/provider id for migrated path-only rows. Default: file-provider.
  --copy <path>      Write the simulation database copy to this path.
  --keepCopy         Keep the temporary simulation database when --copy is not provided.
  --output <file>    Write the JSON report to a file in addition to stdout.
  --compact          Print single-line JSON.
  --help             Show this help.

This command never mutates --db. It uses VACUUM INTO to create a simulation copy, then executes the migration helper only on that copy.
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

function isEvidenceScope(value: string): value is ScanProgressSimulationEvidenceScope {
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
  evidenceScope?: ScanProgressSimulationEvidenceScope
  requireRealProfileEvidence?: boolean
}): ScanProgressSimulationEvidenceSource {
  const dbPathClass = TEMPORARY_DB_PATH_ROOTS.some((root) => isPathUnderDirectory(options.db, root))
    ? 'temporary'
    : 'non-temporary'
  const autoScope: ScanProgressSimulationEvidenceScope =
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
    dbIdentity: buildSearchIndexDatabaseIdentity(options.db),
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

function primaryKeyColumns(rows: TableInfoRow[]): string[] {
  return rows
    .filter((row) => Number(row.pk ?? 0) > 0)
    .sort((left, right) => Number(left.pk ?? 0) - Number(right.pk ?? 0))
    .map((row) => toStringValue(row.name))
}

async function readSnapshot(client: Client): Promise<ScanProgressSimulationSnapshot> {
  const rows = (await queryRows(client, 'PRAGMA table_info(scan_progress)')) as TableInfoRow[]
  const table = rows.length > 0
  const columns = primaryKeyColumns(rows)
  const sourceScoped = rows.some((row) => row.name === 'source_id')
  const backupTableExists = await tableExists(client, 'scan_progress_path_only_backup')
  const sourceRows =
    table && sourceScoped
      ? await queryRows(
          client,
          'SELECT source_id AS sourceId, count(*) AS rows FROM scan_progress GROUP BY source_id ORDER BY rows DESC, source_id ASC'
        )
      : []

  return {
    tableExists: table,
    sourceScoped,
    primaryKeyColumns: columns,
    rowCount: table
      ? toCount((await queryRows(client, 'SELECT count(*) AS count FROM scan_progress'))[0]?.count)
      : 0,
    sourceRows: sourceRows.map((row) => ({
      sourceId: toStringValue(row.sourceId),
      rows: toCount(row.rows)
    })),
    backupTableExists,
    backupRows: backupTableExists
      ? toCount(
          (
            await queryRows(client, 'SELECT count(*) AS count FROM scan_progress_path_only_backup')
          )[0]?.count
        )
      : 0
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

  const tempDir = mkdtempSync(`${os.tmpdir()}/tuff-scan-progress-sim-`)
  return { copyPath: resolve(tempDir, 'simulation.sqlite'), tempDir }
}

function buildGate(
  beforePlan: ScanProgressSourceScopeMigrationPlan,
  report: Omit<ScanProgressSourceScopeSimulationReport, 'gate' | 'verification'>
): ScanProgressSourceScopeSimulationReport['gate'] {
  const sourceUnchanged = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter)
  const blockers = [
    ...beforePlan.blockers,
    sourceUnchanged ? '' : 'source database scan_progress snapshot changed during simulation',
    beforePlan.status === 'blocked' ? 'pre-migration plan is blocked' : '',
    report.execution.executed && !report.after.snapshot.sourceScoped
      ? 'post-migration scan_progress is not source-scoped'
      : '',
    report.execution.executed &&
    !(
      report.after.snapshot.primaryKeyColumns.includes('source_id') &&
      report.after.snapshot.primaryKeyColumns.includes('path')
    )
      ? 'post-migration scan_progress primary key is not source_id/path'
      : '',
    report.execution.executed && report.after.plan.status !== 'not-needed'
      ? 'post-migration plan still requires migration'
      : ''
  ].filter(Boolean)

  return {
    passed:
      blockers.length === 0 && (beforePlan.status === 'not-needed' || report.execution.executed),
    blockers: Array.from(new Set(blockers))
  }
}

export async function simulateScanProgressSourceScopeMigration(options: {
  db: string
  copy?: string
  sourceId?: string
  keepCopy?: boolean
  evidenceScope?: ScanProgressSimulationEvidenceScope
  requireRealProfileEvidence?: boolean
}): Promise<ScanProgressSourceScopeSimulationReport> {
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
    let sourceBefore: ScanProgressSimulationSnapshot
    try {
      sourceBefore = await readSnapshot(sourceClient)
    } finally {
      sourceClient.close()
    }

    await createSimulationCopy(sourceDb, copyPath)

    const client = createClient({ url: `file:${copyPath}` })
    const db = drizzle(client)
    try {
      const beforePlan = await planScanProgressSourceScopeMigration(db, { sourceId })
      const beforeSnapshot = await readSnapshot(client)
      const execution = await runScanProgressSourceScopeMigration(db, { sourceId })
      const afterPlan = await planScanProgressSourceScopeMigration(db, { sourceId })
      const afterSnapshot = await readSnapshot(client)
      const afterSourceClient = createClient({ url: `file:${sourceDb}` })
      let sourceAfter: ScanProgressSimulationSnapshot
      try {
        sourceAfter = await readSnapshot(afterSourceClient)
      } finally {
        afterSourceClient.close()
      }
      const sourceSnapshotUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter)
      const baseReport = {
        kind: 'scan-progress-source-scope-simulation' as const,
        generatedAt: new Date().toISOString(),
        mode: 'copy-execute' as const,
        destructiveActions: false as const,
        sourceMutationPolicy: 'source-not-mutated-copy-execute' as const,
        sourceSnapshotUnchanged,
        evidenceSource,
        sourceDb,
        simulationDb: copyPath,
        simulationDbKept: options.keepCopy ?? Boolean(options.copy),
        sourceId,
        sourceBefore,
        sourceAfter,
        before: { plan: beforePlan, snapshot: beforeSnapshot },
        execution: {
          executed: execution.executed,
          migratedRows: execution.migratedRows,
          backupTable: execution.backupTable
        },
        after: { plan: afterPlan, snapshot: afterSnapshot }
      }

      return {
        ...baseReport,
        gate: buildGate(beforePlan, baseReport),
        verification: [
          'Source --db was copied with VACUUM INTO and was not mutated.',
          'Migration helper executed only against simulationDb.',
          'Use search:index-migration:preflight on the original DB before any approved execute-mode migration.',
          'Use search:scan-progress-migration --execute only after high-risk approval.'
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
  const report = await simulateScanProgressSourceScopeMigration({
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
