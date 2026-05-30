/**
 * Shared contracts for local-first indexed search sources.
 *
 * These types describe the lifecycle boundary between search providers,
 * indexing runtimes, and source-specific scanners. They are intentionally
 * runtime-agnostic so CoreApp can adapt existing App/File providers before
 * plugins expose long-lived indexed sources.
 */

export type IndexedSourcePlatform = "darwin" | "win32" | "linux";

export type IndexedSourcePriority = "fast" | "deferred";

export type IndexedSourceStorageMode =
  | "sqlite-index"
  | "ephemeral"
  | "external-fast";

export type IndexedSourcePrivacyLevel = "low" | "medium" | "high";

export type IndexedSourceOwner =
  | "core"
  | "official-plugin"
  | "third-party-plugin";

export type IndexedSourcePermissionScope =
  | "none"
  | "file-system"
  | "browser-data"
  | "system-index"
  | "external-tool"
  | "network"
  | "account";

export type IndexedSourceDefaultState = "enabled" | "disabled" | "ask";

export type IndexedSourceAdmissionReason =
  | "missing-owner"
  | "missing-permission-scope"
  | "high-privacy-requires-explicit-enable"
  | "browser-data-requires-high-privacy"
  | "external-fast-requires-external-tool-permission"
  | "external-fast-cannot-be-third-party"
  | "persistent-source-must-be-clearable"
  | "watch-capability-requires-reconcile";

export type IndexedSourceTaskKind = "scan" | "watch" | "reconcile";

export type IndexedSourceTaskSkipReason =
  | `admission:${string}`
  | "capability:scan-not-supported"
  | "capability:watch-not-supported"
  | "capability:reconcile-not-supported"
  | "diagnostics:unavailable"
  | "root-permission:denied"
  | "root-permission:promptable"
  | "source-watch-filtered"
  | "health:disabled"
  | "health:unsupported"
  | "health:permission-required"
  | "health:error"
  | "permission:denied"
  | "permission:promptable";

export type IndexedSourceKind =
  | "app"
  | "file"
  | "browser-bookmark"
  | "browser-history"
  | "quicklink"
  | "system-setting"
  | "obsidian-note"
  | "vscode-workspace"
  | "vscode-extension"
  | "plugin-data";

export type IndexedSourceHealthStatus =
  | "ready"
  | "warming"
  | "degraded"
  | "disabled"
  | "unsupported"
  | "permission-required"
  | "error";

export type IndexedSourcePermissionState =
  | "granted"
  | "denied"
  | "promptable"
  | "not-required";

export type IndexedSourceWatchState =
  | "active"
  | "pending-permission"
  | "unavailable"
  | "not-supported";

export type IndexedSourceReconcileState =
  | "idle"
  | "scheduled"
  | "running"
  | "failed";

export const IndexedSourceReconcileReasons = {
  Scheduled: "scheduled",
  ManualRepair: "manual-repair",
  WatchGap: "watch-gap",
  WatchRecovery: "watch-recovery",
  WatchRootRecovered: "file-watch-root-recovered",
  HealthRepair: "health-repair",
  SchemaMigration: "schema-migration",
  ExternalRefresh: "external-refresh",
  Unsupported: "reconcile-not-supported",
} as const;

export type IndexedSourceReconcileReason =
  (typeof IndexedSourceReconcileReasons)[keyof typeof IndexedSourceReconcileReasons];

export const IndexedSourceScanReasons = {
  Startup: "startup",
  ManualRebuild: "manual-rebuild",
  Scheduled: "scheduled",
  WatchRecovery: "watch-recovery",
  SchemaMigration: "schema-migration",
  HealthRepair: "health-repair",
} as const;

export type IndexedSourceScanReason =
  (typeof IndexedSourceScanReasons)[keyof typeof IndexedSourceScanReasons];

export type IndexedSourceDeltaAction = "add" | "change" | "delete";

export type IndexedSourceResetReason =
  | "manual-rebuild"
  | "schema-migration"
  | "integrity-repair"
  | "health-repair"
  | "user-clear";

export interface IndexedSourceCapabilities {
  scan: boolean;
  watch: boolean;
  reconcile: boolean;
  clear: boolean;
  open: boolean;
}

export interface IndexedSourceAdmission {
  owner: IndexedSourceOwner;
  permissionScopes: IndexedSourcePermissionScope[];
  defaultState: IndexedSourceDefaultState;
  requiresUserConsent?: boolean;
  clearable: boolean;
  rebuildable: boolean;
  notes?: string;
}

export interface IndexedSourceDescriptor {
  id: string;
  kind: IndexedSourceKind;
  displayName: string;
  platforms: IndexedSourcePlatform[];
  priority: IndexedSourcePriority;
  storage: IndexedSourceStorageMode;
  privacy: IndexedSourcePrivacyLevel;
  capabilities: IndexedSourceCapabilities;
  admission?: IndexedSourceAdmission;
}

