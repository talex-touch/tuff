import type { IndexedSourceResetReason, IndexedSourceResetResult } from './indexing-source'

export interface IndexedSourceIntegrityResetRequest {
  reason: IndexedSourceResetReason
  clearSearchIndex: boolean
  clearScanProgress: boolean
}

export interface IndexedSourceIntegritySnapshot {
  sourceId: string
  checkedAt: number
  indexedRows: number
  sourceRows: number
  needsRebuild: boolean
  clearedSearchIndex: boolean
  clearedScanProgress: boolean
  orphanedRecordsRemoved: number
  resetReason?: string | null
  resetScanProgressRows?: number
  durationMs: number
}

export interface IndexedSourceIntegrityCheckInput {
  sourceId: string
  indexedRows: number
  sourceRows: number
  resetReason: IndexedSourceResetReason
  minIndexedRowRatio?: number
  checkedAt?: number
}

export interface IndexedSourceIntegrityServiceDeps {
  resetRuntimeState: (request: IndexedSourceIntegrityResetRequest) => Promise<IndexedSourceResetResult>
  cleanupOrphanedRecords?: () => Promise<number>
  now?: () => number
}

const DEFAULT_MIN_INDEXED_ROW_RATIO = 0.8

export class IndexedSourceIntegrityService {
  private readonly resetRuntimeState: IndexedSourceIntegrityServiceDeps['resetRuntimeState']
  private readonly cleanupOrphanedRecords: IndexedSourceIntegrityServiceDeps['cleanupOrphanedRecords']
  private readonly now: () => number

  constructor(deps: IndexedSourceIntegrityServiceDeps) {
    this.resetRuntimeState = deps.resetRuntimeState
    this.cleanupOrphanedRecords = deps.cleanupOrphanedRecords
    this.now = deps.now ?? Date.now
  }

  async check(input: IndexedSourceIntegrityCheckInput): Promise<IndexedSourceIntegritySnapshot> {
    const startedAt = this.now()
    const indexedRows = normalizeCount(input.indexedRows)
    const sourceRows = normalizeCount(input.sourceRows)
    const minIndexedRowRatio = normalizeRatio(input.minIndexedRowRatio)
    const needsRebuild =
      sourceRows > 0 && (indexedRows === 0 || indexedRows < sourceRows * minIndexedRowRatio)
    let resetResult: IndexedSourceResetResult | null = null
    let orphanedRecordsRemoved = 0

    if (needsRebuild) {
      resetResult = await this.resetRuntimeState({
        reason: input.resetReason,
        clearSearchIndex: indexedRows > 0,
        clearScanProgress: true
      })
    } else if (indexedRows > 0 && this.cleanupOrphanedRecords) {
      orphanedRecordsRemoved = normalizeCount(await this.cleanupOrphanedRecords())
    }

    const completedAt = this.now()

    return {
      sourceId: input.sourceId,
      checkedAt: input.checkedAt ?? completedAt,
      indexedRows,
      sourceRows,
      needsRebuild,
      clearedSearchIndex: resetResult?.clearedSearchIndex ?? false,
      clearedScanProgress: resetResult?.clearedScanProgress ?? false,
      orphanedRecordsRemoved,
      resetReason: resetResult?.reason ?? null,
      resetScanProgressRows: resetResult?.scanProgressRows ?? 0,
      durationMs: Math.max(0, completedAt - startedAt)
    }
  }
}

function normalizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function normalizeRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1) {
    return DEFAULT_MIN_INDEXED_ROW_RATIO
  }

  return value
}
