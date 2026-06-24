import type { IndexedSourceEvidence } from '@talex-touch/utils/search'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import {
  expandIndexedSourceProgressPaths,
  filterIndexedSourceProgressPaths,
  IndexedSourceProgressEvidenceService,
  type IndexedSourceProgressStoreUpsertResult,
  IndexedSourceProgressStoreService,
  normalizeIndexedSourceProgressPaths,
  resolveIndexedScanEligibility
} from '@talex-touch/utils/search'
import { inArray, sql } from 'drizzle-orm'
import { scanProgress } from '../../../../../db/schema'
import {
  buildScanProgressPathInClause,
  resolveScanProgressSchemaShape
} from '../../../search-engine/scan-progress-schema'

export interface FileProviderIndexStatsForEvidence {
  totalFiles: number
  failedFiles: number
  skippedFiles: number
  completedFiles: number
  embeddingCompletedFiles: number
  embeddingRows: number
}

export interface FileProviderScanProgressSummary {
  totalRoots: number
  pendingRoots: number
  completedRoots: number
  lastScannedAt: number | null
}

export interface FileProviderScanProgressUpsertSnapshot extends IndexedSourceProgressStoreUpsertResult {
  reason: string
  checkedAt: number
}

export interface FileProviderScanProgressEvidenceInput {
  sourceId: string
  watchPaths: string[]
  pendingPermissionPaths?: string[]
  stats: FileProviderIndexStatsForEvidence
  isIndexingActive: boolean
  checkedAt?: number
}

export interface FileProviderScanProgressServiceDeps {
  sourceId?: string
  getDbUtils: () => DbUtils | null
  normalizePath?: (path: string) => string
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  getSearchIndexWorker: () => {
    upsertScanProgress: (
      paths: string[],
      lastScanned: string,
      sourceId?: string
    ) => Promise<number | void>
  }
}

export class FileProviderScanProgressService {
  private readonly sourceId: string
  private readonly getDbUtils: FileProviderScanProgressServiceDeps['getDbUtils']
  private readonly normalizePath: NonNullable<FileProviderScanProgressServiceDeps['normalizePath']>
  private readonly ensureSearchIndexWorkerReady: FileProviderScanProgressServiceDeps['ensureSearchIndexWorkerReady']
  private readonly getSearchIndexWorker: FileProviderScanProgressServiceDeps['getSearchIndexWorker']
  private readonly evidenceService = new IndexedSourceProgressEvidenceService()
  private readonly progressStore: IndexedSourceProgressStoreService
  private lastUpsertSnapshot: FileProviderScanProgressUpsertSnapshot | null = null

  constructor(deps: FileProviderScanProgressServiceDeps) {
    this.sourceId = deps.sourceId ?? 'file-provider'
    this.getDbUtils = deps.getDbUtils
    this.normalizePath = deps.normalizePath ?? ((path) => path)
    this.ensureSearchIndexWorkerReady = deps.ensureSearchIndexWorkerReady
    this.getSearchIndexWorker = deps.getSearchIndexWorker
    this.progressStore = new IndexedSourceProgressStoreService({
      loadCompletedPaths: () => this.loadCompletedPaths(),
      deleteCompletedPaths: (paths) => this.deleteCompletedPaths(paths),
      ensureReadyForUpsert: (reason) => this.ensureSearchIndexWorkerReady(reason),
      upsertCompletedPaths: (paths, completedAt) =>
        this.getSearchIndexWorker().upsertScanProgress(paths, completedAt, this.sourceId)
    })
  }

