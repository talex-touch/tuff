import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'
import type { ScannedFileInfo } from '../types'
import type { FileScanRunStats } from '../workers/file-scan-worker-client'
import type { FileProviderFullScanCheckpointService } from './file-provider-full-scan-checkpoint-service'
import { mapIndexedWriteFullScanUpsertRecords } from '@talex-touch/utils/search'
import { buildRootOnlyExcludePaths } from './file-provider-full-scan-checkpoint-service'

export interface FileProviderFullScanRunResult {
  added: number
  completedPaths: string[]
  /**
   * Per completed root, the child checkpoints written along the way. The caller removes them
   * after the root's own completion record is in place (see the checkpoint service).
   */
  checkpointsToClear: Map<string, string[]>
}

export interface FileProviderFullScanRunDeps<TContext> {
  enterPerfContext: (label: string, metadata: Record<string, unknown>) => () => void
  scanDirectory: (
    rootPath: string,
    excludePathsSet: Set<string> | undefined,
    context: TContext,
    onStats: (stats: FileScanRunStats) => void
  ) => AsyncIterable<ScannedFileInfo[]>
  insertRecords: (
    rootPath: string,
    records: UpsertFileRecord[],
    context: TContext
  ) => Promise<{ insertedCount: number }>
  emitProgress: (current: number, total: number) => void
  yieldAfterScan: () => Promise<void>
  now: () => number
  formatDuration: (durationMs: number) => string
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  /** Without it a root is walked whole and a restart starts over, as before. */
  checkpoints?: FileProviderFullScanCheckpointService
}

export class FileProviderFullScanRunService<TContext> {
  private readonly enterPerfContext: FileProviderFullScanRunDeps<TContext>['enterPerfContext']
  private readonly scanDirectory: FileProviderFullScanRunDeps<TContext>['scanDirectory']
  private readonly insertRecords: FileProviderFullScanRunDeps<TContext>['insertRecords']
  private readonly emitProgress: FileProviderFullScanRunDeps<TContext>['emitProgress']
  private readonly yieldAfterScan: FileProviderFullScanRunDeps<TContext>['yieldAfterScan']
  private readonly now: FileProviderFullScanRunDeps<TContext>['now']
  private readonly formatDuration: FileProviderFullScanRunDeps<TContext>['formatDuration']
  private readonly logDebug: FileProviderFullScanRunDeps<TContext>['logDebug']
  private readonly checkpoints: FileProviderFullScanRunDeps<TContext>['checkpoints']

  constructor(deps: FileProviderFullScanRunDeps<TContext>) {
    this.enterPerfContext = deps.enterPerfContext
    this.scanDirectory = deps.scanDirectory
    this.insertRecords = deps.insertRecords
    this.emitProgress = deps.emitProgress
    this.yieldAfterScan = deps.yieldAfterScan
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logDebug = deps.logDebug
    this.checkpoints = deps.checkpoints
  }

  async execute(
    paths: string[],
    context: TContext,
    options?: { excludePathsSet?: Set<string> }
  ): Promise<FileProviderFullScanRunResult> {
    if (paths.length === 0) {
      return { added: 0, completedPaths: [], checkpointsToClear: new Map() }
    }

    const finishPerfContext = this.enterPerfContext('FileProvider.fullScan', {
      paths: paths.length
    })
    try {
      this.logDebug('Starting full scan for new paths', {
        count: paths.length,
        sample: paths.slice(0, 3).join(', ')
      })
      this.emitProgress(0, paths.length)

      let scannedPaths = 0
      let added = 0
      const completedPaths: string[] = []
      const checkpointsToClear = new Map<string, string[]>()
      for (const rootPath of paths) {
        const pathScanStart = this.now()
        this.logDebug('Scanning new path', { path: rootPath })

        const plan = this.checkpoints
          ? await this.checkpoints.plan(rootPath, options?.excludePathsSet)
          : null
        let fileCount = 0
        let rootComplete = true
        if (plan && plan.children.length > 0) {
          // Each child is a resumable unit: its records are inserted, then its checkpoint is
          // written, so a restart in the middle of the next child loses at most that child.
          const total = plan.children.length + 1
          let done = plan.completed.length
          this.emitProgress(done, total)
          for (const child of plan.pending) {
            const result = await this.scanTree(child, rootPath, options?.excludePathsSet, context)
            fileCount += result.fileCount
            added += result.added
            if (result.completed) {
              await this.checkpoints!.markChildCompleted(child)
              done += 1
              this.emitProgress(done, total)
            } else rootComplete = false
          }
          // The root's own files last, with every child excluded so the walker descends nowhere.
          const rootOnly = await this.scanTree(
            rootPath,
            rootPath,
            buildRootOnlyExcludePaths(plan.children, options?.excludePathsSet),
            context
          )
          fileCount += rootOnly.fileCount
          added += rootOnly.added
          if (!rootOnly.completed) rootComplete = false
          checkpointsToClear.set(rootPath, plan.children)
        } else {
          const result = await this.scanTree(rootPath, rootPath, options?.excludePathsSet, context)
          fileCount += result.fileCount
          added += result.added
          rootComplete = result.completed
        }
        this.logDebug('Directory scan completed', {
          path: rootPath,
          files: fileCount,
          resumedPast: plan?.completed.length ?? 0,
          duration: this.formatDuration(this.now() - pathScanStart)
        })

        if (rootComplete) {
          scannedPaths += 1
          this.emitProgress(scannedPaths, paths.length)
          completedPaths.push(rootPath)
        }
      }

      return { added, completedPaths, checkpointsToClear }
    } finally {
      finishPerfContext()
    }
  }

  private async scanTree(
    scanPath: string,
    rootPath: string,
    excludePathsSet: Set<string> | undefined,
    context: TContext
  ): Promise<{ fileCount: number; added: number; completed: boolean }> {
    let fileCount = 0
    let added = 0
    const outcome: { stats: FileScanRunStats | null } = { stats: null }
    for await (const diskFiles of this.scanDirectory(
      scanPath,
      excludePathsSet,
      context,
      (stats) => {
        outcome.stats = stats
      }
    )) {
      fileCount += diskFiles.length
      const records = mapIndexedWriteFullScanUpsertRecords(diskFiles, {
        lastIndexedAt: new Date()
      })
      if (records.length > 0) {
        const insertResult = await this.insertRecords(rootPath, records, context)
        added += insertResult.insertedCount
      }
      await this.yieldAfterScan()
    }
    return { fileCount, added, completed: outcome.stats !== null && outcome.stats.errorCount === 0 }
  }
}
