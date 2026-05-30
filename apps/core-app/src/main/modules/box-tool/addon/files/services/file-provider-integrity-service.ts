import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../../db/schema'
import type { FileProviderRuntimeResetResult } from './file-provider-runtime-reset-service'
import { performance } from 'node:perf_hooks'
import { IndexedSourceResetReasons } from '@talex-touch/utils/search'
import { eq, sql } from 'drizzle-orm'
import { files as filesSchema } from '../../../../../db/schema'

export interface FileProviderIntegritySnapshot {
  checkedAt: number
  ftsRows: number
  filesRows: number
  needsRebuild: boolean
  clearedSearchIndex: boolean
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
    reason: 'integrity-repair'
    clearSearchIndex: boolean
    clearScanProgress: boolean
  }) => Promise<FileProviderRuntimeResetResult>
  withDbWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderIntegrityService {
  private readonly sourceId: string
  private readonly countSearchIndexByProvider: FileProviderIntegrityServiceDeps['countSearchIndexByProvider']
  private readonly resetRuntimeState: FileProviderIntegrityServiceDeps['resetRuntimeState']
  private readonly withDbWrite: FileProviderIntegrityServiceDeps['withDbWrite']
  private readonly logInfo: FileProviderIntegrityServiceDeps['logInfo']

  constructor(deps: FileProviderIntegrityServiceDeps) {
    this.sourceId = deps.sourceId
    this.countSearchIndexByProvider = deps.countSearchIndexByProvider
    this.resetRuntimeState = deps.resetRuntimeState
    this.withDbWrite = deps.withDbWrite
    this.logInfo = deps.logInfo
  }

  async check(db: LibSQLDatabase<typeof schema>): Promise<FileProviderIntegritySnapshot> {
    const start = performance.now()
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

    const needsRebuild = filesCount > 0 && (ftsCount === 0 || ftsCount < filesCount * 0.8)
    let resetResult: FileProviderRuntimeResetResult | null = null
    let orphanedKeywordsRemoved = 0

    if (needsRebuild) {
      this.logInfo(
        `FTS5 index inconsistency detected (fts=${ftsCount}, files=${filesCount}) — clearing scan_progress for full re-scan`
      )

      resetResult = await this.resetRuntimeState({
        reason: IndexedSourceResetReasons.IntegrityRepair,
        clearSearchIndex: ftsCount > 0,
        clearScanProgress: true
      })
    } else if (ftsCount > 0) {
      orphanedKeywordsRemoved = await this.removeOrphanedKeywords(db)
    }

    const snapshot = {
      checkedAt: Date.now(),
      ftsRows: ftsCount,
      filesRows: filesCount,
      needsRebuild,
      clearedSearchIndex: resetResult?.clearedSearchIndex ?? false,
      clearedScanProgress: resetResult?.clearedScanProgress ?? false,
      orphanedKeywordsRemoved,
      resetReason: resetResult?.reason ?? null,
      resetScanProgressRows: resetResult?.scanProgressRows ?? 0,
      durationMs: performance.now() - start
    }

    this.logInfo('Integrity check completed', {
      durationMs: snapshot.durationMs,
      needsRebuild,
      clearedSearchIndex: snapshot.clearedSearchIndex,
      clearedScanProgress: snapshot.clearedScanProgress,
      orphanedKeywordsRemoved
    })

    return snapshot
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
    await this.withDbWrite('file-index.integrity-keywords', () =>
      db.run(sql`
        DELETE FROM keyword_mappings
        WHERE provider_id = ${this.sourceId}
          AND item_id NOT IN (
            SELECT item_id FROM search_index WHERE provider = ${this.sourceId}
          )
      `)
    )

    return orphanCount
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}
