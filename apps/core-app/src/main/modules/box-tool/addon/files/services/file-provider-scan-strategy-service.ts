export interface FileProviderScanStrategyResult {
  completedScanPaths: Set<string>
  newPathsToScan: string[]
  reconciliationPaths: string[]
}

export interface FileProviderScanStrategyDeps {
  getCompletedPaths: () => Promise<Set<string>>
  yieldAfterRead: () => Promise<void>
  now: () => number
  formatDuration: (durationMs: number) => string
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logInfo: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderScanStrategyService {
  private readonly getCompletedPaths: FileProviderScanStrategyDeps['getCompletedPaths']
  private readonly yieldAfterRead: FileProviderScanStrategyDeps['yieldAfterRead']
  private readonly now: FileProviderScanStrategyDeps['now']
  private readonly formatDuration: FileProviderScanStrategyDeps['formatDuration']
  private readonly logDebug: FileProviderScanStrategyDeps['logDebug']
  private readonly logInfo: FileProviderScanStrategyDeps['logInfo']

  constructor(deps: FileProviderScanStrategyDeps) {
    this.getCompletedPaths = deps.getCompletedPaths
    this.yieldAfterRead = deps.yieldAfterRead
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logDebug = deps.logDebug
    this.logInfo = deps.logInfo
  }

  async resolve(watchPaths: string[]): Promise<FileProviderScanStrategyResult> {
    const strategyStart = this.now()
    const completedScanPaths = await this.getCompletedPaths()
    await this.yieldAfterRead()

    const newPathsToScan = watchPaths.filter((path) => !completedScanPaths.has(path))
    const reconciliationPaths = watchPaths.filter((path) => completedScanPaths.has(path))

    this.logDebug('File indexing scan strategy', {
      totalWatchPaths: watchPaths.length,
      watchPaths: JSON.stringify(watchPaths),
      completedScansCount: completedScanPaths.size,
      completedPaths: JSON.stringify(Array.from(completedScanPaths)),
      newPathsCount: newPathsToScan.length,
      newPaths: JSON.stringify(newPathsToScan),
      reconciliationCount: reconciliationPaths.length,
      reconciliationPaths: JSON.stringify(reconciliationPaths)
    })

    this.logInfo('Scan strategy prepared', {
      newPaths: newPathsToScan.length,
      reconciliationPaths: reconciliationPaths.length,
      duration: this.formatDuration(this.now() - strategyStart)
    })

    return {
      completedScanPaths,
      newPathsToScan,
      reconciliationPaths
    }
  }
}
