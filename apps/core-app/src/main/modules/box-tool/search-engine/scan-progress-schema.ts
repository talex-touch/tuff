import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { sql, type SQL } from 'drizzle-orm'
import type * as schema from '../../../db/schema'

export interface ScanProgressSchemaShape {
  tableExists: boolean
  sourceScoped: boolean
  sourceIdColumn: boolean
  primaryKeyColumns: string[]
}

interface TableInfoRow {
  name?: unknown
  pk?: unknown
}

interface CountRow {
  count?: unknown
}

const SOURCE_SCOPED_SCAN_PROGRESS_INDEX = 'idx_scan_progress_path'
const SOURCE_SCOPED_SCAN_PROGRESS_STAGING_TABLE = 'scan_progress_source_scope_new'
const PATH_ONLY_SCAN_PROGRESS_BACKUP_TABLE = 'scan_progress_path_only_backup'

export async function resolveScanProgressSchemaShape(
  db: Pick<LibSQLDatabase<typeof schema>, 'all'>
): Promise<ScanProgressSchemaShape> {
  const rows = await db.all<TableInfoRow>(sql`PRAGMA table_info(scan_progress)`)
  const primaryKeyColumns = rows
    .filter((row) => Number(row.pk ?? 0) > 0)
    .sort((left, right) => Number(left.pk ?? 0) - Number(right.pk ?? 0))
    .map((row) => (typeof row.name === 'string' ? row.name : String(row.name ?? '')))
  const sourceIdColumn = rows.some((row) => row.name === 'source_id')
  return {
    tableExists: rows.length > 0,
    sourceScoped: sourceIdColumn,
    sourceIdColumn,
    primaryKeyColumns
  }
}

export function buildScanProgressPathInClause(paths: readonly string[]): SQL {
  if (paths.length === 0) return sql`(NULL)`
  return sql`(${sql.join(
    paths.map((path) => sql`${path}`),
    sql`, `
  )})`
}

export function normalizeScanProgressSourceId(sourceId: unknown): string {
  return typeof sourceId === 'string' && sourceId.trim().length > 0 ? sourceId : 'file-provider'
}

export async function upsertSourceScopedScanProgress(
  db: Pick<LibSQLDatabase<typeof schema>, 'run'>,
  input: {
    sourceId: string
    paths: readonly string[]
    lastScannedAt: number
  }
): Promise<void> {
  if (input.paths.length === 0) return
  await db.run(sql`
    INSERT INTO scan_progress (source_id, path, last_scanned)
    VALUES ${sql.join(
      input.paths.map(
        (entryPath) => sql`(${input.sourceId}, ${entryPath}, ${input.lastScannedAt})`
      ),
      sql`, `
    )}
    ON CONFLICT(source_id, path) DO UPDATE SET
      last_scanned = excluded.last_scanned
  `)
}

export type ScanProgressSourceScopeMigrationStatus = 'ready' | 'blocked' | 'not-needed'

export interface ScanProgressSourceScopeMigrationPlan {
  status: ScanProgressSourceScopeMigrationStatus
  sourceId: string
  mode: 'read-only'
  destructiveActions: false
  requiresApproval: boolean
  requiresSchemaChange: boolean
  requiresDataRewrite: boolean
  tableExists: boolean
  sourceScoped: boolean
  primaryKeyColumns: string[]
  existingRows: number
  rowsToMigrate: number
  blankPathRows: number
  invalidTimestampRows: number
  duplicatePathRows: number
  backupTableExists: boolean
  stagingTableExists: boolean
  blockers: string[]
  steps: string[]
  rollback: string
  verification: string[]
}

export interface ScanProgressSourceScopeMigrationResult {
  plan: ScanProgressSourceScopeMigrationPlan
  executed: boolean
  migratedRows: number
  backupTable: string | null
}

type ScanProgressMigrationDb = Pick<LibSQLDatabase<typeof schema>, 'all' | 'run'>

function toCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : 0
}

async function tableExists(
  db: Pick<LibSQLDatabase<typeof schema>, 'all'>,
  tableName: string
): Promise<boolean> {
  const rows = await db.all<{ name?: unknown }>(sql`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ${tableName}
    LIMIT 1
  `)
  return rows.length > 0
}

async function countRows(
  db: Pick<LibSQLDatabase<typeof schema>, 'all'>,
  query: SQL
): Promise<number> {
  const rows = await db.all<CountRow>(query)
  return toCount(rows[0]?.count)
}

function hasCompositeSourcePathPrimaryKey(shape: ScanProgressSchemaShape): boolean {
  return shape.primaryKeyColumns.includes('source_id') && shape.primaryKeyColumns.includes('path')
}

