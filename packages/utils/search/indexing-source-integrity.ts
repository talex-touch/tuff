import type {
  IndexedSourceEvidence,
  IndexedSourceResetReason,
  IndexedSourceResetResult,
} from "./indexing-source";

export interface IndexedSourceIntegrityResetRequest {
  reason: IndexedSourceResetReason;
  clearSearchIndex: boolean;
  clearScanProgress: boolean;
}

export interface IndexedSourceIntegritySnapshot {
  sourceId: string;
  checkedAt: number;
  indexedRows: number;
  sourceRows: number;
  needsRebuild: boolean;
  clearedSearchIndex: boolean;
  resetSearchIndexRows?: number;
  clearedScanProgress: boolean;
  orphanedRecordsRemoved: number;
  resetReason?: string | null;
  resetScanProgressRows?: number;
  durationMs: number;
}

export interface IndexedSourceIntegrityAdapterSnapshot {
  checkedAt: number;
  indexedRows: number;
  sourceRows: number;
  needsRebuild: boolean;
  clearedSearchIndex: boolean;
  resetSearchIndexRows?: number;
  clearedScanProgress: boolean;
  orphanedRecordsRemoved: number;
  resetReason?: string | null;
  resetScanProgressRows?: number;
  durationMs: number;
}

export interface IndexedSourceIntegrityEvidenceReasons {
  aligned: string;
  rebuildScheduled: string;
}

export interface IndexedSourceIntegrityEvidenceInput<
  TSnapshot extends Pick<
    IndexedSourceIntegrityAdapterSnapshot,
    "checkedAt" | "indexedRows" | "needsRebuild"
  > = IndexedSourceIntegrityAdapterSnapshot,
> {
  id: string;
  label: string;
  snapshot: TSnapshot;
  reasons?: Partial<IndexedSourceIntegrityEvidenceReasons>;
  metadata?: Record<string, unknown>;
}

export interface IndexedSourceIntegrityCheckInput {
  sourceId: string;
  indexedRows: number;
  sourceRows: number;
  resetReason: IndexedSourceResetReason;
  minIndexedRowRatio?: number;
  checkedAt?: number;
}

export interface IndexedSourceIntegrityServiceDeps {
  resetRuntimeState: (
    request: IndexedSourceIntegrityResetRequest,
  ) => Promise<IndexedSourceResetResult>;
  cleanupOrphanedRecords?: () => Promise<number>;
  now?: () => number;
}

export interface IndexedSourceIntegrityAdapterFieldNames<
  TIndexedRowsKey extends string = string,
  TSourceRowsKey extends string = string,
  TOrphanedRecordsRemovedKey extends string = string,
> {
  indexedRows: TIndexedRowsKey;
  sourceRows: TSourceRowsKey;
  orphanedRecordsRemoved: TOrphanedRecordsRemovedKey;
}

export type IndexedSourceIntegrityRenamedAdapterSnapshot<
  TIndexedRowsKey extends string,
  TSourceRowsKey extends string,
  TOrphanedRecordsRemovedKey extends string,
> = Omit<
  IndexedSourceIntegrityAdapterSnapshot,
  "indexedRows" | "sourceRows" | "orphanedRecordsRemoved"
> &
  Record<TIndexedRowsKey, number> &
  Record<TSourceRowsKey, number> &
  Record<TOrphanedRecordsRemovedKey, number>;

const DEFAULT_MIN_INDEXED_ROW_RATIO = 0.8;
const DEFAULT_INTEGRITY_EVIDENCE_REASONS: IndexedSourceIntegrityEvidenceReasons =
  {
    aligned: "indexed-source-integrity-aligned",
    rebuildScheduled: "indexed-source-integrity-rebuild-scheduled",
  };

export class IndexedSourceIntegrityService {
  private readonly resetRuntimeState: IndexedSourceIntegrityServiceDeps["resetRuntimeState"];
  private readonly cleanupOrphanedRecords: IndexedSourceIntegrityServiceDeps["cleanupOrphanedRecords"];
  private readonly now: () => number;

  constructor(deps: IndexedSourceIntegrityServiceDeps) {
    this.resetRuntimeState = deps.resetRuntimeState;
    this.cleanupOrphanedRecords = deps.cleanupOrphanedRecords;
    this.now = deps.now ?? Date.now;
  }

