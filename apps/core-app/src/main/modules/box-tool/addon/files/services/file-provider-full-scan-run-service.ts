import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'
import type { ScannedFileInfo } from '../types'
import { mapIndexedWriteFullScanUpsertRecords } from '@talex-touch/utils/search'

export interface FileProviderFullScanRunResult {
  added: number
  completedPaths: string[]
}

export interface FileProviderFullScanRunDeps<TContext> {
  enterPerfContext: (label: string, metadata: Record<string, unknown>) => () => void
  scanDirectory: (
    rootPath: string,
    excludePathsSet: Set<string> | undefined,
    context: TContext
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

  constructor(deps: FileProviderFullScanRunDeps<TContext>) {
    this.enterPerfContext = deps.enterPerfContext
    this.scanDirectory = deps.scanDirectory
    this.insertRecords = deps.insertRecords
    this.emitProgress = deps.emitProgress
    this.yieldAfterScan = deps.yieldAfterScan
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logDebug = deps.logDebug
  }

  async execute(
    paths: string[],
    context: TContext,
    options?: { excludePathsSet?: Set<string> }
  ): Promise<FileProviderFullScanRunResult> {
    if (paths.length === 0) {
      return { added: 0, completedPaths: [] }
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
      for (const rootPath of paths) {
        const pathScanStart = this.now()
        this.logDebug('Scanning new path', { path: rootPath })
        let fileCount = 0
        for await (const diskFiles of this.scanDirectory(
          rootPath,
          options?.excludePathsSet,
          context
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
        this.logDebug('Directory scan completed', {
          path: rootPath,
          files: fileCount,
          duration: this.formatDuration(this.now() - pathScanStart)
        })

        scannedPaths += 1
        this.emitProgress(scannedPaths, paths.length)
        completedPaths.push(rootPath)
      }

      return { added, completedPaths }
    } finally {
      finishPerfContext()
    }
  }
}
