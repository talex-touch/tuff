export interface IndexedSourceProgressStoreSummary {
  totalRoots: number
  pendingRoots: number
}

export interface IndexedSourceProgressStoreUpsertResult {
  attempted: boolean
  ready: boolean
  upserted: number
}

export interface IndexedSourceProgressStoreDeps {
  loadCompletedPaths: () => Promise<Set<string>>
  deleteCompletedPaths: (paths: string[]) => Promise<void>
  ensureReadyForUpsert: (reason: string) => Promise<boolean>
  upsertCompletedPaths: (paths: string[], completedAt: string) => Promise<void>
}

export class IndexedSourceProgressStoreService {
  private readonly loadCompletedPaths: IndexedSourceProgressStoreDeps['loadCompletedPaths']
  private readonly deleteCompletedPaths: IndexedSourceProgressStoreDeps['deleteCompletedPaths']
  private readonly ensureReadyForUpsert: IndexedSourceProgressStoreDeps['ensureReadyForUpsert']
  private readonly upsertCompletedPaths: IndexedSourceProgressStoreDeps['upsertCompletedPaths']

  constructor(deps: IndexedSourceProgressStoreDeps) {
    this.loadCompletedPaths = deps.loadCompletedPaths
    this.deleteCompletedPaths = deps.deleteCompletedPaths
    this.ensureReadyForUpsert = deps.ensureReadyForUpsert
    this.upsertCompletedPaths = deps.upsertCompletedPaths
  }

  async getCompletedPaths(): Promise<Set<string>> {
    return this.loadCompletedPaths()
  }

  async summarizeRoots(
    watchPaths: string[],
    completedPaths?: Set<string>
  ): Promise<IndexedSourceProgressStoreSummary> {
    const resolvedCompletedPaths = completedPaths ?? (await this.getCompletedPaths())
    const pendingRoots = watchPaths.filter((path) => !resolvedCompletedPaths.has(path)).length

    return {
      totalRoots: resolvedCompletedPaths.size,
      pendingRoots
    }
  }

  async deletePaths(
    paths: string[],
    deleteCompletedPaths = this.deleteCompletedPaths
  ): Promise<number> {
    if (paths.length === 0) return 0
    await deleteCompletedPaths(paths)
    return paths.length
  }

  async upsertPaths(
    paths: string[],
    completedAt: string,
    reason: string
  ): Promise<IndexedSourceProgressStoreUpsertResult> {
    if (paths.length === 0) {
      return {
        attempted: false,
        ready: false,
        upserted: 0
      }
    }

    if (!(await this.ensureReadyForUpsert(reason))) {
      return {
        attempted: true,
        ready: false,
        upserted: 0
      }
    }

    await this.upsertCompletedPaths(paths, completedAt)
    return {
      attempted: true,
      ready: true,
      upserted: paths.length
    }
  }
}
