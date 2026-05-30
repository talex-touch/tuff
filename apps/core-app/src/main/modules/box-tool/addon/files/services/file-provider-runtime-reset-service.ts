import type { DbUtils } from '../../../../../db/utils'
import { sql } from 'drizzle-orm'
import { scanProgress } from '../../../../../db/schema'

export interface FileProviderRuntimeResetResult {
  reason: string
  clearedSearchIndex: boolean
  clearedScanProgress: boolean
  scanProgressRows: number
  completedAt: number
}

export interface FileProviderRuntimeResetRequest {
  reason: string
  clearSearchIndex?: boolean
  clearScanProgress?: boolean
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

  async reset(request: FileProviderRuntimeResetRequest): Promise<FileProviderRuntimeResetResult> {
    const clearScanProgress = request.clearScanProgress !== false
    let clearedSearchIndex = false
    let clearedScanProgress = false
    let scanProgressRows = 0

    if (request.clearSearchIndex) {
      await this.removeSearchIndexByProvider(this.sourceId, `${request.reason}.remove-by-provider`)
      clearedSearchIndex = true
    }

    const dbUtils = this.getDbUtils()
    if (clearScanProgress && dbUtils) {
      const db = dbUtils.getDb()
      const scanProgressCount = await db.select({ cnt: sql<number>`count(*)` }).from(scanProgress)
      scanProgressRows = scanProgressCount[0]?.cnt ?? 0
      if (scanProgressRows > 0) {
        await this.withDbWrite(`${request.reason}.scan-progress-reset`, () =>
          db.delete(scanProgress)
        )
        clearedScanProgress = true
      }
    }

    const result = {
      reason: request.reason,
      clearedSearchIndex,
      clearedScanProgress,
      scanProgressRows,
      completedAt: Date.now()
    }

    this.logInfo('File index runtime state reset completed', result)
    return result
  }
}