export interface IndexedSourceHealth {
  status: IndexedSourceHealthStatus;
  permissionState: IndexedSourcePermissionState;
  itemCount: number;
  watchState: IndexedSourceWatchState;
  reconcileState: IndexedSourceReconcileState;
  reason?: string;
  lastIndexedAt?: number;
  lastScanStartedAt?: number;
  lastScanCompletedAt?: number;
  lastError?: string;
}

export interface IndexedSourceRoot {
  sourceId: string;
  path: string;
  permissionState: IndexedSourcePermissionState;
  watchDepth?: number;
  lastSeenAt?: number;
  reason?: string;
}

export interface IndexedSourceEvidence {
  id: string;
  label: string;
  status: IndexedSourceHealthStatus;
  itemCount?: number;
  rootCount?: number;
  roots?: string[];
  lastCheckedAt?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface IndexedSourceRecord {
  sourceId: string;
  recordId: string;
  stableKey: string;
  kind: IndexedSourceKind;
  title: string;
  subtitle?: string;
  path?: string;
  uri?: string;
  icon?: string;
  mtime?: number;
  size?: number;
  contentHash?: string;
  keywords?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface IndexedSourceRecordBatch {
  sourceId: string;
  records: IndexedSourceRecord[];
  cursor?: string;
  done?: boolean;
}

export interface IndexedSourceScanRequest {
  sourceId: string;
  reason: IndexedSourceScanReason;
  roots?: IndexedSourceRoot[];
  cursor?: string;
  signal?: AbortSignal;
}

export interface IndexedSourceWatchEvent {
  sourceId?: string;
  action: IndexedSourceDeltaAction;
  path: string;
  rootPath?: string;
  occurredAt: number;
}

export interface IndexedSourceDelta {
  sourceId: string;
  action: IndexedSourceDeltaAction;
  record?: IndexedSourceRecord;
  stableKey?: string;
  path?: string;
  reason?: string;
}

export interface IndexedSourceReconcileRequest {
  sourceId: string;
  roots?: IndexedSourceRoot[];
  limit?: number;
  reason?: IndexedSourceReconcileReason | (string & {});
  signal?: AbortSignal;
}

export interface IndexedSourceReconcileResult {
  sourceId: string;
  added: number;
  changed: number;
  deleted: number;
  skipped: number;
  errors: number;
  deltas?: IndexedSourceDelta[];
  appliedDeltas?: number;
  failedDeltas?: number;
  deltaErrors?: string[];
  startedAt: number;
  completedAt: number;
  reason?: string;
}

export interface IndexedSourceResetRequest {
  sourceId: string;
  reason: IndexedSourceResetReason;
  clearSearchIndex?: boolean;
  clearScanProgress?: boolean;
  signal?: AbortSignal;
}

export interface IndexedSourceResetResult {
  sourceId: string;
  reason: IndexedSourceResetReason;
  clearedSearchIndex: boolean;
  clearedScanProgress: boolean;
  scanProgressRows?: number;
  startedAt: number;
  completedAt: number;
  error?: string;
}

export interface IndexedSourceSearchQuery {
  text: string;
  limit?: number;
  filters?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface IndexedSourceSearchResult {
  sourceId: string;
  records: IndexedSourceRecord[];
  diagnostics?: IndexedSourceHealth;
}

export interface IndexedSourceDiagnostics {
  descriptor: IndexedSourceDescriptor;
  health: IndexedSourceHealth;
  roots: IndexedSourceRoot[];
  evidence?: IndexedSourceEvidence[];
  lastScan?: {
    startedAt: number;
    completedAt: number;
    batches: number;
    records: number;
    error?: string;
  };
  lastWatch?: {
    occurredAt: number;
    completedAt: number;
    action: IndexedSourceDeltaAction;
    path: string;
    deltas: number;
    appliedDeltas: number;
    failedDeltas: number;
    error?: string;
  };
  lastReconcile?: {
    startedAt: number;
    completedAt: number;
    added: number;
    changed: number;
    deleted: number;
    skipped: number;
    errors: number;
    reason?: string;
    rootCount?: number;
    jobId?: string;
    queuedAt?: number;
    deltas?: number;
    appliedDeltas?: number;
    failedDeltas?: number;
    error?: string;
  };
  lastReset?: {
    startedAt: number;
    completedAt: number;
    reason: IndexedSourceResetReason;
    clearedSearchIndex: boolean;
    clearedScanProgress: boolean;
    scanProgressRows?: number;
    error?: string;
  };
}

export interface IndexedSourceDiagnosticsSnapshot {
  generatedAt: number;
  summary: {
    total: number;
    byStatus: Partial<Record<IndexedSourceHealthStatus, number>>;
    ready: number;
    degraded: number;
    unavailable: number;
  };
  sources: IndexedSourceDiagnostics[];
}

export interface IndexedSourceOpenAction {
  id: string;
  label?: string;
  payload?: Record<string, unknown>;
}

export interface IndexedSourceOpenResult {
  status: "started" | "blocked" | "failed" | "unsupported";
  reason?: string;
}

export interface IndexedSource {
  descriptor: IndexedSourceDescriptor;
  getHealth: () => Promise<IndexedSourceHealth>;
  getRoots: () => Promise<IndexedSourceRoot[]>;
  getEvidence?: () => Promise<IndexedSourceEvidence[]>;
  scan: (
    request: IndexedSourceScanRequest,
  ) => AsyncIterable<IndexedSourceRecordBatch>;
  reconcile?: (
    request: IndexedSourceReconcileRequest,
  ) => Promise<IndexedSourceReconcileResult>;
  shouldHandleWatchEvent?: (event: IndexedSourceWatchEvent) => boolean;
  handleWatchEvent?: (
    event: IndexedSourceWatchEvent,
  ) => Promise<IndexedSourceDelta[]>;
  search?: (
    query: IndexedSourceSearchQuery,
  ) => Promise<IndexedSourceSearchResult>;
  open?: (
    record: IndexedSourceRecord,
    action: IndexedSourceOpenAction,
  ) => Promise<IndexedSourceOpenResult>;
  resetIndex?: (
    request: IndexedSourceResetRequest,
  ) => Promise<IndexedSourceResetResult>;
  clearIndex?: () => Promise<void>;
}

function hasPermissionScope(
  descriptor: IndexedSourceDescriptor,
  scope: IndexedSourcePermissionScope,
): boolean {
  return descriptor.admission?.permissionScopes.includes(scope) === true;
}

export function getIndexedSourceAdmissionIssues(
  descriptor: IndexedSourceDescriptor,
): IndexedSourceAdmissionReason[] {
  const issues: IndexedSourceAdmissionReason[] = [];
  const admission = descriptor.admission;

  if (!admission?.owner) {
    issues.push("missing-owner");
  }

  if (!admission || admission.permissionScopes.length === 0) {
    issues.push("missing-permission-scope");
  }

  if (
    descriptor.privacy === "high" &&
    admission?.defaultState === "enabled" &&
    admission.requiresUserConsent !== true
  ) {
    issues.push("high-privacy-requires-explicit-enable");
  }

  if (
    (descriptor.kind === "browser-bookmark" ||
      descriptor.kind === "browser-history") &&
    descriptor.privacy !== "high"
  ) {
    issues.push("browser-data-requires-high-privacy");
  }

  if (
    (descriptor.kind === "browser-bookmark" ||
      descriptor.kind === "browser-history") &&
    !hasPermissionScope(descriptor, "browser-data")
  ) {
    issues.push("missing-permission-scope");
  }

  if (
    descriptor.storage === "external-fast" &&
    !hasPermissionScope(descriptor, "external-tool")
  ) {
    issues.push("external-fast-requires-external-tool-permission");
  }

  if (
    descriptor.storage === "external-fast" &&
    admission?.owner === "third-party-plugin"
  ) {
    issues.push("external-fast-cannot-be-third-party");
  }

  if (descriptor.storage === "sqlite-index" && admission?.clearable !== true) {
    issues.push("persistent-source-must-be-clearable");
  }

  if (descriptor.capabilities.watch && !descriptor.capabilities.reconcile) {
    issues.push("watch-capability-requires-reconcile");
  }

  return Array.from(new Set(issues));
}

export function isIndexedSourceAdmissionReady(
  descriptor: IndexedSourceDescriptor,
): boolean {
  return getIndexedSourceAdmissionIssues(descriptor).length === 0;
}

export interface IndexedSourceTaskEligibilityInput {
  descriptor: IndexedSourceDescriptor;
  health?: IndexedSourceHealth;
  task: IndexedSourceTaskKind;
}

export interface IndexedSourceTaskEligibility {
  eligible: boolean;
  reason?: IndexedSourceTaskSkipReason;
}

export function resolveIndexedSourceTaskEligibility(
  input: IndexedSourceTaskEligibilityInput,
): IndexedSourceTaskEligibility {
  const admissionIssues = getIndexedSourceAdmissionIssues(input.descriptor);
  if (admissionIssues.length > 0) {
    return {
      eligible: false,
      reason: `admission:${admissionIssues.join(",")}`,
    };
  }

  if (input.task === "scan" && !input.descriptor.capabilities.scan) {
    return {
      eligible: false,
      reason: "capability:scan-not-supported",
    };
  }

  if (input.task === "watch" && !input.descriptor.capabilities.watch) {
    return {
      eligible: false,
      reason: "capability:watch-not-supported",
    };
  }

  if (input.task === "reconcile" && !input.descriptor.capabilities.reconcile) {
    return {
      eligible: false,
      reason: "capability:reconcile-not-supported",
    };
  }

  if (!input.health) {
    return {
      eligible: false,
      reason: "diagnostics:unavailable",
    };
  }

  if (
    input.health.status === "disabled" ||
    input.health.status === "unsupported" ||
    input.health.status === "permission-required" ||
    input.health.status === "error"
  ) {
    return {
      eligible: false,
      reason: `health:${input.health.status}`,
    };
  }

  if (
    input.health.permissionState === "denied" ||
    input.health.permissionState === "promptable"
  ) {
    return {
      eligible: false,
      reason: `permission:${input.health.permissionState}`,
    };
  }

  return {
    eligible: true,
  };
}
