import type { IndexedSourceEvidence } from '@talex-touch/utils/search'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import {
  IndexedSourceProgressEvidenceService,
  IndexedSourceProgressStoreService
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
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  getSearchIndexWorker: () => {
    upsertScanProgress: (paths: string[], lastScanned: string) => Promise<void>
  }
}

export class FileProviderScanProgressService {
  private readonly getDbUtils: FileProviderScanProgressServiceDeps['getDbUtils']
  private readonly ensureSearchIndexWorkerReady: FileProviderScanProgressServiceDeps['ensureSearchIndexWorkerReady']
  private readonly getSearchIndexWorker: FileProviderScanProgressServiceDeps['getSearchIndexWorker']
  private readonly evidenceService = new IndexedSourceProgressEvidenceService()
  private readonly progressStore: IndexedSourceProgressStoreService

  constructor(deps: FileProviderScanProgressServiceDeps) {
    this.getDbUtils = deps.getDbUtils
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
    return this.progressStore.summarizeRoots(watchPaths, completedPaths, {
      isStoreAvailable: Boolean(this.getDbUtils())
    })
  }

  async getCompletedPaths(): Promise<Set<string>> {
    return this.progressStore.getCompletedPaths()
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
        embeddingRows: input.stats.embeddingRows
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