  async check(
    input: IndexedSourceIntegrityCheckInput,
  ): Promise<IndexedSourceIntegritySnapshot> {
    const startedAt = normalizeTimestamp(this.now());
    const indexedRows = normalizeCount(input.indexedRows);
    const sourceRows = normalizeCount(input.sourceRows);
    const minIndexedRowRatio = normalizeRatio(input.minIndexedRowRatio);
    const needsRebuild =
      sourceRows > 0 &&
      (indexedRows === 0 || indexedRows < sourceRows * minIndexedRowRatio);
    let resetResult: IndexedSourceResetResult | null = null;
    let orphanedRecordsRemoved = 0;

    if (needsRebuild) {
      resetResult = await this.resetRuntimeState({
        reason: input.resetReason,
        clearSearchIndex: indexedRows > 0,
        clearScanProgress: true,
      });
    } else if (indexedRows > 0 && this.cleanupOrphanedRecords) {
      orphanedRecordsRemoved = normalizeCount(
        await this.cleanupOrphanedRecords(),
      );
    }

    const completedAt = Math.max(startedAt, normalizeTimestamp(this.now(), startedAt));
    const checkedAt = normalizeTimestamp(input.checkedAt, completedAt);

    return {
      sourceId: input.sourceId,
      checkedAt,
      indexedRows,
      sourceRows,
      needsRebuild,
      clearedSearchIndex: resetResult?.clearedSearchIndex ?? false,
      resetSearchIndexRows: normalizeCount(resetResult?.clearedSearchIndexRows),
      clearedScanProgress: resetResult?.clearedScanProgress ?? false,
      orphanedRecordsRemoved,
      resetReason: resetResult?.reason ?? null,
      resetScanProgressRows: normalizeCount(resetResult?.scanProgressRows),
      durationMs: Math.max(0, completedAt - startedAt),
    };
  }
}

export function mapIndexedSourceIntegritySnapshot(
  snapshot: IndexedSourceIntegritySnapshot,
): IndexedSourceIntegrityAdapterSnapshot {
  return {
    checkedAt: snapshot.checkedAt,
    indexedRows: snapshot.indexedRows,
    sourceRows: snapshot.sourceRows,
    needsRebuild: snapshot.needsRebuild,
    clearedSearchIndex: snapshot.clearedSearchIndex,
    resetSearchIndexRows: snapshot.resetSearchIndexRows,
    clearedScanProgress: snapshot.clearedScanProgress,
    orphanedRecordsRemoved: snapshot.orphanedRecordsRemoved,
    resetReason: snapshot.resetReason,
    resetScanProgressRows: snapshot.resetScanProgressRows,
    durationMs: snapshot.durationMs,
  };
}

export function renameIndexedSourceIntegrityAdapterSnapshotFields<
  TIndexedRowsKey extends string,
  TSourceRowsKey extends string,
  TOrphanedRecordsRemovedKey extends string,
>(
  snapshot: IndexedSourceIntegrityAdapterSnapshot,
  fieldNames: IndexedSourceIntegrityAdapterFieldNames<
    TIndexedRowsKey,
    TSourceRowsKey,
    TOrphanedRecordsRemovedKey
  >,
): IndexedSourceIntegrityRenamedAdapterSnapshot<
  TIndexedRowsKey,
  TSourceRowsKey,
  TOrphanedRecordsRemovedKey
> {
  const { indexedRows, sourceRows, orphanedRecordsRemoved, ...rest } = snapshot;

  return {
    ...rest,
    [fieldNames.indexedRows]: indexedRows,
    [fieldNames.sourceRows]: sourceRows,
    [fieldNames.orphanedRecordsRemoved]: orphanedRecordsRemoved,
  } as IndexedSourceIntegrityRenamedAdapterSnapshot<
    TIndexedRowsKey,
    TSourceRowsKey,
    TOrphanedRecordsRemovedKey
  >;
}

export class IndexedSourceIntegrityEvidenceService {
  build<
    TSnapshot extends Pick<
      IndexedSourceIntegrityAdapterSnapshot,
      "checkedAt" | "indexedRows" | "needsRebuild"
    >,
  >(
    input: IndexedSourceIntegrityEvidenceInput<TSnapshot>,
  ): IndexedSourceEvidence {
    const reasons = {
      ...DEFAULT_INTEGRITY_EVIDENCE_REASONS,
      ...(input.reasons ?? {}),
    };

    return {
      id: input.id,
      label: input.label,
      status: input.snapshot.needsRebuild ? "degraded" : "ready",
      itemCount: input.snapshot.indexedRows,
      lastCheckedAt: input.snapshot.checkedAt,
      reason: input.snapshot.needsRebuild
        ? reasons.rebuildScheduled
        : reasons.aligned,
      metadata: input.metadata ?? {
        ...input.snapshot,
      },
    };
  }
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function normalizeRatio(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1
  ) {
    return DEFAULT_MIN_INDEXED_ROW_RATIO;
  }

  return value;
}

function normalizeTimestamp(value: unknown, fallback = 0): number {
  const timestamp =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return timestamp >= 0 ? timestamp : 0;
}
