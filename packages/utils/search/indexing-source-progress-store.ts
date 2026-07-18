export interface IndexedSourceProgressStoreSummary {
  totalRoots: number;
  pendingRoots: number;
}

export interface IndexedSourceProgressStoreUpsertResult {
  attempted: boolean;
  ready: boolean;
  upserted: number;
}

export interface IndexedSourceProgressStoreClearResult {
  cleared: boolean;
  rows: number;
}

export interface IndexedSourceProgressStoreClearDecision {
  shouldClear: boolean;
  result: IndexedSourceProgressStoreClearResult;
}

export interface IndexedSourceProgressStoreSummaryOptions {
  isStoreAvailable?: boolean;
}

export interface IndexedSourceProgressStoreDeps {
  loadCompletedPaths: () => Promise<Set<string>>;
  deleteCompletedPaths: (paths: string[]) => Promise<void>;
  ensureReadyForUpsert: (reason: string) => Promise<boolean>;
  upsertCompletedPaths: (
    paths: string[],
    completedAt: string,
  ) => Promise<number | void>;
}

export type IndexedSourceProgressPathNormalizer = (path: string) => string;
export interface IndexedSourceProgressPathExpansionOptions {
  dropWhenNormalizedEmpty?: boolean;
}

export function normalizeIndexedSourceProgressPaths(
  paths: Iterable<string>,
  normalizePath: IndexedSourceProgressPathNormalizer = (path) => path,
): string[] {
  const normalizedPaths: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    if (normalizedPath.trim().length === 0) continue;
    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);
    normalizedPaths.push(normalizedPath);
  }
  return normalizedPaths;
}

export function expandIndexedSourceProgressPaths(
  paths: Iterable<string>,
  normalizePath: IndexedSourceProgressPathNormalizer = (path) => path,
  options: IndexedSourceProgressPathExpansionOptions = {},
): string[] {
  const expandedPaths: string[] = [];
  const seen = new Set<string>();
  const addPath = (path: string) => {
    if (path.trim().length === 0) return;
    if (seen.has(path)) return;
    seen.add(path);
    expandedPaths.push(path);
  };

  for (const path of paths) {
    const normalizedPath = normalizePath(path);
    if (options.dropWhenNormalizedEmpty && normalizedPath.trim().length === 0)
      continue;
    addPath(path);
    addPath(normalizedPath);
  }
  return expandedPaths;
}

export function filterIndexedSourceProgressPaths(
  paths: Iterable<string>,
  normalizePath: IndexedSourceProgressPathNormalizer = (path) => path,
): string[] {
  return Array.from(paths).filter(
    (path) => normalizePath(path).trim().length > 0,
  );
}

export function resolveIndexedSourceProgressStoreClearDecision(
  rows: number | null | undefined,
): IndexedSourceProgressStoreClearDecision {
  const resolvedRows = Math.max(
    0,
    Math.trunc(Number.isFinite(rows) ? Number(rows) : 0),
  );
  const shouldClear = resolvedRows > 0;

  return {
    shouldClear,
    result: {
      cleared: shouldClear,
      rows: resolvedRows,
    },
  };
}

export class IndexedSourceProgressStoreService {
  private readonly loadCompletedPaths: IndexedSourceProgressStoreDeps["loadCompletedPaths"];
  private readonly deleteCompletedPaths: IndexedSourceProgressStoreDeps["deleteCompletedPaths"];
  private readonly ensureReadyForUpsert: IndexedSourceProgressStoreDeps["ensureReadyForUpsert"];
  private readonly upsertCompletedPaths: IndexedSourceProgressStoreDeps["upsertCompletedPaths"];

  constructor(deps: IndexedSourceProgressStoreDeps) {
    this.loadCompletedPaths = deps.loadCompletedPaths;
    this.deleteCompletedPaths = deps.deleteCompletedPaths;
    this.ensureReadyForUpsert = deps.ensureReadyForUpsert;
    this.upsertCompletedPaths = deps.upsertCompletedPaths;
  }

  async getCompletedPaths(): Promise<Set<string>> {
    return toProgressStorePathSet(await this.loadCompletedPaths());
  }

  async summarizeRoots(
    watchPaths: string[],
    completedPaths?: Set<string>,
    options: IndexedSourceProgressStoreSummaryOptions = {},
  ): Promise<IndexedSourceProgressStoreSummary> {
    const resolvedCompletedPaths = completedPaths
      ? toProgressStorePathSet(completedPaths)
      : await this.getCompletedPaths();
    const uniqueWatchPaths = uniqueProgressStorePaths(watchPaths);
    if (
      options.isStoreAvailable === false &&
      resolvedCompletedPaths.size === 0
    ) {
      return {
        totalRoots: 0,
        pendingRoots: uniqueWatchPaths.length,
      };
    }

    const pendingRoots = uniqueWatchPaths.filter(
      (path) => !resolvedCompletedPaths.has(path),
    ).length;

    return {
      totalRoots: resolvedCompletedPaths.size,
      pendingRoots,
    };
  }

  async deletePaths(
    paths: string[],
    deleteCompletedPaths = this.deleteCompletedPaths,
  ): Promise<number> {
    const uniquePaths = uniqueProgressStorePaths(paths);
    if (uniquePaths.length === 0) return 0;
    await deleteCompletedPaths(uniquePaths);
    return uniquePaths.length;
  }

  async upsertPaths(
    paths: string[],
    completedAt: string,
    reason: string,
  ): Promise<IndexedSourceProgressStoreUpsertResult> {
    const uniquePaths = uniqueProgressStorePaths(paths);
    if (uniquePaths.length === 0) {
      return {
        attempted: false,
        ready: false,
        upserted: 0,
      };
    }

    if (!(await this.ensureReadyForUpsert(reason))) {
      return {
        attempted: true,
        ready: false,
        upserted: 0,
      };
    }

    const upserted = await this.upsertCompletedPaths(uniquePaths, completedAt);
    return {
      attempted: true,
      ready: true,
      upserted: resolveProgressStoreRowCount(upserted, uniquePaths.length),
    };
  }
}

function resolveProgressStoreRowCount(
  value: number | void,
  fallback: number,
): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function uniqueProgressStorePaths(paths: string[]): string[] {
  const uniquePaths: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (path.trim().length === 0) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    uniquePaths.push(path);
  }
  return uniquePaths;
}

function toProgressStorePathSet(paths: Iterable<string>): Set<string> {
  return new Set(uniqueProgressStorePaths(Array.from(paths)));
}