  async getSummary(watchPaths: string[]): Promise<FileProviderScanProgressSummary> {
    const scopedWatchPaths = filterIndexedSourceProgressPaths(watchPaths, this.normalizePath)
    const completedPaths = await this.getCompletedPaths(scopedWatchPaths)
    const normalizedWatchPaths = normalizeIndexedSourceProgressPaths(
      scopedWatchPaths,
      this.normalizePath
    )
    const normalizedCompletedPaths = new Set(
      normalizeIndexedSourceProgressPaths([...completedPaths], this.normalizePath)
    )
    const summary = await this.progressStore.summarizeRoots(
      normalizedWatchPaths,
      normalizedCompletedPaths,
      {
        isStoreAvailable: Boolean(this.getDbUtils())
      }
    )
    const lastScannedAt = await this.getLastScannedAt(scopedWatchPaths)
    const configuredRootCount = new Set(normalizedWatchPaths).size

    return {
      ...summary,
      completedRoots: Math.max(0, configuredRootCount - summary.pendingRoots),
      lastScannedAt
    }
  }

  async getCompletedPaths(watchPaths?: string[]): Promise<Set<string>> {
    const scopedWatchPaths = filterIndexedSourceProgressPaths(watchPaths ?? [], this.normalizePath)
    if (scopedWatchPaths.length > 0) {
      return this.loadCompletedPaths(scopedWatchPaths)
    }

    return this.progressStore.getCompletedPaths()
  }

