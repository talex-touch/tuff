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
  removeSearchIndexByProvider: (
    providerId: string,
    reason: string
  ) => Promise<{ removedIndexedItems: number }>
  getScanProgressPaths: () => string[]
  withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderRuntimeResetService {
  private readonly sourceId: string
  private readonly getDbUtils: FileProviderRuntimeResetServiceDeps['getDbUtils']
  private readonly normalizePath: NonNullable<FileProviderRuntimeResetServiceDeps['normalizePath']>
  private readonly removeSearchIndexByProvider: FileProviderRuntimeResetServiceDeps['removeSearchIndexByProvider']
  private readonly getScanProgressPaths: FileProviderRuntimeResetServiceDeps['getScanProgressPaths']
  private readonly withDbWrite: FileProviderRuntimeResetServiceDeps['withDbWrite']
  private readonly logInfo: FileProviderRuntimeResetServiceDeps['logInfo']
  private readonly executor: IndexedSourceResetExecutorService

  constructor(deps: FileProviderRuntimeResetServiceDeps) {
    this.sourceId = deps.sourceId
    this.getDbUtils = deps.getDbUtils
    this.normalizePath = deps.normalizePath ?? ((path) => path)
    this.removeSearchIndexByProvider = deps.removeSearchIndexByProvider
    this.getScanProgressPaths = deps.getScanProgressPaths
    this.withDbWrite = deps.withDbWrite
    this.logInfo = deps.logInfo
    this.executor = new IndexedSourceResetExecutorService({
      sourceId: this.sourceId,
      operationReasonNamespace: 'file-index',
      clearSearchIndex: async (reason) => {
        const result = await this.removeSearchIndexByProvider(this.sourceId, reason)
        return {
          cleared: true,
          rows: result.removedIndexedItems
        }
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

    const db = dbUtils.getDb()
    const paths = this.getScanProgressResetPaths()
    if (paths.length === 0) {
      return { cleared: false, rows: 0 }
    }

    const shape = await resolveScanProgressSchemaShape(db)
    const scanProgressCount = shape.sourceScoped
      ? await db.all<{ cnt: number }>(sql`
          SELECT count(*) AS cnt
          FROM scan_progress
          WHERE source_id = ${this.sourceId}
            AND path IN ${buildScanProgressPathInClause(paths)}
        `)
      : await db
          .select({ cnt: sql<number>`count(*)` })
          .from(scanProgress)
          .where(inArray(scanProgress.path, paths))
    const clearDecision = resolveIndexedSourceProgressStoreClearDecision(scanProgressCount[0]?.cnt)
    if (!clearDecision.shouldClear) {
      return clearDecision.result
    }

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
