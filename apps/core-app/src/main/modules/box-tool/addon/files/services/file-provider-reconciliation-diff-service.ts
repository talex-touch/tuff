import type {
  ReconcileDbFile,
  ReconcileDiskFile,
  ReconcileResult
} from '../workers/file-reconcile-worker-client'

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
    const dbMap = new Map<string, ReconcileDbFile>()
    for (const dbFile of dbFiles) {
      dbMap.set(dbFile.path, dbFile)
    }

    const filesToAdd: ReconcileDiskFile[] = []
    const filesToUpdate: Array<ReconcileDiskFile & { id: number }> = []
    const seenDiskPaths = new Set<string>()

    for (const diskFile of diskFiles) {
      if (seenDiskPaths.has(diskFile.path)) {
        continue
      }
      seenDiskPaths.add(diskFile.path)

      const dbFile = dbMap.get(diskFile.path)
      if (!dbFile) {
        filesToAdd.push(diskFile)
      } else if (diskFile.mtime > dbFile.mtime) {
        filesToUpdate.push({ ...diskFile, id: dbFile.id })
      }
      dbMap.delete(diskFile.path)
    }

    const deletedIds: number[] = []
    if (reconciliationPaths.length > 0) {
      for (const [filePath, dbFile] of dbMap.entries()) {
        if (this.matchesReconciliationPath(reconciliationPaths, filePath)) {
          deletedIds.push(dbFile.id)
        }
      }
    }

    return { filesToAdd, filesToUpdate, deletedIds }
  }

  private matchesReconciliationPath(paths: string[], targetPath: string): boolean {
    for (const prefix of paths) {
      if (targetPath.startsWith(prefix)) {
        return true
      }
    }
    return false
  }
}
