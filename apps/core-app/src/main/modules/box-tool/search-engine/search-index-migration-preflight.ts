export const SEARCH_INDEX_MIGRATION_PREFLIGHT_SCHEMA_VERSION = 'search-index-migration-preflight/v1'

export type SearchIndexMigrationPreflightStatus = 'passed' | 'warning' | 'failed' | 'info'

export interface SearchIndexMigrationTableColumn {
  name: string
  type?: string
  notNull?: boolean
  primaryKeyOrder?: number
}

export interface SearchIndexMigrationTableSnapshot {
  exists: boolean
  rowCount?: number
  columns?: SearchIndexMigrationTableColumn[]
}

export interface SearchIndexMigrationProviderCount {
  providerId: string
  rows: number
}

export interface SearchIndexMigrationSqliteRuntimeSnapshot {
  journalMode: string | null
  synchronous: number | null
  busyTimeoutMs: number | null
  pageSize: number | null
  pageCount: number | null
  freelistCount: number | null
  queryOnly: boolean | null
}

export interface SearchIndexMigrationPreflightSnapshot {
  generatedAt: string
  sourceId: string
  sqliteRuntime?: SearchIndexMigrationSqliteRuntimeSnapshot
  tables: {
    files: SearchIndexMigrationTableSnapshot
    fileExtensions: SearchIndexMigrationTableSnapshot
    fileIndexProgress: SearchIndexMigrationTableSnapshot
    scanProgress: SearchIndexMigrationTableSnapshot
    fileFts: SearchIndexMigrationTableSnapshot
    searchIndex: SearchIndexMigrationTableSnapshot
    searchIndexMeta: SearchIndexMigrationTableSnapshot
    keywordMappings: SearchIndexMigrationTableSnapshot
    indexedSourceTaskState: SearchIndexMigrationTableSnapshot
  }
  scanProgress: {
    sourceIdColumn: boolean
    primaryKeyColumns: string[]
    blankPathRows: number
    invalidTimestampRows: number
    duplicateSourcePathRows: number | null
    sharedPathAcrossSourcesRows: number | null
  }
  ftsOwnership: {
    searchIndexShadowTables: Record<string, boolean>
    searchIndexByProvider: SearchIndexMigrationProviderCount[]
    keywordMappingsByProvider: SearchIndexMigrationProviderCount[]
    searchIndexMetaByProvider: SearchIndexMigrationProviderCount[]
    sourceIndexedRows: number
    sourceKeywordRows: number
    sourceMetaRows: number
    filesRows: number
    fileFtsRows: number | null
    orphanKeywordRows: number
    orphanMetaRows: number
    searchIndexRowsMissingMeta: number
    keywordRowsMissingMeta: number
  }
}

export interface SearchIndexMigrationPreflightCheck {
  id: string
  status: SearchIndexMigrationPreflightStatus
  summary: string
  evidence?: Record<string, string | number | boolean | null | string[]>
}

export interface SearchIndexMigrationDryRunStep {
  id: string
  status: 'ready' | 'blocked' | 'manual-approval-required' | 'not-needed'
  summary: string
  writes: false
  requiresSchemaChange: boolean
  requiresDataRewrite: boolean
  estimatedRows: number
  rollback: string
  verification: string[]
  blockers?: string[]
}

export interface SearchIndexMigrationDryRunPlan {
  mode: 'read-only'
  destructiveActions: false
  requiresApproval: boolean
  estimatedRowsTouched: number
  steps: SearchIndexMigrationDryRunStep[]
}

export interface SearchIndexMigrationPreflightReport {
  schemaVersion: typeof SEARCH_INDEX_MIGRATION_PREFLIGHT_SCHEMA_VERSION
  generatedAt: string
  sourceId: string
  destructiveActions: false
  migrationReadiness: {
    sqliteFtsOwnership: 'ready' | 'needs-confirmation' | 'blocked'
    scanProgressSourceScope: 'ready' | 'needs-migration' | 'blocked'
  }
  gate: {
    passed: boolean
    failedChecks: string[]
  }
  checks: SearchIndexMigrationPreflightCheck[]
  migrationDryRun: SearchIndexMigrationDryRunPlan
  nextActions: string[]
  snapshot: SearchIndexMigrationPreflightSnapshot
}

const REQUIRED_TABLES: Array<keyof SearchIndexMigrationPreflightSnapshot['tables']> = [
  'files',
  'scanProgress',
  'searchIndex',
  'searchIndexMeta',
  'keywordMappings'
]

const SEARCH_INDEX_SHADOW_TABLES = [
  'search_index_data',
  'search_index_idx',
  'search_index_content',
  'search_index_docsize',
  'search_index_config'
]

