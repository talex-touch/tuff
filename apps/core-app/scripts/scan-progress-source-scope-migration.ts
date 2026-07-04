#!/usr/bin/env tsx
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import process from 'node:process'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import {
  planScanProgressSourceScopeMigration,
  runScanProgressSourceScopeMigration
} from '../src/main/modules/box-tool/search-engine/scan-progress-schema'

interface CliOptions {
  db?: string
  evidenceScope?: ScanProgressMigrationEvidenceScope
  output?: string
  requireRealProfileEvidence: boolean
  sourceId: string
  pretty: boolean
  execute: boolean
  confirmed: boolean
}

type ScanProgressMigrationEvidenceScope = 'real-profile' | 'isolated-controlled' | 'unclassified'

interface ScanProgressMigrationEvidenceSource {
  scope: ScanProgressMigrationEvidenceScope
  detection: 'auto' | 'explicit'
  dbPathClass: 'temporary' | 'non-temporary'
  realProfileRequired: boolean
}

const TEMPORARY_DB_PATH_ROOTS = Array.from(new Set([os.tmpdir(), '/tmp', '/private/tmp']))

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:scan-progress-migration -- --db <sqlite.db> [options]

Options:
  --db <path>                            SQLite database path to inspect. Required.
  --evidenceScope <scope>                Evidence source scope: real-profile, isolated-controlled, or unclassified.
  --requireRealProfileEvidence           Fail unless --evidenceScope real-profile is set and the DB is not under the OS temp directory.
  --sourceId <id>                        Source/provider id for migrated path-only rows. Default: file-provider.
  --output <file>                        Write the JSON result to a file in addition to stdout.
  --execute                              Execute the migration helper instead of only planning.
  --confirm-source-scope-migration       Required with --execute.
  --compact                              Print single-line JSON.
  --help                                 Show this help.

Default mode is read-only plan. Execute mode rewrites scan_progress in the selected database.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    requireRealProfileEvidence: false,
    sourceId: 'file-provider',
    pretty: true,
    execute: false,
    confirmed: false
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
      if (!isScanProgressMigrationEvidenceScope(scope)) {
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
    if (arg === '--output' && argv[index + 1]) {
      options.output = argv[++index]
      continue
    }
    if (arg === '--execute') {
      options.execute = true
      continue
    }
    if (arg === '--confirm-source-scope-migration') {
      options.confirmed = true
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
  if (options.execute && !options.confirmed) {
    throw new Error('Refusing to execute without --confirm-source-scope-migration')
  }
  return options
}

function isScanProgressMigrationEvidenceScope(
  value: string
): value is ScanProgressMigrationEvidenceScope {
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

function buildEvidenceSource(options: CliOptions): ScanProgressMigrationEvidenceSource {
  const dbPath = options.db
  if (!dbPath) {
    throw new Error('Missing required --db <sqlite.db>')
  }

  const dbPathClass = TEMPORARY_DB_PATH_ROOTS.some((root) => isPathUnderDirectory(dbPath, root))
    ? 'temporary'
    : 'non-temporary'
  const autoScope: ScanProgressMigrationEvidenceScope =
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
    realProfileRequired: options.requireRealProfileEvidence
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

async function readQueryOnly(client: Client): Promise<boolean | null> {
  try {
    const result = await client.execute('PRAGMA query_only')
    const row = result.rows[0] as Record<string, unknown> | undefined
    const parsed = Number(row ? Object.values(row)[0] : undefined)
    return Number.isFinite(parsed) ? parsed === 1 : null
  } catch {
    return null
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
  const evidenceSource = buildEvidenceSource(options)

  const client = createClient({ url: `file:${dbPath}` })
  const db = drizzle(client)
  try {
    if (!options.execute) {
      await client.execute('PRAGMA query_only = ON')
      const queryOnly = await readQueryOnly(client)
      const plan = await planScanProgressSourceScopeMigration(db, { sourceId: options.sourceId })
      writeOutput({ mode: 'plan', executed: false, queryOnly, evidenceSource, plan }, options)
      return
    }

    const result = await runScanProgressSourceScopeMigration(db, { sourceId: options.sourceId })
    writeOutput({ mode: 'execute', evidenceSource, ...result }, options)
    if (!result.executed && result.plan.status === 'blocked') {
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
