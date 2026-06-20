import type { IndexedSourceEvidence } from '@talex-touch/utils/search'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import {
  IndexedSourceProgressEvidenceService,
  IndexedSourceProgressStoreService,
  resolveIndexedScanEligibility
} from '@talex-touch/utils/search'
import { inArray } from 'drizzle-orm'
import { scanProgress } from '../../../../../db/schema'

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

export interface FileProviderScanProgressEvidenceInput {
  sourceId: string
  watchPaths: string[]
  pendingPermissionPaths?: string[]
  stats: FileProviderIndexStatsForEvidence
  isIndexingActive: boolean
  checkedAt?: number
}

export interface FileProviderScanProgressServiceDeps {
  getDbUtils: () => DbUtils | null
  normalizePath?: (path: string) => string
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  getSearchIndexWorker: () => {
    upsertScanProgress: (paths: string[], lastScanned: string) => Promise<void>
  }
}

export class FileProviderScanProgressService {
  private readonly getDbUtils: FileProviderScanProgressServiceDeps['getDbUtils']
  private readonly normalizePath: NonNullable<FileProviderScanProgressServiceDeps['normalizePath']>
  private readonly ensureSearchIndexWorkerReady: FileProviderScanProgressServiceDeps['ensureSearchIndexWorkerReady']
  private readonly getSearchIndexWorker: FileProviderScanProgressServiceDeps['getSearchIndexWorker']
  private readonly evidenceService = new IndexedSourceProgressEvidenceService()
  private readonly progressStore: IndexedSourceProgressStoreService

  constructor(deps: FileProviderScanProgressServiceDeps) {
    this.getDbUtils = deps.getDbUtils
    this.normalizePath = deps.normalizePath ?? ((path) => path)
    this.ensureSearchIndexWorkerReady = deps.ensureSearchIndexWorkerReady
    this.getSearchIndexWorker = deps.getSearchIndexWorker
    this.progressStore = new IndexedSourceProgressStoreService({
      loadCompletedPaths: () => this.loadCompletedPaths(),
      deleteCompletedPaths: (paths) => this.deleteCompletedPaths(paths),
      ensureReadyForUpsert: (reason) => this.ensureSearchIndexWorkerReady(reason),
      upsertCompletedPaths: (paths, completedAt) =>
        this.getSearchIndexWorker().upsertScanProgress(paths, completedAt)
    })
  }

  async getSummary(watchPaths: string[]): Promise<FileProviderScanProgressSummary> {
    const completedPaths = await this.progressStore.getCompletedPaths()
    const scopedCompletedPaths = this.filterCompletedPathsForRoots(completedPaths, watchPaths)
    const normalizedWatchPaths = watchPaths.map((entryPath) => this.normalizePath(entryPath))
    const normalizedCompletedPaths = new Set(
      [...scopedCompletedPaths].map((entryPath) => this.normalizePath(entryPath))
    )
    const summary = await this.progressStore.summarizeRoots(
      normalizedWatchPaths,
      normalizedCompletedPaths,
      {
        isStoreAvailable: Boolean(this.getDbUtils())
      }
    )
    const lastScannedAt = await this.getLastScannedAt(watchPaths)
    const configuredRootCount = new Set(normalizedWatchPaths).size

    return {
      ...summary,
      completedRoots: Math.max(0, configuredRootCount - summary.pendingRoots),
      lastScannedAt
    }
  }

  async getCompletedPaths(): Promise<Set<string>> {
    return this.progressStore.getCompletedPaths()
  }

  private filterCompletedPathsForRoots(
    completedPaths: Set<string>,
    watchPaths: string[]
  ): Set<string> {
    if (watchPaths.length === 0 || completedPaths.size === 0) {
      return new Set()
    }

    const watchPathSet = new Set(watchPaths.map((entryPath) => this.normalizePath(entryPath)))
    return new Set(
      [...completedPaths].filter((entryPath) => watchPathSet.has(this.normalizePath(entryPath)))
    )
  }

  private async loadCompletedPaths(): Promise<Set<string>> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return new Set()
    }

    const db = dbUtils.getDb()
    const completedScans = await db.select({ path: scanProgress.path }).from(scanProgress)
    return new Set(completedScans.map((row) => row.path))
  }

  private async getLastScannedAt(watchPaths: string[]): Promise<number | null> {
    const dbUtils = this.getDbUtils()
    if (!dbUtils) {
      return null
    }

    const db = dbUtils.getDb()
    const completedScans = await db
      .select({ path: scanProgress.path, lastScanned: scanProgress.lastScanned })
      .from(scanProgress)
    const watchPathSet = new Set(watchPaths.map((entryPath) => this.normalizePath(entryPath)))

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
    await this.progressStore.deletePaths(paths, (pathsToDelete) =>
      this.deleteCompletedPaths(pathsToDelete, db)
    )
  }

  async upsertCompletedPaths(paths: string[], lastScanned: string, reason: string): Promise<void> {
    await this.progressStore.upsertPaths(paths, lastScanned, reason)
  }

  async buildEvidence(
    input: FileProviderScanProgressEvidenceInput
  ): Promise<IndexedSourceEvidence> {
    const summary = await this.getSummary(input.watchPaths)
    const pendingPermissionPaths = input.pendingPermissionPaths ?? []
    const configuredRoots = input.watchPaths.length

    return this.evidenceService.build({
      id: `${input.sourceId}:scan-progress`,
      label: 'File scan progress',
      roots: input.watchPaths,
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
        lastScannedAt: summary.lastScannedAt
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

    await targetDb.delete(scanProgress).where(inArray(scanProgress.path, paths))
  }
}