  private async loadCompletedPaths(watchPaths?: string[]): Promise<Set<string>> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return new Set()
    }

    const db = dbUtils.getDb()
    const scopedPaths = expandIndexedSourceProgressPaths(watchPaths ?? [], this.normalizePath)
    const shape = await resolveScanProgressSchemaShape(db)
    if (shape.sourceScoped) {
      const completedScans =
        scopedPaths.length > 0
          ? await db.all<{ path: string }>(
              sql`
              SELECT path
              FROM scan_progress
              WHERE source_id = ${this.sourceId}
                AND path IN ${buildScanProgressPathInClause(scopedPaths)}
            `
            )
          : await db.all<{ path: string }>(
              sql`
              SELECT path
              FROM scan_progress
              WHERE source_id = ${this.sourceId}
            `
            )
      return new Set(completedScans.map((row) => row.path))
    }

    const query =
      scopedPaths.length > 0
        ? db
            .select({ path: scanProgress.path })
            .from(scanProgress)
            .where(inArray(scanProgress.path, scopedPaths))
        : db.select({ path: scanProgress.path }).from(scanProgress)
    const completedScans = await query
    return new Set(completedScans.map((row) => row.path))
  }

  private async getLastScannedAt(watchPaths: string[]): Promise<number | null> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return null
    }

    const db = dbUtils.getDb()
    const scopedPaths = expandIndexedSourceProgressPaths(watchPaths, this.normalizePath)
    const shape = await resolveScanProgressSchemaShape(db)
    const sourceScopedCompletedScans = shape.sourceScoped
      ? scopedPaths.length > 0
        ? await db.all<{ path: string; lastScanned: unknown }>(
            sql`
              SELECT path, last_scanned AS lastScanned
              FROM scan_progress
              WHERE source_id = ${this.sourceId}
                AND path IN ${buildScanProgressPathInClause(scopedPaths)}
            `
          )
        : await db.all<{ path: string; lastScanned: unknown }>(
            sql`
              SELECT path, last_scanned AS lastScanned
              FROM scan_progress
              WHERE source_id = ${this.sourceId}
            `
          )
      : null
    if (sourceScopedCompletedScans) {
      return resolveIndexedScanEligibility({
        watchPaths,
        completedScans: sourceScopedCompletedScans,
        intervalMs: Number.POSITIVE_INFINITY,
        normalizePath: this.normalizePath
      }).lastScannedAt
    }

    const query =
      scopedPaths.length > 0
        ? db
            .select({ path: scanProgress.path, lastScanned: scanProgress.lastScanned })
            .from(scanProgress)
            .where(inArray(scanProgress.path, scopedPaths))
        : db
            .select({ path: scanProgress.path, lastScanned: scanProgress.lastScanned })
            .from(scanProgress)
    const completedScans = await query
    const watchPathSet = new Set(
      normalizeIndexedSourceProgressPaths(watchPaths, this.normalizePath)
    )

    return resolveIndexedScanEligibility({
      watchPaths,
      completedScans: completedScans.filter((scan) =>
        watchPathSet.has(this.normalizePath(scan.path))
      ),
      intervalMs: Number.POSITIVE_INFINITY,
      normalizePath: this.normalizePath
    }).lastScannedAt
  }

  async deletePaths(db: LibSQLDatabase<typeof schema>, paths: string[]): Promise<void> {
    await this.progressStore.deletePaths(
      expandIndexedSourceProgressPaths(paths, this.normalizePath),
      (pathsToDelete) => this.deleteCompletedPaths(pathsToDelete, db)
    )
  }

  async upsertCompletedPaths(
    paths: string[],
    lastScanned: string,
    reason: string
  ): Promise<IndexedSourceProgressStoreUpsertResult> {
    const result = await this.progressStore.upsertPaths(
      normalizeIndexedSourceProgressPaths(paths, this.normalizePath),
      lastScanned,
      reason
    )
    this.lastUpsertSnapshot = {
      ...result,
      reason,
      checkedAt: Date.now()
    }
    return result
  }

  async buildEvidence(
    input: FileProviderScanProgressEvidenceInput
  ): Promise<IndexedSourceEvidence> {
    const watchPaths = filterIndexedSourceProgressPaths(input.watchPaths, this.normalizePath)
    const summary = await this.getSummary(watchPaths)
    const pendingPermissionPaths = filterIndexedSourceProgressPaths(
      input.pendingPermissionPaths ?? [],
      this.normalizePath
    )
    const configuredRoots = watchPaths.length

    return this.evidenceService.build({
      id: `${input.sourceId}:scan-progress`,
      label: 'File scan progress',
      roots: watchPaths,
      itemCount: input.stats.completedFiles,
      totalRoots: summary.totalRoots,
      pendingRoots: summary.pendingRoots,
      failedItems: input.stats.failedFiles,
      isActive: input.isIndexingActive,
      checkedAt: input.checkedAt,
      pendingPermissionPaths,
      reasons: {
        pendingPermission: 'file-index-watch-root-pending-permission',
        failed: 'file-index-progress-has-failed-files',
        pendingRoots: 'file-index-progress-has-pending-roots',
        running: 'file-index-progress-running',
        ready: 'file-index-progress-ready'
      },
      metadata: {
        totalFiles: input.stats.totalFiles,
        completedFiles: input.stats.completedFiles,
        failedFiles: input.stats.failedFiles,
        skippedFiles: input.stats.skippedFiles,
        embeddingCompletedFiles: input.stats.embeddingCompletedFiles,
        embeddingRows: input.stats.embeddingRows,
        configuredRoots,
        completedRoots: summary.completedRoots,
        scanProgressRows: summary.totalRoots,
        lastScannedAt: summary.lastScannedAt,
        lastUpsertAttempted: this.lastUpsertSnapshot?.attempted ?? false,
        lastUpsertReady: this.lastUpsertSnapshot?.ready ?? false,
        lastUpsertedRows: this.lastUpsertSnapshot?.upserted ?? 0,
        lastUpsertReason: this.lastUpsertSnapshot?.reason ?? null,
        lastUpsertCheckedAt: this.lastUpsertSnapshot?.checkedAt ?? null
      }
    })
  }

  private async deleteCompletedPaths(
    paths: string[],
    db?: LibSQLDatabase<typeof schema>
  ): Promise<void> {
    if (paths.length === 0) {
      return
    }

    const targetDb = db ?? this.getDbUtils()?.getDb()
    if (!targetDb) {
      return
    }

    const shape = await resolveScanProgressSchemaShape(targetDb)
    if (shape.sourceScoped) {
      await targetDb.run(sql`
        DELETE FROM scan_progress
        WHERE source_id = ${this.sourceId}
          AND path IN ${buildScanProgressPathInClause(paths)}
      `)
      return
    }

    await targetDb.delete(scanProgress).where(inArray(scanProgress.path, paths))
  }
}
