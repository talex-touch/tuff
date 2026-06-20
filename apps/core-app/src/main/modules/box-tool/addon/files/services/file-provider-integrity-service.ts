import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../../db/schema'
import type { IndexedSourceResetReason, IndexedSourceResetResult } from '@talex-touch/utils/search'
import type { SearchIndexWorkerClient } from '../../../search-engine/workers/search-index-worker-client'
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
  countSearchIndexByProvider: (providerId: string, reason: string) => Promise<number>
  resetRuntimeState: (request: {
    reason: Extract<IndexedSourceResetReason, typeof IndexedSourceResetReasons.IntegrityRepair>
    clearSearchIndex: boolean
    clearScanProgress: boolean
  }) => Promise<IndexedSourceResetResult>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  searchIndexWorker: SearchIndexWorkerClient
}

export class FileProviderIntegrityService {
  private readonly sourceId: string
  private readonly countSearchIndexByProvider: FileProviderIntegrityServiceDeps['countSearchIndexByProvider']
  private readonly resetRuntimeState: FileProviderIntegrityServiceDeps['resetRuntimeState']
  private readonly logInfo: FileProviderIntegrityServiceDeps['logInfo']
  private readonly searchIndexWorker: SearchIndexWorkerClient

  constructor(deps: FileProviderIntegrityServiceDeps) {
    this.sourceId = deps.sourceId
    this.countSearchIndexByProvider = deps.countSearchIndexByProvider
    this.resetRuntimeState = deps.resetRuntimeState
    this.logInfo = deps.logInfo
    this.searchIndexWorker = deps.searchIndexWorker
  }

  async check(db: LibSQLDatabase<typeof schema>): Promise<FileProviderIntegritySnapshot> {
    this.logInfo('Running cross-table integrity check')

    const ftsCount = await this.countSearchIndexByProvider(this.sourceId, 'integrity.count')
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
      cleanupOrphanedRecords: () => this.removeOrphanedKeywords(db),
      now: () => Date.now()
    })
    const snapshot = await integrity.check({
      sourceId: this.sourceId,
      indexedRows: ftsCount,
      sourceRows: filesCount,
      resetReason: IndexedSourceResetReasons.IntegrityRepair
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

  private async removeOrphanedKeywords(db: LibSQLDatabase<typeof schema>): Promise<number> {
    await yieldToEventLoop()
    const orphanedKeywords = await db.all<{ cnt: number }>(sql`
      SELECT count(*) as cnt FROM keyword_mappings km
      WHERE km.provider_id = ${this.sourceId}
        AND km.item_id NOT IN (
          SELECT item_id FROM search_index WHERE provider = ${this.sourceId}
        )
    `)
    await yieldToEventLoop()
    const orphanCount = orphanedKeywords[0]?.cnt ?? 0
    if (orphanCount === 0) {
      return 0
    }

    this.logInfo(`Removing ${orphanCount} orphaned keyword_mappings entries`)
    // Phase 3: Delegate keyword cleanup to worker (single-writer architecture)
    const deletedCount = await this.searchIndexWorker.cleanupOrphanKeywords(this.sourceId)

    return deletedCount
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
