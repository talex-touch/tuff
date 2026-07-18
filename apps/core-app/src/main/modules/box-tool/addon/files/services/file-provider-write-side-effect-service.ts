import {
  IndexedWriteSideEffectService,
  type IndexedWriteSideEffectOptions
} from '@talex-touch/utils/search'

export interface FileProviderWriteSideEffectOptions {
  extensionContext: string
  indexReason: string
  mutationLeaseId?: string
}

export interface FileProviderWriteSideEffectServiceDeps<TFile> {
  processFileExtensions: (files: TFile[]) => Promise<void>
  scheduleIndexing: (files: TFile[], reason: string, mutationLeaseId?: string) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderWriteSideEffectService<TFile> {
  private readonly dispatcher: IndexedWriteSideEffectService<TFile>

  constructor(deps: FileProviderWriteSideEffectServiceDeps<TFile>) {
    this.dispatcher = new IndexedWriteSideEffectService({
      processExtensions: deps.processFileExtensions,
      scheduleIndexing: deps.scheduleIndexing,
      logWarn: deps.logWarn,
      formatExtensionFailureMessage: (context) => `processFileExtensions failed (${context})`
    })
  }

  dispatch(files: TFile[], options: FileProviderWriteSideEffectOptions): void {
    this.dispatcher.dispatch(files, options satisfies IndexedWriteSideEffectOptions)
  }
}
