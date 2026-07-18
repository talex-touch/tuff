export interface IndexedWriteDeleteRecord {
  id: number;
  path: string;
}

export interface IndexedWriteDeleteExecutorResult<
  TRecord extends IndexedWriteDeleteRecord,
> {
  deleted: TRecord[];
  deletedIds: number[];
  deletedPaths: string[];
}

export interface IndexedWriteDeleteExecutorDeps<
  TRecord extends IndexedWriteDeleteRecord,
> {
  normalizePath: (rawPath: string) => string;
  findExisting: (paths: string[]) => Promise<TRecord[]>;
  deleteRecords: (records: TRecord[]) => Promise<void>;
  removeIndexedArtifacts?: (paths: string[]) => Promise<void>;
  logDebug: (message: string, meta?: Record<string, unknown>) => void;
  successMessage?: string;
}

export class IndexedWriteDeleteExecutorService<
  TRecord extends IndexedWriteDeleteRecord,
> {
  private readonly normalizePath: IndexedWriteDeleteExecutorDeps<TRecord>["normalizePath"];
  private readonly findExisting: IndexedWriteDeleteExecutorDeps<TRecord>["findExisting"];
  private readonly deleteRecords: IndexedWriteDeleteExecutorDeps<TRecord>["deleteRecords"];
  private readonly removeIndexedArtifacts: IndexedWriteDeleteExecutorDeps<TRecord>["removeIndexedArtifacts"];
  private readonly logDebug: IndexedWriteDeleteExecutorDeps<TRecord>["logDebug"];
  private readonly successMessage: string;

  constructor(deps: IndexedWriteDeleteExecutorDeps<TRecord>) {
    this.normalizePath = deps.normalizePath;
    this.findExisting = deps.findExisting;
    this.deleteRecords = deps.deleteRecords;
    this.removeIndexedArtifacts = deps.removeIndexedArtifacts;
    this.logDebug = deps.logDebug;
    this.successMessage =
      deps.successMessage ?? "Indexed write delete completed";
  }

  async execute(
    rawPaths: string[],
  ): Promise<IndexedWriteDeleteExecutorResult<TRecord>> {
    const normalized = this.normalizeUniquePaths(rawPaths);
    if (normalized.length === 0) {
      return this.emptyResult();
    }

    const existing = await this.findExisting(normalized);
    return await this.executeExisting(existing);
  }

  async executeExisting(
    existing: TRecord[],
  ): Promise<IndexedWriteDeleteExecutorResult<TRecord>> {
    if (existing.length === 0) {
      return this.emptyResult();
    }

    await this.deleteRecords(existing);
    const deletedPaths = existing.map((record) => record.path);
    await this.removeIndexedArtifacts?.(deletedPaths);

    this.logDebug(this.successMessage, { removed: existing.length });
    return {
      deleted: existing,
      deletedIds: existing.map((record) => record.id),
      deletedPaths,
    };
  }

  private normalizeUniquePaths(rawPaths: string[]): string[] {
    return Array.from(
      new Set(rawPaths.map((rawPath) => this.normalizePath(rawPath))),
    );
  }

  private emptyResult(): IndexedWriteDeleteExecutorResult<TRecord> {
    return {
      deleted: [],
      deletedIds: [],
      deletedPaths: [],
    };
  }
}
