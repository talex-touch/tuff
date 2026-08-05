import type { DbUtils } from '../../../../../db/utils'
import type { IndexedSourceResetRequest, IndexedSourceResetResult } from '@talex-touch/utils/search'
import {
  expandIndexedSourceProgressPaths,
  IndexedSourceResetExecutorService,
  resolveIndexedSourceProgressStoreClearDecision
} from '@talex-touch/utils/search'
import { inArray, sql } from 'drizzle-orm'
import { scanProgress } from '../../../../../db/schema'
import {
  buildScanProgressDeleteStatement,
  buildScanProgressPathInClause,
  resolveScanProgressSchemaShape
} from '../../../search-engine/scan-progress-schema'

export interface FileProviderRuntimeResetRequest {
  request: IndexedSourceResetRequest
  clearSearchIndex?: boolean
  clearScanProgress?: boolean
  operationReasonPrefix?: string
}

export interface FileProviderRuntimeResetServiceDeps {
  sourceId: string
  getDbUtils: () => DbUtils | null
  normalizePath?: (path: string) => string
  getScanProgressPaths: () => string[]
  withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  /** See FileProviderScanProgressServiceDeps — resolved per call, never captured. */
  isSearchSplitEnabled?: () => boolean
  /** Worker-forwarded write path for the split topology (sole writer of search-index.db). */
  execSearchIndexWrite?: (
    statements: Array<{ sql: string; args: unknown[] }>,
    mode?: 'single' | 'transaction'
  ) => Promise<unknown>
}

export class FileProviderRuntimeResetService {
  private readonly sourceId: string
  private readonly getDbUtils: FileProviderRuntimeResetServiceDeps['getDbUtils']
  private readonly normalizePath: NonNullable<FileProviderRuntimeResetServiceDeps['normalizePath']>
  private readonly getScanProgressPaths: FileProviderRuntimeResetServiceDeps['getScanProgressPaths']
  private readonly withDbWrite: FileProviderRuntimeResetServiceDeps['withDbWrite']
  private readonly logInfo: FileProviderRuntimeResetServiceDeps['logInfo']
  private readonly isSearchSplitEnabled: NonNullable<
    FileProviderRuntimeResetServiceDeps['isSearchSplitEnabled']
  >
  private readonly execSearchIndexWrite: FileProviderRuntimeResetServiceDeps['execSearchIndexWrite']
  private readonly executor: IndexedSourceResetExecutorService

  constructor(deps: FileProviderRuntimeResetServiceDeps) {
    this.sourceId = deps.sourceId
    this.getDbUtils = deps.getDbUtils
    this.normalizePath = deps.normalizePath ?? ((path) => path)
    this.getScanProgressPaths = deps.getScanProgressPaths
    this.withDbWrite = deps.withDbWrite
    this.logInfo = deps.logInfo
    this.isSearchSplitEnabled = deps.isSearchSplitEnabled ?? (() => false)
    this.execSearchIndexWrite = deps.execSearchIndexWrite
    this.executor = new IndexedSourceResetExecutorService({
      sourceId: this.sourceId,
      operationReasonNamespace: 'file-index',
      clearSearchIndex: async () => {
        throw new Error('FILE_PROVIDER_SHARED_SEARCH_RESET_UNAVAILABLE')
      },
      clearScanProgress: (reason) => this.clearScanProgress(reason)
    })
  }

  async reset(input: FileProviderRuntimeResetRequest): Promise<IndexedSourceResetResult> {
    const result = await this.executor.reset(input)

    this.logInfo('File index runtime state reset completed', { ...result })
    return result
  }

  private async clearScanProgress(reason: string): Promise<{ cleared: boolean; rows: number }> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return { cleared: false, rows: 0 }
    }

    // This clear is the integrity self-heal's lever ("clear scan_progress to
    // force a full re-scan"), so both the count read and the delete must hit
    // the LIVE home: the worker-owned search-index.db when the split is on
    // (read via the split-aware handle, delete forwarded to the worker — the
    // file's sole writer), the primary otherwise. Counting/clearing the
    // primary while the live rows sit in the search file would leave the
    // re-scan gate closed and the self-heal inert.
    const readDb = dbUtils.getFileIndexReadDb()
    const paths = this.getScanProgressResetPaths()
    if (paths.length === 0) {
      return { cleared: false, rows: 0 }
    }

    const shape = await resolveScanProgressSchemaShape(readDb)
    const scanProgressCount = shape.sourceScoped
      ? await readDb.all<{ cnt: number }>(sql`
          SELECT count(*) AS cnt
          FROM scan_progress
          WHERE source_id = ${this.sourceId}
            AND path IN ${buildScanProgressPathInClause(paths)}
        `)
      : await readDb
          .select({ cnt: sql<number>`count(*)` })
          .from(scanProgress)
          .where(inArray(scanProgress.path, paths))
    const clearDecision = resolveIndexedSourceProgressStoreClearDecision(scanProgressCount[0]?.cnt)
    if (!clearDecision.shouldClear) {
      return clearDecision.result
    }

    if (this.isSearchSplitEnabled()) {
      if (!this.execSearchIndexWrite) {
        throw new Error('SCAN_PROGRESS_RESET_REQUIRES_SEARCH_INDEX_WRITER')
      }
      const statement = buildScanProgressDeleteStatement({
        sourceScoped: shape.sourceScoped,
        sourceId: this.sourceId,
        paths
      })
      if (statement) {
        await this.execSearchIndexWrite([statement], 'single')
      }
      return clearDecision.result
    }

    const db = dbUtils.getDb()
    await this.withDbWrite(reason, () =>
      shape.sourceScoped
        ? db.run(sql`
            DELETE FROM scan_progress
            WHERE source_id = ${this.sourceId}
              AND path IN ${buildScanProgressPathInClause(paths)}
          `)
        : db.delete(scanProgress).where(inArray(scanProgress.path, paths))
    )
    return clearDecision.result
  }

  private getScanProgressResetPaths(): string[] {
    return expandIndexedSourceProgressPaths(this.getScanProgressPaths(), this.normalizePath, {
      dropWhenNormalizedEmpty: true
    })
  }
}
