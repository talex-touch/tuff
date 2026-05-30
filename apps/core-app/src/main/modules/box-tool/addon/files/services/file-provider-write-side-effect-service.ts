export interface FileProviderWriteSideEffectOptions {
  extensionContext: string
  indexReason: string
}

export interface FileProviderWriteSideEffectServiceDeps<TFile> {
  processFileExtensions: (files: TFile[]) => Promise<void>
  scheduleIndexing: (files: TFile[], reason: string) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderWriteSideEffectService<TFile> {
  private readonly processFileExtensions: FileProviderWriteSideEffectServiceDeps<TFile>['processFileExtensions']
  private readonly scheduleIndexing: FileProviderWriteSideEffectServiceDeps<TFile>['scheduleIndexing']
  private readonly logWarn: FileProviderWriteSideEffectServiceDeps<TFile>['logWarn']

  constructor(deps: FileProviderWriteSideEffectServiceDeps<TFile>) {
    this.processFileExtensions = deps.processFileExtensions
    this.scheduleIndexing = deps.scheduleIndexing
    this.logWarn = deps.logWarn
  }

  dispatch(files: TFile[], options: FileProviderWriteSideEffectOptions): void {
    if (files.length === 0) {
      return
    }

    void this.processFileExtensions(files).catch((error) =>
      this.logWarn(`processFileExtensions failed (${options.extensionContext})`, error)
    )
    this.scheduleIndexing(files, options.indexReason)
  }
}
