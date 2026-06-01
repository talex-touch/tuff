import type {
  ReconcileDbFile,
  ReconcileDiskFile,
  ReconcileResult
} from '../workers/file-reconcile-worker-client'
import { resolveIndexedWriteReconciliationDiff } from '@talex-touch/utils/search'

export interface FileProviderReconciliationDiffDeps {
  reconcileWithWorker: (
    diskFiles: ReconcileDiskFile[],
    dbFiles: ReconcileDbFile[],
    reconciliationPaths: string[]
  ) => Promise<ReconcileResult>
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderReconciliationDiffService {
  private readonly reconcileWithWorker: FileProviderReconciliationDiffDeps['reconcileWithWorker']
  private readonly logWarn: FileProviderReconciliationDiffDeps['logWarn']

  constructor(deps: FileProviderReconciliationDiffDeps) {
    this.reconcileWithWorker = deps.reconcileWithWorker
    this.logWarn = deps.logWarn
  }

  async reconcile(
    diskFiles: ReconcileDiskFile[],
    dbFiles: ReconcileDbFile[],
    reconciliationPaths: string[]
  ): Promise<ReconcileResult> {
    try {
      return await this.reconcileWithWorker(diskFiles, dbFiles, reconciliationPaths)
    } catch (error) {
      this.logWarn('File reconcile worker failed, falling back to main-thread diff', error, {
        files: diskFiles.length
      })
      return this.compute(diskFiles, dbFiles, reconciliationPaths)
    }
  }

  compute(
    diskFiles: ReconcileDiskFile[],
    dbFiles: ReconcileDbFile[],
    reconciliationPaths: string[]
  ): ReconcileResult {
    return resolveIndexedWriteReconciliationDiff(diskFiles, dbFiles, reconciliationPaths)
  }
}