function countStatus(count: number): SearchIndexMigrationPreflightStatus {
  return count > 0 ? 'failed' : 'passed'
}

function hasTable(
  snapshot: SearchIndexMigrationPreflightSnapshot,
  table: keyof SearchIndexMigrationPreflightSnapshot['tables']
): boolean {
  return snapshot.tables[table].exists
}

function getRowCount(table: SearchIndexMigrationTableSnapshot): number {
  return table.rowCount ?? 0
}

function createCheck(
  id: string,
  status: SearchIndexMigrationPreflightStatus,
  summary: string,
  evidence?: SearchIndexMigrationPreflightCheck['evidence']
): SearchIndexMigrationPreflightCheck {
  return { id, status, summary, ...(evidence ? { evidence } : {}) }
}

export function buildSearchIndexMigrationPreflightReport(
  snapshot: SearchIndexMigrationPreflightSnapshot
): SearchIndexMigrationPreflightReport {
  const checks: SearchIndexMigrationPreflightCheck[] = []

  const missingTables = REQUIRED_TABLES.filter((table) => !hasTable(snapshot, table))
  if (snapshot.sqliteRuntime) {
    checks.push(
      createCheck(
        'sqlite-runtime-profile',
        'info',
        'SQLite runtime PRAGMA profile captured for migration risk review.',
        {
          journalMode: snapshot.sqliteRuntime.journalMode,
          synchronous: snapshot.sqliteRuntime.synchronous,
          busyTimeoutMs: snapshot.sqliteRuntime.busyTimeoutMs,
          pageSize: snapshot.sqliteRuntime.pageSize,
          pageCount: snapshot.sqliteRuntime.pageCount,
          freelistCount: snapshot.sqliteRuntime.freelistCount,
          queryOnly: snapshot.sqliteRuntime.queryOnly
        }
      )
    )
  }
  checks.push(
    createCheck(
      'required-tables',
      missingTables.length > 0 ? 'failed' : 'passed',
      missingTables.length > 0
        ? 'Required search/indexing tables are missing.'
        : 'Required search/indexing tables exist.',
      { missingTables }
    )
  )

  const scanProgressTable = snapshot.tables.scanProgress
  const scanProgressPk = snapshot.scanProgress.primaryKeyColumns
  const scanProgressSourceScoped =
    snapshot.scanProgress.sourceIdColumn &&
    scanProgressPk.includes('source_id') &&
    scanProgressPk.includes('path')
  checks.push(
    createCheck(
      'scan-progress-source-scope',
      scanProgressSourceScoped ? 'passed' : 'warning',
      scanProgressSourceScoped
        ? 'scan_progress is source-scoped.'
        : 'scan_progress is still path-only or missing a source-scoped primary key.',
      {
        sourceIdColumn: snapshot.scanProgress.sourceIdColumn,
        primaryKeyColumns: scanProgressPk
      }
    )
  )

  checks.push(
    createCheck(
      'scan-progress-data-hygiene',
      countStatus(snapshot.scanProgress.blankPathRows + snapshot.scanProgress.invalidTimestampRows),
      'scan_progress path and timestamp hygiene.',
      {
        rows: getRowCount(scanProgressTable),
        blankPathRows: snapshot.scanProgress.blankPathRows,
        invalidTimestampRows: snapshot.scanProgress.invalidTimestampRows
      }
    )
  )

  if (snapshot.scanProgress.duplicateSourcePathRows !== null) {
    checks.push(
      createCheck(
        'scan-progress-source-duplicates',
        countStatus(snapshot.scanProgress.duplicateSourcePathRows),
        'source-scoped scan_progress duplicate row check.',
        {
          duplicateSourcePathRows: snapshot.scanProgress.duplicateSourcePathRows,
          sharedPathAcrossSourcesRows: snapshot.scanProgress.sharedPathAcrossSourcesRows
        }
      )
    )
  }

  const fileFtsStatus =
    snapshot.tables.fileFts.exists && (snapshot.ftsOwnership.fileFtsRows ?? 0) > 0 ? 'info' : 'info'
  checks.push(
    createCheck(
      'legacy-file-fts',
      fileFtsStatus,
      snapshot.tables.fileFts.exists
        ? 'Legacy file_fts table exists and is retained unchanged by the R3 durable ownership migration.'
        : 'Legacy file_fts table is not present.',
      {
        exists: snapshot.tables.fileFts.exists,
        rows: snapshot.ftsOwnership.fileFtsRows,
        policy: snapshot.tables.fileFts.exists ? 'retain-unchanged' : 'not-needed'
      }
    )
  )

  const missingShadowTables = SEARCH_INDEX_SHADOW_TABLES.filter(
    (table) => !snapshot.ftsOwnership.searchIndexShadowTables[table]
  )
  checks.push(
    createCheck(
      'search-index-shadow-tables',
      missingShadowTables.length > 0 ? 'warning' : 'passed',
      missingShadowTables.length > 0
        ? 'search_index FTS5 shadow tables are incomplete or not visible.'
        : 'search_index FTS5 shadow tables are visible.',
      { missingShadowTables }
    )
  )

  checks.push(
    createCheck(
      'source-index-row-parity',
      snapshot.ftsOwnership.sourceIndexedRows === snapshot.ftsOwnership.filesRows
        ? 'passed'
        : 'failed',
      'Source indexed row count compared with files table row count.',
      {
        sourceId: snapshot.sourceId,
        sourceIndexedRows: snapshot.ftsOwnership.sourceIndexedRows,
        filesRows: snapshot.ftsOwnership.filesRows
      }
    )
  )

  checks.push(
    createCheck(
      'keyword-orphans',
      countStatus(snapshot.ftsOwnership.orphanKeywordRows),
      'keyword_mappings rows should point at search_index rows for the same provider.',
      { orphanKeywordRows: snapshot.ftsOwnership.orphanKeywordRows }
    )
  )

  checks.push(
    createCheck(
      'meta-orphans',
      countStatus(snapshot.ftsOwnership.orphanMetaRows),
      'search_index_meta rows should point at search_index rows for the same provider.',
      { orphanMetaRows: snapshot.ftsOwnership.orphanMetaRows }
    )
  )

  checks.push(
    createCheck(
      'search-index-meta-coverage',
      snapshot.ftsOwnership.searchIndexRowsMissingMeta > 0 ||
        snapshot.ftsOwnership.keywordRowsMissingMeta > 0
        ? 'failed'
        : 'passed',
      'search_index and keyword_mappings rows should have matching keyword hash metadata.',
      {
        searchIndexRowsMissingMeta: snapshot.ftsOwnership.searchIndexRowsMissingMeta,
        keywordRowsMissingMeta: snapshot.ftsOwnership.keywordRowsMissingMeta
      }
    )
  )

  const taskHistoryRows = getRowCount(snapshot.tables.indexedSourceTaskState)
  const taskHistoryStoreStatus = !hasTable(snapshot, 'indexedSourceTaskState')
    ? 'warning'
    : taskHistoryRows > 0
      ? 'passed'
      : 'warning'
  checks.push(
    createCheck(
      'task-history-store',
      taskHistoryStoreStatus,
      !hasTable(snapshot, 'indexedSourceTaskState')
        ? 'Indexed source task state table is missing; durable diagnostics history will not survive restart.'
        : taskHistoryRows > 0
          ? 'Indexed source task state table has durable diagnostics history rows.'
          : 'Indexed source task state table exists but has no durable diagnostics history rows yet.',
      {
        rows: taskHistoryRows,
        evidence: taskHistoryRows > 0 ? 'durable-history-present' : 'durable-history-empty'
      }
    )
  )

  const failedChecks = checks.filter((check) => check.status === 'failed').map((check) => check.id)
  const scanProgressSourceScope = failedChecks.some((id) => id.startsWith('scan-progress'))
    ? 'blocked'
    : scanProgressSourceScoped
      ? 'ready'
      : 'needs-migration'
  const sqliteFtsOwnership =
    missingTables.length > 0 ||
    snapshot.ftsOwnership.sourceIndexedRows !== snapshot.ftsOwnership.filesRows ||
    snapshot.ftsOwnership.orphanKeywordRows > 0 ||
    snapshot.ftsOwnership.orphanMetaRows > 0 ||
    snapshot.ftsOwnership.searchIndexRowsMissingMeta > 0 ||
    snapshot.ftsOwnership.keywordRowsMissingMeta > 0
      ? 'blocked'
      : 'needs-confirmation'

  const nextActions = buildNextActions({
    scanProgressSourceScoped,
    missingTables,
    failedChecks,
    snapshot
  })
  const migrationDryRun = buildMigrationDryRun({
    scanProgressSourceScoped,
    missingTables,
    failedChecks,
    snapshot
  })

  return {
    schemaVersion: SEARCH_INDEX_MIGRATION_PREFLIGHT_SCHEMA_VERSION,
    generatedAt: snapshot.generatedAt,
    sourceId: snapshot.sourceId,
    destructiveActions: false,
    migrationReadiness: {
      sqliteFtsOwnership,
      scanProgressSourceScope
    },
    gate: {
      passed: failedChecks.length === 0,
      failedChecks
    },
    checks,
    migrationDryRun,
    nextActions,
    snapshot
  }
}

