import type { IndexedSourceResetRequest, IndexedSourceResetResult } from './indexing-source'

export interface IndexedSourceResetExecutorClearProgressResult {
  cleared: boolean
  rows?: number
}

export interface IndexedSourceResetExecutorInput {
  request: IndexedSourceResetRequest
  clearSearchIndex?: boolean
  clearScanProgress?: boolean
  operationReasonPrefix?: string
}

export interface IndexedSourceResetExecutorDeps {
  sourceId: string
  clearSearchIndex: (reason: string) => Promise<void>
  clearScanProgress: (reason: string) => Promise<IndexedSourceResetExecutorClearProgressResult>
  now?: () => number
}

export class IndexedSourceResetExecutorService {
  private readonly sourceId: string
  private readonly clearSearchIndex: IndexedSourceResetExecutorDeps['clearSearchIndex']
  private readonly clearScanProgress: IndexedSourceResetExecutorDeps['clearScanProgress']
  private readonly now: () => number

  constructor(deps: IndexedSourceResetExecutorDeps) {
    this.sourceId = deps.sourceId
    this.clearSearchIndex = deps.clearSearchIndex
    this.clearScanProgress = deps.clearScanProgress
    this.now = deps.now ?? Date.now
  }

  async reset(input: IndexedSourceResetExecutorInput): Promise<IndexedSourceResetResult> {
    const startedAt = this.now()
    const request = input.request
    const operationReasonPrefix = input.operationReasonPrefix ?? `indexed-source.${request.reason}`
    const shouldClearSearchIndex = input.clearSearchIndex ?? request.clearSearchIndex === true
    const shouldClearScanProgress = input.clearScanProgress ?? request.clearScanProgress !== false
    let clearedSearchIndex = false
    let clearedScanProgress = false
    let scanProgressRows = 0

    if (shouldClearSearchIndex) {
      await this.clearSearchIndex(`${operationReasonPrefix}.remove-by-provider`)
      clearedSearchIndex = true
    }

    if (shouldClearScanProgress) {
      const result = await this.clearScanProgress(`${operationReasonPrefix}.scan-progress-reset`)
      clearedScanProgress = result.cleared
      scanProgressRows = result.rows ?? 0
    }

    return {
      sourceId: request.sourceId || this.sourceId,
      reason: request.reason,
      clearedSearchIndex,
      clearedScanProgress,
      scanProgressRows,
      startedAt,
      completedAt: this.now()
    }
  }
}
