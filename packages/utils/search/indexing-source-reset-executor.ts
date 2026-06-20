import type {
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
} from "./indexing-source";

export type IndexedSourceResetOperationReason =
  | "remove-by-provider"
  | "scan-progress-reset"
  | (string & {});

export interface IndexedSourceResetOperationReasonPrefixInput {
  reason: IndexedSourceResetRequest["reason"];
  namespace?: string;
}

export interface IndexedSourceResetOperationReasonInput extends IndexedSourceResetOperationReasonPrefixInput {
  operation: IndexedSourceResetOperationReason;
  prefix?: string;
}

export function buildIndexedSourceResetOperationReasonPrefix(
  input: IndexedSourceResetOperationReasonPrefixInput,
): string {
  return `${input.namespace ?? "indexed-source"}.${input.reason}`;
}

export function buildIndexedSourceResetOperationReason(
  input: IndexedSourceResetOperationReasonInput,
): string {
  const prefix =
    input.prefix ?? buildIndexedSourceResetOperationReasonPrefix(input);
  return `${prefix}.${input.operation}`;
}

export interface IndexedSourceResetExecutorClearProgressResult {
  cleared: boolean;
  rows?: number;
}

export interface IndexedSourceResetExecutorClearSearchIndexResult {
  cleared?: boolean;
  rows?: number;
}

export interface IndexedSourceResetExecutorInput {
  request: IndexedSourceResetRequest;
  clearSearchIndex?: boolean;
  clearScanProgress?: boolean;
  operationReasonNamespace?: string;
  operationReasonPrefix?: string;
}

export interface IndexedSourceResetExecutorDeps {
  sourceId: string;
  clearSearchIndex: (
    reason: string,
  ) => Promise<void | IndexedSourceResetExecutorClearSearchIndexResult>;
  clearScanProgress: (
    reason: string,
  ) => Promise<IndexedSourceResetExecutorClearProgressResult>;
  operationReasonNamespace?: string;
  now?: () => number;
}

export class IndexedSourceResetExecutorService {
  private readonly sourceId: string;
  private readonly clearSearchIndex: IndexedSourceResetExecutorDeps["clearSearchIndex"];
  private readonly clearScanProgress: IndexedSourceResetExecutorDeps["clearScanProgress"];
  private readonly operationReasonNamespace: IndexedSourceResetExecutorDeps["operationReasonNamespace"];
  private readonly now: () => number;

  constructor(deps: IndexedSourceResetExecutorDeps) {
    this.sourceId = deps.sourceId;
    this.clearSearchIndex = deps.clearSearchIndex;
    this.clearScanProgress = deps.clearScanProgress;
    this.operationReasonNamespace = deps.operationReasonNamespace;
    this.now = deps.now ?? Date.now;
  }

  async reset(
    input: IndexedSourceResetExecutorInput,
  ): Promise<IndexedSourceResetResult> {
    const startedAt = normalizeResetTimestamp(this.now());
    const request = input.request;
    const operationReasonPrefix =
      input.operationReasonPrefix ??
      buildIndexedSourceResetOperationReasonPrefix({
        reason: request.reason,
        namespace:
          input.operationReasonNamespace ?? this.operationReasonNamespace,
      });
    const shouldClearSearchIndex =
      input.clearSearchIndex ?? request.clearSearchIndex === true;
    const shouldClearScanProgress =
      input.clearScanProgress ?? request.clearScanProgress !== false;
    let clearedSearchIndex = false;
    let clearedSearchIndexRows = 0;
    let clearedScanProgress = false;
    let scanProgressRows = 0;

    if (shouldClearSearchIndex) {
      const result = await this.clearSearchIndex(
        buildIndexedSourceResetOperationReason({
          reason: request.reason,
          prefix: operationReasonPrefix,
          operation: "remove-by-provider",
        }),
      );
      clearedSearchIndex = result?.cleared ?? true;
      clearedSearchIndexRows = normalizeResetRows(result?.rows);
    }

    if (shouldClearScanProgress) {
      const result = await this.clearScanProgress(
        buildIndexedSourceResetOperationReason({
          reason: request.reason,
          prefix: operationReasonPrefix,
          operation: "scan-progress-reset",
        }),
      );
      clearedScanProgress = result.cleared;
      scanProgressRows = normalizeResetRows(result.rows);
    }

    const completedAt = Math.max(
      startedAt,
      normalizeResetTimestamp(this.now(), startedAt),
    );

    return {
      sourceId: request.sourceId || this.sourceId,
      reason: request.reason,
      clearedSearchIndex,
      clearedSearchIndexRows,
      clearedScanProgress,
      scanProgressRows,
      startedAt,
      completedAt,
    };
  }
}

function normalizeResetRows(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function normalizeResetTimestamp(value: unknown, fallback = 0): number {
  const timestamp =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return timestamp >= 0 ? timestamp : 0;
}
