import type { DbUtils } from '../../../../../db/utils'
import type { IndexedSourceResetRequest, IndexedSourceResetResult } from '@talex-touch/utils/search'
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

  constructor(deps: FileProviderRuntimeResetServiceDeps) {
    this.sourceId = deps.sourceId
    this.getDbUtils = deps.getDbUtils
    this.removeSearchIndexByProvider = deps.removeSearchIndexByProvider
    this.withDbWrite = deps.withDbWrite
    this.logInfo = deps.logInfo
  }

  async reset(input: FileProviderRuntimeResetRequest): Promise<IndexedSourceResetResult> {
    const startedAt = Date.now()
    const request = input.request
    const operationReasonPrefix = input.operationReasonPrefix ?? `file-index.${request.reason}`
    const clearSearchIndex = input.clearSearchIndex ?? request.clearSearchIndex
    const clearScanProgress = input.clearScanProgress ?? request.clearScanProgress
    let clearedSearchIndex = false
    let clearedScanProgress = false
    let scanProgressRows = 0

    if (clearSearchIndex) {
      await this.removeSearchIndexByProvider(
        this.sourceId,
        `${operationReasonPrefix}.remove-by-provider`
      )
      clearedSearchIndex = true
    }

    const dbUtils = this.getDbUtils()
    if (clearScanProgress !== false && dbUtils) {
      const db = dbUtils.getDb()
      const scanProgressCount = await db.select({ cnt: sql<number>`count(*)` }).from(scanProgress)
      scanProgressRows = scanProgressCount[0]?.cnt ?? 0
      if (scanProgressRows > 0) {
        await this.withDbWrite(`${operationReasonPrefix}.scan-progress-reset`, () =>
          db.delete(scanProgress)
        )
        clearedScanProgress = true
      }
    }

    const result = {
      sourceId: request.sourceId,
      reason: request.reason,
      clearedSearchIndex,
      clearedScanProgress,
      scanProgressRows,
      startedAt,
      completedAt: Date.now()
    }

    this.logInfo('File index runtime state reset completed', result)
    return result
  }
}
