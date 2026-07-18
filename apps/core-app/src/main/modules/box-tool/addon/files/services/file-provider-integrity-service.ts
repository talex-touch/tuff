import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../../db/schema'
import type { IndexedSourceResetReason, IndexedSourceResetResult } from '@talex-touch/utils/search'
import {
  IndexedSourceIntegrityService,
  IndexedSourceResetReasons,
  mapIndexedSourceIntegritySnapshot,
  renameIndexedSourceIntegrityAdapterSnapshotFields
} from '@talex-touch/utils/search'
import { eq, sql } from 'drizzle-orm'
import { files as filesSchema } from '../../../../../db/schema'

export interface FileProviderIntegritySnapshot {
  checkedAt: number
  ftsRows: number
  filesRows: number
  needsRebuild: boolean
  clearedSearchIndex: boolean
  resetSearchIndexRows?: number
  clearedScanProgress: boolean
  orphanedKeywordsRemoved: number
  resetReason?: string | null
  resetScanProgressRows?: number
  durationMs: number
}

export interface FileProviderIntegrityServiceDeps {
  sourceId: string
  countSearchIndexByProvider: (
    providerId: string,
    reason: string,
    mutationLeaseId?: string
  ) => Promise<number>
  resetRuntimeState: (request: {
    reason: Extract<IndexedSourceResetReason, typeof IndexedSourceResetReasons.IntegrityRepair>
    clearSearchIndex: boolean
    clearScanProgress: boolean
  }) => Promise<IndexedSourceResetResult>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  cleanupSource: (sourceId: string, mutationLeaseId?: string) => Promise<number | unknown>
}

export class FileProviderIntegrityService {
  private readonly sourceId: string
  private readonly countSearchIndexByProvider: FileProviderIntegrityServiceDeps['countSearchIndexByProvider']
  private readonly resetRuntimeState: FileProviderIntegrityServiceDeps['resetRuntimeState']
  private readonly logInfo: FileProviderIntegrityServiceDeps['logInfo']
  private readonly cleanupSource: FileProviderIntegrityServiceDeps['cleanupSource']

  constructor(deps: FileProviderIntegrityServiceDeps) {
    this.sourceId = deps.sourceId
    this.countSearchIndexByProvider = deps.countSearchIndexByProvider
    this.resetRuntimeState = deps.resetRuntimeState
    this.logInfo = deps.logInfo
    this.cleanupSource = deps.cleanupSource
  }

  async check(
    db: LibSQLDatabase<typeof schema>,
    options: { repair?: boolean; mutationLeaseId?: string } = {}
  ): Promise<FileProviderIntegritySnapshot> {
    this.logInfo('Running cross-table integrity check')

    const ftsCount = await this.countSearchIndexByProvider(
      this.sourceId,
      'integrity.count',
      options.mutationLeaseId
    )
    await yieldToEventLoop()

    const fileCountResult = await db
      .select({ cnt: sql<number>`count(*)` })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'file'))
    const filesCount = fileCountResult[0]?.cnt ?? 0
    await yieldToEventLoop()

    this.logInfo('Integrity check: row counts', {
      ftsRows: ftsCount,
      filesRows: filesCount
    })

    const integrity = new IndexedSourceIntegrityService({
      resetRuntimeState: async (request) => {
        this.logInfo(
          `FTS5 index inconsistency detected (fts=${ftsCount}, files=${filesCount}) — clearing scan_progress for full re-scan`
        )
        return this.resetRuntimeState({
          reason: IndexedSourceResetReasons.IntegrityRepair,
          clearSearchIndex: request.clearSearchIndex,
          clearScanProgress: request.clearScanProgress
        })
      },
      cleanupOrphanedRecords: () => this.removeOrphanedKeywords(db, options.mutationLeaseId),
      now: () => Date.now()
    })
    const snapshot = await integrity.check({
      sourceId: this.sourceId,
      indexedRows: ftsCount,
      sourceRows: filesCount,
      resetReason: IndexedSourceResetReasons.IntegrityRepair,
      repair: options.repair
    })

    const fileSnapshot = renameIndexedSourceIntegrityAdapterSnapshotFields(
      mapIndexedSourceIntegritySnapshot(snapshot),
      {
        indexedRows: 'ftsRows',
        sourceRows: 'filesRows',
        orphanedRecordsRemoved: 'orphanedKeywordsRemoved'
      }
    )

    this.logInfo('Integrity check completed', {
      durationMs: fileSnapshot.durationMs,
      needsRebuild: fileSnapshot.needsRebuild,
      clearedSearchIndex: fileSnapshot.clearedSearchIndex,
      clearedScanProgress: fileSnapshot.clearedScanProgress,
      orphanedKeywordsRemoved: fileSnapshot.orphanedKeywordsRemoved
    })

    return fileSnapshot
  }

  private async removeOrphanedKeywords(
    _db: LibSQLDatabase<typeof schema>,
    mutationLeaseId?: string
  ): Promise<number> {
    await yieldToEventLoop()
    const cleanup = await this.cleanupSource(this.sourceId, mutationLeaseId)
    if (typeof cleanup === 'number') return cleanup
    return cleanup && typeof cleanup === 'object' && 'removedOrphanedKeywords' in cleanup
      ? Number(cleanup.removedOrphanedKeywords) || 0
      : 0
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