function buildMigrationDryRun(input: {
  scanProgressSourceScoped: boolean
  missingTables: Array<keyof SearchIndexMigrationPreflightSnapshot['tables']>
  failedChecks: string[]
  snapshot: SearchIndexMigrationPreflightSnapshot
}): SearchIndexMigrationDryRunPlan {
  const scanProgressRows = getRowCount(input.snapshot.tables.scanProgress)
  const searchIndexRows = getRowCount(input.snapshot.tables.searchIndex)
  const keywordRows = getRowCount(input.snapshot.tables.keywordMappings)
  const metaRows = getRowCount(input.snapshot.tables.searchIndexMeta)
  const missingRequiredTables = input.missingTables.map(String)
  const scanProgressHygieneBlockers = [
    input.snapshot.scanProgress.blankPathRows > 0 ? 'scan_progress blank path rows' : '',
    input.snapshot.scanProgress.invalidTimestampRows > 0
      ? 'scan_progress invalid timestamp rows'
      : '',
    (input.snapshot.scanProgress.duplicateSourcePathRows ?? 0) > 0
      ? 'scan_progress duplicate source/path rows'
      : ''
  ].filter(Boolean)
  const ownershipBlockers = [
    input.snapshot.ftsOwnership.sourceIndexedRows !== input.snapshot.ftsOwnership.filesRows
      ? 'source indexed rows differ from files rows'
      : '',
    input.snapshot.ftsOwnership.orphanKeywordRows > 0 ? 'orphan keyword_mappings rows' : '',
    input.snapshot.ftsOwnership.orphanMetaRows > 0 ? 'orphan search_index_meta rows' : '',
    input.snapshot.ftsOwnership.searchIndexRowsMissingMeta > 0
      ? 'search_index rows missing metadata'
      : '',
    input.snapshot.ftsOwnership.keywordRowsMissingMeta > 0
      ? 'keyword_mappings rows missing metadata'
      : '',
    ...missingRequiredTables.map((table) => `missing required table: ${table}`)
  ].filter(Boolean)

  const steps: SearchIndexMigrationDryRunStep[] = [
    {
      id: 'scan-progress-source-scope',
      status:
        scanProgressHygieneBlockers.length > 0
          ? 'blocked'
          : input.scanProgressSourceScoped
            ? 'not-needed'
            : 'manual-approval-required',
      summary: input.scanProgressSourceScoped
        ? 'scan_progress is already source-scoped; no schema rewrite is needed.'
        : 'Would migrate scan_progress from path-only rows to source-scoped rows owned by the selected source.',
      writes: false,
      requiresSchemaChange: !input.scanProgressSourceScoped,
      requiresDataRewrite: !input.scanProgressSourceScoped && scanProgressRows > 0,
      estimatedRows: scanProgressRows,
      rollback:
        'Keep a pre-migration scan_progress snapshot, restore path-only rows or force provider-scoped full rescan if rollback is required.',
      verification: [
        'Run the controlled runScanProgressSourceScopeMigration helper only after approval.',
        'Re-run preflight and expect scanProgressSourceScope=ready.',
        'Verify source/path duplicate rows are zero after migration.',
        'Verify Settings diagnostics does not report cross-source progress contamination.'
      ],
      ...(scanProgressHygieneBlockers.length > 0 ? { blockers: scanProgressHygieneBlockers } : {})
    },
    {
      id: 'sqlite-fts-ownership',
      status: ownershipBlockers.length > 0 ? 'blocked' : 'manual-approval-required',
      summary:
        'Would confirm SearchIndexService/SearchIndexWorker/runtime store ownership before changing durable FTS write boundaries.',
      writes: false,
      requiresSchemaChange: false,
      requiresDataRewrite: ownershipBlockers.length > 0,
      estimatedRows: searchIndexRows + keywordRows + metaRows,
      rollback:
        'Retain current search_index and keyword_mappings until migration evidence passes; on failure, clear provider-scoped index and schedule full rescan.',
      verification: [
        'Compare provider row parity before and after migration.',
        'Verify keyword_mappings orphan count is zero.',
        'Verify search_index_meta coverage or schedule provider-scoped reindex evidence.',
        'Attach sqlite-runtime-profile PRAGMA evidence to review journal mode, busy timeout, and DB size risk.'
      ],
      ...(ownershipBlockers.length > 0 ? { blockers: ownershipBlockers } : {})
    },
    {
      id: 'legacy-file-fts-decision',
      status: input.snapshot.tables.fileFts.exists ? 'ready' : 'not-needed',
      summary: input.snapshot.tables.fileFts.exists
        ? 'R3 retains legacy file_fts unchanged for compatibility; migrate/drop/rebuild is out of this migration batch.'
        : 'legacy file_fts is absent; no legacy FTS retirement decision is needed.',
      writes: false,
      requiresSchemaChange: false,
      requiresDataRewrite: false,
      estimatedRows: 0,
      rollback: 'No rollback is needed for file_fts in R3 because the table is not modified.',
      verification: [
        'Verify file search still uses search_index provider rows.',
        'Verify no R3 migration step drops, rebuilds, or rewrites legacy file_fts rows.'
      ]
    },
    {
      id: 'durable-history-evidence',
      status: !input.snapshot.tables.indexedSourceTaskState.exists
        ? 'blocked'
        : getRowCount(input.snapshot.tables.indexedSourceTaskState) > 0
          ? 'ready'
          : 'manual-approval-required',
      summary: !input.snapshot.tables.indexedSourceTaskState.exists
        ? 'indexed_source_task_state is missing and must be created by normal app DB migrations before claiming durable history evidence.'
        : getRowCount(input.snapshot.tables.indexedSourceTaskState) > 0
          ? 'indexed_source_task_state has durable recent task diagnostics rows.'
          : 'indexed_source_task_state exists but has no rows; capture natural recent task evidence before claiming durable history is complete.',
      writes: false,
      requiresSchemaChange: !input.snapshot.tables.indexedSourceTaskState.exists,
      requiresDataRewrite: false,
      estimatedRows: getRowCount(input.snapshot.tables.indexedSourceTaskState),
      rollback:
        'Task history is diagnostic-only; preserve current runtime diagnostics and avoid deleting persisted state during rollback.',
      verification: [
        'Run focused task-state store tests.',
        'Capture packaged Settings diagnostics evidence showing recent task chips after restart.',
        'Verify indexed_source_task_state row count is greater than zero for the target profile.'
      ],
      ...(!input.snapshot.tables.indexedSourceTaskState.exists
        ? { blockers: ['missing indexed_source_task_state table'] }
        : {})
    }
  ]

  return {
    mode: 'read-only',
    destructiveActions: false,
    requiresApproval: steps.some((step) => step.status === 'manual-approval-required'),
    estimatedRowsTouched: steps.reduce((total, step) => total + step.estimatedRows, 0),
    steps
  }
}