export async function planScanProgressSourceScopeMigration(
  db: Pick<LibSQLDatabase<typeof schema>, 'all'>,
  input: { sourceId?: string } = {}
): Promise<ScanProgressSourceScopeMigrationPlan> {
  const sourceId = normalizeScanProgressSourceId(input.sourceId)
  const shape = await resolveScanProgressSchemaShape(db)
  const backupTableExists = await tableExists(db, PATH_ONLY_SCAN_PROGRESS_BACKUP_TABLE)
  const stagingTableExists = await tableExists(db, SOURCE_SCOPED_SCAN_PROGRESS_STAGING_TABLE)
  const existingRows = shape.tableExists
    ? await countRows(db, sql`SELECT count(*) AS count FROM scan_progress`)
    : 0
  const blankPathRows = shape.tableExists
    ? await countRows(
        db,
        sql`SELECT count(*) AS count FROM scan_progress WHERE trim(COALESCE(path, '')) = ''`
      )
    : 0
  const invalidTimestampRows = shape.tableExists
    ? await countRows(
        db,
        sql`SELECT count(*) AS count FROM scan_progress WHERE last_scanned IS NULL OR last_scanned < 0`
      )
    : 0
  const duplicatePathRows = shape.tableExists
    ? await countRows(
        db,
        sql`
          SELECT count(*) AS count
          FROM (
            SELECT path
            FROM scan_progress
            GROUP BY path
            HAVING count(*) > 1
          )
        `
      )
    : 0

  const blockers = [
    stagingTableExists ? 'staging table already exists' : '',
    !shape.sourceScoped && backupTableExists ? 'path-only backup table already exists' : '',
    shape.sourceScoped && !hasCompositeSourcePathPrimaryKey(shape)
      ? 'source_id exists without PRIMARY KEY(source_id, path)'
      : '',
    blankPathRows > 0 ? 'scan_progress blank path rows' : '',
    invalidTimestampRows > 0 ? 'scan_progress invalid timestamp rows' : '',
    duplicatePathRows > 0 ? 'scan_progress duplicate path rows' : ''
  ].filter(Boolean)

  const sourceScopedReady = shape.sourceScoped && hasCompositeSourcePathPrimaryKey(shape)
  const status: ScanProgressSourceScopeMigrationStatus =
    blockers.length > 0 ? 'blocked' : sourceScopedReady ? 'not-needed' : 'ready'
  const steps = sourceScopedReady
    ? ['scan_progress already has source_id and PRIMARY KEY(source_id, path).']
    : shape.tableExists
      ? [
          'Create source-scoped staging table.',
          `Backfill existing path-only rows into source_id=${sourceId}.`,
          `Rename path-only scan_progress to ${PATH_ONLY_SCAN_PROGRESS_BACKUP_TABLE}.`,
          'Rename staging table to scan_progress.',
          `Create ${SOURCE_SCOPED_SCAN_PROGRESS_INDEX} for path-based compatibility queries.`
        ]
      : [
          'Create scan_progress with source_id, path, last_scanned and PRIMARY KEY(source_id, path).',
          `Create ${SOURCE_SCOPED_SCAN_PROGRESS_INDEX} for path-based compatibility queries.`
        ]

  return {
    status,
    sourceId,
    mode: 'read-only',
    destructiveActions: false,
    requiresApproval: status === 'ready',
    requiresSchemaChange: !sourceScopedReady,
    requiresDataRewrite: !sourceScopedReady && existingRows > 0,
    tableExists: shape.tableExists,
    sourceScoped: sourceScopedReady,
    primaryKeyColumns: shape.primaryKeyColumns,
    existingRows,
    rowsToMigrate: sourceScopedReady ? 0 : existingRows,
    blankPathRows,
    invalidTimestampRows,
    duplicatePathRows,
    backupTableExists,
    stagingTableExists,
    blockers,
    steps,
    rollback: [
      'Keep scan_progress_path_only_backup until post-migration preflight,',
      'Settings diagnostics, and source-scoped read/write verification pass;',
      'rollback can rename the backup back to scan_progress or force provider-scoped full rescan.'
    ].join(' '),
    verification: [
      'Re-run search:index-migration:preflight and expect scanProgressSourceScope=ready.',
      'Verify scan_progress has PRIMARY KEY(source_id, path).',
      'Verify source-scoped read/delete/upsert only touches the intended sourceId.',
      'Verify Settings diagnostics does not report cross-source progress contamination.'
    ]
  }
}

async function createSourceScopedScanProgressTable(
  db: Pick<LibSQLDatabase<typeof schema>, 'run'>,
  tableName: 'scan_progress' | typeof SOURCE_SCOPED_SCAN_PROGRESS_STAGING_TABLE
): Promise<void> {
  if (tableName === 'scan_progress') {
    await db.run(sql`
      CREATE TABLE scan_progress (
        source_id text NOT NULL,
        path text NOT NULL,
        last_scanned integer NOT NULL,
        PRIMARY KEY(source_id, path)
      )
    `)
    return
  }

  await db.run(sql`
    CREATE TABLE scan_progress_source_scope_new (
      source_id text NOT NULL,
      path text NOT NULL,
      last_scanned integer NOT NULL,
      PRIMARY KEY(source_id, path)
    )
  `)
}

export async function runScanProgressSourceScopeMigration(
  db: ScanProgressMigrationDb,
  input: { sourceId?: string } = {}
): Promise<ScanProgressSourceScopeMigrationResult> {
  const plan = await planScanProgressSourceScopeMigration(db, input)
  if (plan.status !== 'ready') {
    return {
      plan,
      executed: false,
      migratedRows: 0,
      backupTable: null
    }
  }

  await db.run(sql`BEGIN IMMEDIATE`)
  try {
    if (plan.tableExists) {
      await createSourceScopedScanProgressTable(db, SOURCE_SCOPED_SCAN_PROGRESS_STAGING_TABLE)
      await db.run(sql`
        INSERT INTO scan_progress_source_scope_new (source_id, path, last_scanned)
        SELECT ${plan.sourceId}, path, last_scanned
        FROM scan_progress
      `)
      await db.run(sql`
        ALTER TABLE scan_progress
        RENAME TO scan_progress_path_only_backup
      `)
      await db.run(sql`
        ALTER TABLE scan_progress_source_scope_new
        RENAME TO scan_progress
      `)
    } else {
      await createSourceScopedScanProgressTable(db, 'scan_progress')
    }
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_scan_progress_path
      ON scan_progress (path)
    `)
    await db.run(sql`COMMIT`)
  } catch (error) {
    await db.run(sql`ROLLBACK`).catch(() => undefined)
    throw error
  }

  return {
    plan,
    executed: true,
    migratedRows: plan.rowsToMigrate,
    backupTable: plan.tableExists ? PATH_ONLY_SCAN_PROGRESS_BACKUP_TABLE : null
  }
}
