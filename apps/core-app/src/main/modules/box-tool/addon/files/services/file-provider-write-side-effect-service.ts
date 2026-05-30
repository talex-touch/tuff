import {
  IndexedWriteSideEffectService,
  type IndexedWriteSideEffectOptions
} from '../../../search-engine/indexing-write-side-effect-service'

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
  private readonly dispatcher: IndexedWriteSideEffectService<TFile>

  constructor(deps: FileProviderWriteSideEffectServiceDeps<TFile>) {
    this.dispatcher = new IndexedWriteSideEffectService({
      processExtensions: deps.processFileExtensions,
      scheduleIndexing: deps.scheduleIndexing,
      logWarn: deps.logWarn
    })
  }

  dispatch(files: TFile[], options: FileProviderWriteSideEffectOptions): void {
    this.dispatcher.dispatch(files, options satisfies IndexedWriteSideEffectOptions)
  }
}