function buildNextActions(input: {
  scanProgressSourceScoped: boolean
  missingTables: Array<keyof SearchIndexMigrationPreflightSnapshot['tables']>
  failedChecks: string[]
  snapshot: SearchIndexMigrationPreflightSnapshot
}): string[] {
  const actions: string[] = []

  if (input.missingTables.length > 0) {
    actions.push(
      'Run normal app DB migrations or repair missing required tables before R3 migration.'
    )
  }
  if (!input.scanProgressSourceScoped) {
    actions.push(
      'Design scan_progress source-scoped migration with dual-read/backfill and rollback plan.'
    )
  }
  if (input.snapshot.ftsOwnership.orphanKeywordRows > 0) {
    actions.push('Clean or rebuild orphan keyword_mappings before changing FTS ownership.')
  }
  if (input.snapshot.ftsOwnership.sourceIndexedRows !== input.snapshot.ftsOwnership.filesRows) {
    actions.push('Repair provider row parity or schedule provider-scoped reindex evidence.')
  }
  if (
    input.snapshot.ftsOwnership.orphanMetaRows > 0 ||
    input.snapshot.ftsOwnership.searchIndexRowsMissingMeta > 0 ||
    input.snapshot.ftsOwnership.keywordRowsMissingMeta > 0
  ) {
    actions.push('Refresh search_index_meta coverage or schedule provider-scoped reindex evidence.')
  }
  if (input.snapshot.tables.fileFts.exists) {
    actions.push(
      'Retain legacy file_fts unchanged in R3; handle any retirement in a separate high-risk migration batch.'
    )
  }
  if (
    input.snapshot.tables.indexedSourceTaskState.exists &&
    getRowCount(input.snapshot.tables.indexedSourceTaskState) === 0
  ) {
    actions.push(
      'Capture natural recent task Settings evidence after restart before claiming durable job history is complete.'
    )
  }
  if (input.failedChecks.length === 0) {
    actions.push(
      'Attach this preflight report to the SQLite/FTS and scan_progress migration approval request.'
    )
  }

  return actions
}
