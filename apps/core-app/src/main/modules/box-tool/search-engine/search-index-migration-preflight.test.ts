import { describe, expect, it } from 'vitest'
import {
  buildSearchIndexMigrationPreflightReport,
  SEARCH_INDEX_MIGRATION_PREFLIGHT_SCHEMA_VERSION,
  type SearchIndexMigrationPreflightSnapshot
} from './search-index-migration-preflight'

function table(
  input: {
    exists?: boolean
    rowCount?: number
    columns?: Array<{ name: string; primaryKeyOrder?: number }>
  } = {}
) {
  return {
    exists: input.exists ?? true,
    rowCount: input.rowCount ?? 0,
    columns: input.columns ?? []
  }
}

function buildSnapshot(
  override: Partial<SearchIndexMigrationPreflightSnapshot> = {}
): SearchIndexMigrationPreflightSnapshot {
  return {
    generatedAt: '2026-06-24T00:00:00.000Z',
    sourceId: 'file-provider',
    tables: {
      files: table({ rowCount: 2 }),
      fileExtensions: table(),
      fileIndexProgress: table(),
      scanProgress: table({
        rowCount: 2,
        columns: [{ name: 'path', primaryKeyOrder: 1 }, { name: 'last_scanned' }]
      }),
      fileFts: table({ exists: false }),
      searchIndex: table({ rowCount: 2 }),
      searchIndexMeta: table({ rowCount: 2 }),
      keywordMappings: table({ rowCount: 4 }),
      indexedSourceTaskState: table({ rowCount: 1 })
    },
    scanProgress: {
      sourceIdColumn: false,
      primaryKeyColumns: ['path'],
      blankPathRows: 0,
      invalidTimestampRows: 0,
      duplicateSourcePathRows: null,
      sharedPathAcrossSourcesRows: null
    },
    ftsOwnership: {
      searchIndexShadowTables: {
        search_index_data: true,
        search_index_idx: true,
        search_index_content: true,
        search_index_docsize: true,
        search_index_config: true
      },
      searchIndexByProvider: [{ providerId: 'file-provider', rows: 2 }],
      keywordMappingsByProvider: [{ providerId: 'file-provider', rows: 4 }],
      searchIndexMetaByProvider: [{ providerId: 'file-provider', rows: 2 }],
      sourceIndexedRows: 2,
      sourceKeywordRows: 4,
      sourceMetaRows: 2,
      filesRows: 2,
      fileFtsRows: null,
      orphanKeywordRows: 0,
      orphanMetaRows: 0,
      searchIndexRowsMissingMeta: 0,
      keywordRowsMissingMeta: 0
    },
    ...override
  }
}

describe('search index migration preflight', () => {
  it('marks path-only scan_progress as a required source-scope migration', () => {
    const report = buildSearchIndexMigrationPreflightReport(buildSnapshot())

    expect(report.schemaVersion).toBe(SEARCH_INDEX_MIGRATION_PREFLIGHT_SCHEMA_VERSION)
    expect(report.destructiveActions).toBe(false)
    expect(report.gate.passed).toBe(true)
    expect(report.migrationReadiness).toMatchObject({
      sqliteFtsOwnership: 'needs-confirmation',
      scanProgressSourceScope: 'needs-migration'
    })
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'scan-progress-source-scope',
        status: 'warning'
      })
    )
    expect(report.nextActions).toContain(
      'Design scan_progress source-scoped migration with dual-read/backfill and rollback plan.'
    )
    expect(report.migrationDryRun).toMatchObject({
      mode: 'read-only',
      destructiveActions: false,
      requiresApproval: true
    })
    expect(report.migrationDryRun.steps).toContainEqual(
      expect.objectContaining({
        id: 'scan-progress-source-scope',
        status: 'manual-approval-required',
        writes: false,
        requiresSchemaChange: true,
        requiresDataRewrite: true,
        estimatedRows: 2
      })
    )
  })

  it('blocks migration readiness when required tables or keyword ownership are invalid', () => {
    const report = buildSearchIndexMigrationPreflightReport(
      buildSnapshot({
        tables: {
          ...buildSnapshot().tables,
          searchIndex: table({ exists: false })
        },
        ftsOwnership: {
          ...buildSnapshot().ftsOwnership,
          orphanKeywordRows: 3
        }
      })
    )

    expect(report.gate.passed).toBe(false)
    expect(report.gate.failedChecks).toEqual(['required-tables', 'keyword-orphans'])
    expect(report.migrationReadiness.sqliteFtsOwnership).toBe('blocked')
    expect(report.migrationDryRun.steps).toContainEqual(
      expect.objectContaining({
        id: 'sqlite-fts-ownership',
        status: 'blocked',
        blockers: expect.arrayContaining([
          'orphan keyword_mappings rows',
          'missing required table: searchIndex'
        ])
      })
    )
  })

  it('recognizes an already source-scoped clean scan_progress shape', () => {
    const report = buildSearchIndexMigrationPreflightReport(
      buildSnapshot({
        tables: {
          ...buildSnapshot().tables,
          scanProgress: table({
            rowCount: 2,
            columns: [
              { name: 'source_id', primaryKeyOrder: 1 },
              { name: 'path', primaryKeyOrder: 2 },
              { name: 'last_scanned' }
            ]
          })
        },
        scanProgress: {
          sourceIdColumn: true,
          primaryKeyColumns: ['source_id', 'path'],
          blankPathRows: 0,
          invalidTimestampRows: 0,
          duplicateSourcePathRows: 0,
          sharedPathAcrossSourcesRows: 1
        }
      })
    )

    expect(report.migrationReadiness.scanProgressSourceScope).toBe('ready')
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'scan-progress-source-scope',
        status: 'passed'
      })
    )
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'scan-progress-source-duplicates',
        status: 'passed'
      })
    )
    expect(report.migrationDryRun.steps).toContainEqual(
      expect.objectContaining({
        id: 'scan-progress-source-scope',
        status: 'not-needed',
        requiresSchemaChange: false,
        requiresDataRewrite: false
      })
    )
  })

  it('blocks the dry-run scan_progress step until unsafe source rows are cleaned', () => {
    const report = buildSearchIndexMigrationPreflightReport(
      buildSnapshot({
        scanProgress: {
          sourceIdColumn: false,
          primaryKeyColumns: ['path'],
          blankPathRows: 1,
          invalidTimestampRows: 2,
          duplicateSourcePathRows: null,
          sharedPathAcrossSourcesRows: null
        }
      })
    )

    expect(report.gate.failedChecks).toContain('scan-progress-data-hygiene')
    expect(report.migrationDryRun.steps).toContainEqual(
      expect.objectContaining({
        id: 'scan-progress-source-scope',
        status: 'blocked',
        blockers: expect.arrayContaining([
          'scan_progress blank path rows',
          'scan_progress invalid timestamp rows'
        ])
      })
    )
  })
})
