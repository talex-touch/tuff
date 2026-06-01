import type { DbUtils } from '../../../../../db/utils'
import type { IndexedSourceResetRequest, IndexedSourceResetResult } from '@talex-touch/utils/search'
import {
  IndexedSourceResetExecutorService,
  resolveIndexedSourceProgressStoreClearDecision
} from '@talex-touch/utils/search'
import { sql } from 'drizzle-orm'
import { scanProgress } from '../../../../../db/schema'

export interface FileProviderRuntimeResetRequest {
  request: IndexedSourceResetRequest
  clearSearchIndex?: boolean
  clearScanProgress?: boolean
  operationReasonPrefix?: string
}

export interface FileProviderRuntimeResetServiceDeps {
  sourceId: string
  getDbUtils: () => DbUtils | null
  removeSearchIndexByProvider: (providerId: string, reason: string) => Promise<void>
  withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderRuntimeResetService {
  private readonly sourceId: string
  private readonly getDbUtils: FileProviderRuntimeResetServiceDeps['getDbUtils']
  private readonly removeSearchIndexByProvider: FileProviderRuntimeResetServiceDeps['removeSearchIndexByProvider']
  private readonly withDbWrite: FileProviderRuntimeResetServiceDeps['withDbWrite']
  private readonly logInfo: FileProviderRuntimeResetServiceDeps['logInfo']
  private readonly executor: IndexedSourceResetExecutorService

  constructor(deps: FileProviderRuntimeResetServiceDeps) {
    this.sourceId = deps.sourceId
    this.getDbUtils = deps.getDbUtils
    this.removeSearchIndexByProvider = deps.removeSearchIndexByProvider
    this.withDbWrite = deps.withDbWrite
    this.logInfo = deps.logInfo
    this.executor = new IndexedSourceResetExecutorService({
      sourceId: this.sourceId,
      operationReasonNamespace: 'file-index',
      clearSearchIndex: (reason) => this.removeSearchIndexByProvider(this.sourceId, reason),
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
    const scanProgressCount = await db.select({ cnt: sql<number>`count(*)` }).from(scanProgress)
    const clearDecision = resolveIndexedSourceProgressStoreClearDecision(scanProgressCount[0]?.cnt)
    if (!clearDecision.shouldClear) {
      return clearDecision.result
    }

    await this.withDbWrite(reason, () => db.delete(scanProgress))
    return clearDecision.result
  }
}
