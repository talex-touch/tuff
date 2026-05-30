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

export type SearchProviderOwner =
  | "core"
  | "official-plugin"
  | "third-party-plugin";

export type SearchProviderMode = "pull" | "push" | "indexed";

export type SearchProviderPermissionScope =
  | IndexedSourcePermissionScope
  | "root-results";

export type SearchProviderRegistrationStatus =
  | "allowed"
  | "blocked"
  | "requires-consent";

export type SearchProviderRegistrationIssue =
  | "missing-owner"
  | "missing-permission-scope"
  | "third-party-push-requires-root-results"
  | "third-party-push-requires-explicit-consent"
  | "third-party-indexed-requires-explicit-consent"
  | "high-privacy-requires-explicit-consent"
  | "browser-data-requires-official-plugin";

export type IndexedSourceAdmissionReason =
  | "missing-owner"
  | "missing-permission-scope"
  | "high-privacy-requires-explicit-enable"
  | "browser-data-requires-high-privacy"
  | "browser-data-requires-official-plugin"
  | "external-fast-requires-external-tool-permission"
  | "external-fast-cannot-be-third-party"
  | "persistent-source-must-be-clearable"
  | "watch-capability-requires-reconcile";

export type IndexedSourceLifecycleIssue =
  | "missing-scan-handler"
  | "open-capability-missing-handler"
  | "clear-capability-missing-handler"
  | "watch-capability-missing-handler"
  | "reconcile-capability-missing-handler"
  | "search-capability-missing-handler"
  | "reset-capability-missing-handler"
  | "handler-provided-without-capability";

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

export const IndexedSourceResetReasons = {
  ManualRebuild: "manual-rebuild",
  SchemaMigration: "schema-migration",
  IntegrityRepair: "integrity-repair",
  HealthRepair: "health-repair",
  UserClear: "user-clear",
} as const;

export type IndexedSourceResetReason =
  (typeof IndexedSourceResetReasons)[keyof typeof IndexedSourceResetReasons];

export interface IndexedSourceCapabilities {
  scan: boolean;
  watch: boolean;
  reconcile: boolean;
  search?: boolean;
  reset?: boolean;
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

export type IndexedSourceDescriptorTemplate =
  | "quicklinks"
  | "system-settings"
  | "browser-bookmarks"
  | "browser-history";

export interface CreateIndexedSourceDescriptorOptions {
  id?: string;
  displayName?: string;
  platforms?: IndexedSourcePlatform[];
  priority?: IndexedSourcePriority;
  storage?: IndexedSourceStorageMode;
  privacy?: IndexedSourcePrivacyLevel;
  capabilities?: Partial<IndexedSourceCapabilities>;
  admission?: Partial<IndexedSourceAdmission>;
}

export interface SearchProviderUserConfig {
  providerId: string;
  enabled: boolean;
  order: number;
  updatedAt?: number;
}

export interface IndexedSourceManifestDescriptor
  extends CreateIndexedSourceDescriptorOptions {
  id: string;
  template?: IndexedSourceDescriptorTemplate;
  kind?: IndexedSourceKind;
}

export interface IndexedSourceManifestDefaults {
  pluginName: string;
  owner?: IndexedSourceOwner;
}

export type IndexedSourceManifestResolutionIssueCode =
  | "INDEXED_SOURCE_INVALID"
  | "INDEXED_SOURCE_ADMISSION_BLOCKED"
  | "INDEXED_SOURCE_PERMISSION_MISSING";

export interface IndexedSourceManifestResolutionIssue {
  type: "warning" | "error";
  code: IndexedSourceManifestResolutionIssueCode;
  message: string;
  sourceId?: string;
  index?: number;
  admissionIssues?: IndexedSourceAdmissionReason[];
  missingPermissionIds?: string[];
  permissionScopes?: IndexedSourcePermissionScope[];
}

export interface IndexedSourceManifestResolutionInput {
  manifestSources?: unknown;
  defaults: IndexedSourceManifestDefaults;
  declaredPermissionIds?: string[];
}

export interface IndexedSourceManifestResolution {
  descriptors: IndexedSourceDescriptor[];
  issues: IndexedSourceManifestResolutionIssue[];
}

export interface SearchProviderRegistrationPolicy {
  owner: SearchProviderOwner;
  mode: SearchProviderMode;
  permissionScopes: SearchProviderPermissionScope[];
  defaultState: IndexedSourceDefaultState;
  requiresUserConsent?: boolean;
  pushesToRootResults?: boolean;
  indexedSourceId?: string;
  indexedSource?: IndexedSourceDescriptor;
}

export interface SearchProviderDescriptor {
  id: string;
  displayName: string;
  featureId?: string;
  kind: IndexedSourceKind | "feature" | "preview" | "plugin";
  owner: SearchProviderOwner;
  mode: SearchProviderMode;
  priority: IndexedSourcePriority;
  defaultOrder: number;
  icon?: string;
  policy: SearchProviderRegistrationPolicy;
}

export interface SearchProviderManifestDescriptor {
  id: string;
  displayName?: string;
  featureId?: string;
  kind?: SearchProviderDescriptor["kind"];
  owner?: SearchProviderOwner;
  mode: SearchProviderMode;
  priority?: IndexedSourcePriority;
  defaultOrder?: number;
  icon?: string;
  permissionScopes: SearchProviderPermissionScope[];
  defaultState: IndexedSourceDefaultState;
  requiresUserConsent?: boolean;
  pushesToRootResults?: boolean;
  indexedSourceId?: string;
  indexedSource?: IndexedSourceDescriptor;
}

export interface SearchProviderManifestDefaults {
  pluginName: string;
  displayName?: string;
  owner?: SearchProviderOwner;
  defaultOrder?: number;
}

export interface SearchProviderPushFeatureDeclaration {
  id?: string;
  name?: string;
  push?: boolean;
}

export interface SearchProviderManifestCoverage {
  pushFeatureIds: string[];
  pushFeatureCount: number;
  explicitProviderCount: number;
  hasPushFeatures: boolean;
  hasExplicitProviders: boolean;
  needsExplicitProviderMigration: boolean;
}

export type SearchProviderManifestResolutionIssueCode =
  | "SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE"
  | "SEARCH_PROVIDER_INVALID"
  | "SEARCH_PROVIDER_POLICY_BLOCKED"
  | "SEARCH_PROVIDER_PERMISSION_MISSING";

export interface SearchProviderManifestResolutionIssue {
  type: "warning" | "error";
  code: SearchProviderManifestResolutionIssueCode;
  message: string;
  providerId?: string;
  index?: number;
  featureIds?: string[];
  status?: SearchProviderRegistrationStatus;
  issues?: SearchProviderRegistrationIssue[];
  missingPermissionIds?: string[];
  permissionScopes?: SearchProviderPermissionScope[];
}

export interface SearchProviderManifestResolutionInput {
  manifestProviders?: unknown;
  features?: SearchProviderPushFeatureDeclaration[];
  defaults: SearchProviderManifestDefaults;
  declaredPermissionIds?: string[];
}

export interface SearchProviderManifestResolution {
  descriptors: SearchProviderDescriptor[];
  issues: SearchProviderManifestResolutionIssue[];
  coverage: SearchProviderManifestCoverage;
  derivedFromPushFeatures: boolean;
}

export interface SearchProviderRuntimeConfig extends SearchProviderUserConfig {
  descriptor: SearchProviderDescriptor;
}

export type SearchProviderRegistryIssueCode =
  | SearchProviderManifestResolutionIssueCode
  | "SEARCH_PROVIDER_ID_COLLISION";

export interface SearchProviderRegistryIssue {
  type: "warning" | "error";
  code: SearchProviderRegistryIssueCode;
  message: string;
  pluginName?: string;
  providerId?: string;
  source?: string;
  owner?: SearchProviderOwner;
  mode?: SearchProviderMode;
  meta?: Record<string, unknown>;
}

export interface SearchProviderRegistrationDecision {
  status: SearchProviderRegistrationStatus;
  issues: SearchProviderRegistrationIssue[];
}

export function resolveSearchProviderPermissionIds(
  scopes: SearchProviderPermissionScope[] = [],
): string[] {
  const permissionIds = scopes.flatMap((scope) => {
    switch (scope) {
      case "root-results":
        return ["search.root-results"];
      case "file-system":
        return ["fs.index"];
      case "browser-data":
        return ["fs.read"];
      case "network":
        return ["network.internet"];
      case "account":
        return ["storage.shared"];
      case "external-tool":
      case "system-index":
      case "none":
      default:
        return [];
    }
  });

  return Array.from(new Set(permissionIds));
}

export function resolveIndexedSourcePermissionIds(
  scopes: IndexedSourcePermissionScope[] = [],
): string[] {
  const permissionIds = scopes.flatMap((scope) => {
    switch (scope) {
      case "file-system":
        return ["fs.index"];
      case "browser-data":
        return ["fs.read"];
      case "network":
        return ["network.internet"];
      case "account":
        return ["storage.shared"];
      case "external-tool":
      case "system-index":
      case "none":
      default:
        return [];
    }
  });

  return Array.from(new Set(permissionIds));
}

export function createSearchProviderDescriptorFromManifest(
  manifestProvider: SearchProviderManifestDescriptor,
  defaults: SearchProviderManifestDefaults,
): SearchProviderDescriptor {
  const owner =
    manifestProvider.owner ?? defaults.owner ?? "third-party-plugin";
  const providerId = manifestProvider.id.trim();
  return {
    id: providerId,
    displayName:
      manifestProvider.displayName?.trim() ||
      defaults.displayName?.trim() ||
      defaults.pluginName,
    featureId: manifestProvider.featureId,
    kind: manifestProvider.kind ?? "plugin",
    owner,
    mode: manifestProvider.mode,
    priority: manifestProvider.priority ?? "fast",
    defaultOrder: manifestProvider.defaultOrder ?? defaults.defaultOrder ?? 100,
    icon: manifestProvider.icon,
    policy: {
      owner,
      mode: manifestProvider.mode,
      permissionScopes: [...manifestProvider.permissionScopes],
      defaultState: manifestProvider.defaultState,
      requiresUserConsent: manifestProvider.requiresUserConsent,
      pushesToRootResults: manifestProvider.pushesToRootResults,
      indexedSourceId: manifestProvider.indexedSourceId,
      indexedSource: manifestProvider.indexedSource,
    },
  };
}

export function getSearchProviderManifestCoverage(
  features: SearchProviderPushFeatureDeclaration[] = [],
  manifestProviders: SearchProviderManifestDescriptor[] = [],
): SearchProviderManifestCoverage {
  const pushFeatureIds = features
    .filter((feature) => feature?.push === true)
    .map((feature) => feature.id || feature.name || "<unknown>");

  return {
    pushFeatureIds,
    pushFeatureCount: pushFeatureIds.length,
    explicitProviderCount: Array.isArray(manifestProviders)
      ? manifestProviders.length
      : 0,
    hasPushFeatures: pushFeatureIds.length > 0,
    hasExplicitProviders:
      Array.isArray(manifestProviders) && manifestProviders.length > 0,
    needsExplicitProviderMigration:
      pushFeatureIds.length > 0 &&
      (!Array.isArray(manifestProviders) || manifestProviders.length === 0),
  };
}

export function deriveSearchProvidersFromPushFeatures(
  features: SearchProviderPushFeatureDeclaration[] = [],
  defaults: SearchProviderManifestDefaults,
): SearchProviderManifestDescriptor[] {
  const pushFeatures = features.filter((feature) => feature?.push === true);

  return pushFeatures.map((feature, index) => {
    const featureId = feature.id || feature.name || `feature-${index + 1}`;
    const providerId =
      pushFeatures.length === 1
        ? `${defaults.pluginName}.root-results`
        : `${defaults.pluginName}.${featureId}`;

    return {
      id: providerId,
      displayName: feature.name || defaults.displayName || defaults.pluginName,
      featureId,
      kind: "plugin",
      mode: "push",
      permissionScopes: ["root-results"],
      defaultState: "ask",
      requiresUserConsent: true,
      pushesToRootResults: true,
      defaultOrder: (defaults.defaultOrder ?? 100) + index,
    };
  });
}

function isSearchProviderManifestDescriptor(
  value: unknown,
): value is SearchProviderManifestDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const provider = value as Partial<SearchProviderManifestDescriptor>;
  return (
    typeof provider.id === "string" &&
    provider.id.trim().length > 0 &&
    typeof provider.mode === "string" &&
    Array.isArray(provider.permissionScopes)
  );
}

export function resolveSearchProviderManifestDescriptors(
  input: SearchProviderManifestResolutionInput,
): SearchProviderManifestResolution {
  const features = input.features ?? [];
  const explicitProviders = Array.isArray(input.manifestProviders)
    ? input.manifestProviders
    : [];
  const coverage = getSearchProviderManifestCoverage(
    features,
    explicitProviders as SearchProviderManifestDescriptor[],
  );
  const issues: SearchProviderManifestResolutionIssue[] = [];

  if (
    input.manifestProviders !== undefined &&
    !Array.isArray(input.manifestProviders)
  ) {
    issues.push({
      type: "warning",
      code: "SEARCH_PROVIDER_INVALID",
      message: 'Invalid "searchProviders" in manifest.json (expected array).',
    });
    return {
      descriptors: [],
      issues,
      coverage,
      derivedFromPushFeatures: false,
    };
  }

  const derivedFromPushFeatures = coverage.needsExplicitProviderMigration;
  const providers = coverage.hasExplicitProviders
    ? explicitProviders
    : deriveSearchProvidersFromPushFeatures(features, input.defaults);

  if (derivedFromPushFeatures) {
    issues.push({
      type: "warning",
      code: "SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE",
      message:
        'Manifest uses push features without explicit "searchProviders"; compatibility provider descriptors were derived.',
      featureIds: coverage.pushFeatureIds,
    });
  }

  const declaredPermissionIds = new Set(input.declaredPermissionIds ?? []);
  const descriptors: SearchProviderDescriptor[] = [];

  providers.forEach((provider, index) => {
    if (!isSearchProviderManifestDescriptor(provider)) {
      issues.push({
        type: "warning",
        code: "SEARCH_PROVIDER_INVALID",
        message: `Invalid search provider declaration at index ${index}: missing provider id, mode or permissionScopes`,
        index,
      });
      return;
    }

    const descriptor = createSearchProviderDescriptorFromManifest(provider, {
      ...input.defaults,
      defaultOrder: (input.defaults.defaultOrder ?? 100) + index,
    });
    const decision = resolveSearchProviderRegistrationDecision(descriptor);
    const requiredPermissionIds = resolveSearchProviderPermissionIds(
      descriptor.policy.permissionScopes,
    );
    const missingPermissionIds = requiredPermissionIds.filter(
      (permissionId) => !declaredPermissionIds.has(permissionId),
    );

    if (decision.issues.length > 0) {
      issues.push({
        type: "error",
        code: "SEARCH_PROVIDER_POLICY_BLOCKED",
        message: `Search provider '${descriptor.id}' failed registration policy: ${decision.issues.join(", ")}`,
        providerId: descriptor.id,
        status: decision.status,
        issues: decision.issues,
      });
    }

    if (missingPermissionIds.length > 0) {
      issues.push({
        type: "error",
        code: "SEARCH_PROVIDER_PERMISSION_MISSING",
        message: `Search provider '${descriptor.id}' requires manifest permissions: ${missingPermissionIds.join(", ")}`,
        providerId: descriptor.id,
        missingPermissionIds,
        permissionScopes: descriptor.policy.permissionScopes,
      });
    }

    if (decision.issues.length === 0 && missingPermissionIds.length === 0) {
      descriptors.push(descriptor);
    }
  });

  return {
    descriptors,
    issues,
    coverage,
    derivedFromPushFeatures,
  };
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

export type IndexedSourceProgressStatus =
  | "unknown"
  | "idle"
  | "running"
  | "stabilizing"
  | "estimated"
  | "stalled"
  | "complete"
  | "failed";

export type IndexedSourceProgressEstimateBasis =
  | "none"
  | "stage-speed"
  | "elapsed-progress"
  | "stalled"
  | "complete";

export interface IndexedSourceProgress {
  sourceId: string;
  stage: string;
  status: IndexedSourceProgressStatus;
  current: number;
  total: number;
  progress: number;
  startedAt?: number | null;
  updatedAt?: number;
  estimatedRemainingMs?: number | null;
  estimatedCompletionAt?: number | null;
  averageItemsPerSecond?: number;
  speedSampleCount?: number;
  estimateBasis?: IndexedSourceProgressEstimateBasis | (string & {});
  reason?: string;
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

export type IndexedSourceTaskHistoryKind = IndexedSourceTaskKind | "reset";

export type IndexedSourceTaskHistoryStatus = "succeeded" | "failed" | "skipped";

export interface IndexedSourceTaskHistoryEntry {
  kind: IndexedSourceTaskHistoryKind;
  status: IndexedSourceTaskHistoryStatus;
  completedAt: number;
  jobId?: string;
  queuedAt?: number;
  startedAt?: number;
  occurredAt?: number;
  error?: string;
  summary?: Record<string, string | number | boolean | undefined>;
}

export const DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT = 8;

export function appendIndexedSourceTaskHistory(
  current: IndexedSourceTaskHistoryEntry[] = [],
  entry: IndexedSourceTaskHistoryEntry,
  limit = DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT,
): IndexedSourceTaskHistoryEntry[] {
  const normalizedLimit =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;

  if (normalizedLimit <= 0) {
    return [];
  }

  return [entry, ...current].slice(0, normalizedLimit);
}

export interface IndexedSourceDiagnostics {
  descriptor: IndexedSourceDescriptor;
  health: IndexedSourceHealth;
  roots: IndexedSourceRoot[];
  evidence?: IndexedSourceEvidence[];
  progress?: IndexedSourceProgress | null;
  admissionIssues?: IndexedSourceAdmissionReason[];
  lifecycleIssues?: IndexedSourceLifecycleIssue[];
  recentTasks?: IndexedSourceTaskHistoryEntry[];
  lastScan?: {
    startedAt: number;
    completedAt: number;
    jobId?: string;
    queuedAt?: number;
    batches: number;
    records: number;
    error?: string;
  };
  lastWatch?: {
    occurredAt: number;
    completedAt: number;
    jobId?: string;
    queuedAt?: number;
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
    jobId?: string;
    queuedAt?: number;
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

export interface IndexedSourceContractIssues {
  admission: IndexedSourceAdmissionReason[];
  lifecycle: IndexedSourceLifecycleIssue[];
  ready: boolean;
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
  getProgress?: () => Promise<IndexedSourceProgress | null>;
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

const ALL_INDEXED_SOURCE_PLATFORMS: IndexedSourcePlatform[] = [
  "darwin",
  "win32",
  "linux",
];

function mergeCapabilities(
  base: IndexedSourceCapabilities,
  override?: Partial<IndexedSourceCapabilities>,
): IndexedSourceCapabilities {
  return {
    ...base,
    ...override,
  };
}

function mergeAdmission(
  base: IndexedSourceAdmission,
  override?: Partial<IndexedSourceAdmission>,
): IndexedSourceAdmission {
  return {
    ...base,
    ...override,
    permissionScopes: override?.permissionScopes ?? [...base.permissionScopes],
  };
}

export function createQuicklinksIndexedSourceDescriptor(
  options: CreateIndexedSourceDescriptorOptions = {},
): IndexedSourceDescriptor {
  return {
    id: options.id ?? "quicklinks",
    kind: "quicklink",
    displayName: options.displayName ?? "Quicklinks",
    platforms: options.platforms ?? [...ALL_INDEXED_SOURCE_PLATFORMS],
    priority: options.priority ?? "fast",
    storage: options.storage ?? "sqlite-index",
    privacy: options.privacy ?? "low",
    capabilities: mergeCapabilities(
      {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true,
      },
      options.capabilities,
    ),
    admission: mergeAdmission(
      {
        owner: "official-plugin",
        permissionScopes: ["none"],
        defaultState: "enabled",
        clearable: true,
        rebuildable: true,
      },
      options.admission,
    ),
  };
}

export function createSystemSettingsIndexedSourceDescriptor(
  options: CreateIndexedSourceDescriptorOptions = {},
): IndexedSourceDescriptor {
  return {
    id: options.id ?? "system-settings",
    kind: "system-setting",
    displayName: options.displayName ?? "System Settings",
    platforms: options.platforms ?? [...ALL_INDEXED_SOURCE_PLATFORMS],
    priority: options.priority ?? "fast",
    storage: options.storage ?? "ephemeral",
    privacy: options.privacy ?? "low",
    capabilities: mergeCapabilities(
      {
        scan: true,
        watch: false,
        reconcile: true,
        clear: false,
        open: true,
      },
      options.capabilities,
    ),
    admission: mergeAdmission(
      {
        owner: "core",
        permissionScopes: ["system-index"],
        defaultState: "enabled",
        clearable: false,
        rebuildable: true,
      },
      options.admission,
    ),
  };
}

export function createBrowserBookmarksIndexedSourceDescriptor(
  options: CreateIndexedSourceDescriptorOptions = {},
): IndexedSourceDescriptor {
  return {
    id: options.id ?? "browser-bookmarks",
    kind: "browser-bookmark",
    displayName: options.displayName ?? "Browser Bookmarks",
    platforms: options.platforms ?? [...ALL_INDEXED_SOURCE_PLATFORMS],
    priority: options.priority ?? "deferred",
    storage: options.storage ?? "sqlite-index",
    privacy: options.privacy ?? "high",
    capabilities: mergeCapabilities(
      {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true,
      },
      options.capabilities,
    ),
    admission: mergeAdmission(
      {
        owner: "official-plugin",
        permissionScopes: ["browser-data", "file-system"],
        defaultState: "disabled",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
        notes:
          "Chromium Bookmarks JSON must be explicitly enabled by a trusted official plugin provider before runtime scanning.",
      },
      options.admission,
    ),
  };
}

export function createBrowserHistoryIndexedSourceDescriptor(
  options: CreateIndexedSourceDescriptorOptions = {},
): IndexedSourceDescriptor {
  return {
    id: options.id ?? "browser-history",
    kind: "browser-history",
    displayName: options.displayName ?? "Browser History",
    platforms: options.platforms ?? [...ALL_INDEXED_SOURCE_PLATFORMS],
    priority: options.priority ?? "deferred",
    storage: options.storage ?? "sqlite-index",
    privacy: options.privacy ?? "high",
    capabilities: mergeCapabilities(
      {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true,
      },
      options.capabilities,
    ),
    admission: mergeAdmission(
      {
        owner: "official-plugin",
        permissionScopes: ["browser-data", "file-system"],
        defaultState: "disabled",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
        notes:
          "Browser History must be explicitly enabled by a trusted official plugin provider before runtime scanning.",
      },
      options.admission,
    ),
  };
}

export function createIndexedSourceDescriptorTemplate(
  template: IndexedSourceDescriptorTemplate,
  options: CreateIndexedSourceDescriptorOptions = {},
): IndexedSourceDescriptor {
  if (template === "quicklinks") {
    return createQuicklinksIndexedSourceDescriptor(options);
  }

  if (template === "browser-bookmarks") {
    return createBrowserBookmarksIndexedSourceDescriptor(options);
  }

  if (template === "browser-history") {
    return createBrowserHistoryIndexedSourceDescriptor(options);
  }

  return createSystemSettingsIndexedSourceDescriptor(options);
}

function isIndexedSourceManifestDescriptor(
  value: unknown,
): value is IndexedSourceManifestDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const source = value as Partial<IndexedSourceManifestDescriptor>;
  return typeof source.id === "string" && source.id.trim().length > 0;
}

function createIndexedSourceDescriptorFromManifest(
  manifestSource: IndexedSourceManifestDescriptor,
  defaults: IndexedSourceManifestDefaults,
): IndexedSourceDescriptor | null {
  const sourceId = manifestSource.id.trim();
  const admission = {
    ...manifestSource.admission,
    owner:
      manifestSource.admission?.owner ??
      defaults.owner ??
      "third-party-plugin",
  };

  if (manifestSource.template) {
    return createIndexedSourceDescriptorTemplate(manifestSource.template, {
      ...manifestSource,
      id: sourceId,
      admission,
    });
  }

  if (!manifestSource.kind) {
    return null;
  }

  return {
    id: sourceId,
    kind: manifestSource.kind,
    displayName: manifestSource.displayName ?? sourceId,
    platforms: manifestSource.platforms ?? [...ALL_INDEXED_SOURCE_PLATFORMS],
    priority: manifestSource.priority ?? "deferred",
    storage: manifestSource.storage ?? "sqlite-index",
    privacy: manifestSource.privacy ?? "high",
    capabilities: mergeCapabilities(
      {
        scan: true,
        watch: false,
        reconcile: true,
        clear: true,
        open: true,
      },
      manifestSource.capabilities,
    ),
    admission: mergeAdmission(
      {
        owner: admission.owner,
        permissionScopes: ["none"],
        defaultState: "ask",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
      },
      admission,
    ),
  };
}

export function resolveIndexedSourceManifestDescriptors(
  input: IndexedSourceManifestResolutionInput,
): IndexedSourceManifestResolution {
  const issues: IndexedSourceManifestResolutionIssue[] = [];

  if (
    input.manifestSources !== undefined &&
    !Array.isArray(input.manifestSources)
  ) {
    return {
      descriptors: [],
      issues: [
        {
          type: "warning",
          code: "INDEXED_SOURCE_INVALID",
          message: 'Invalid "indexedSources" in manifest.json (expected array).',
        },
      ],
    };
  }

  const manifestSources = Array.isArray(input.manifestSources)
    ? input.manifestSources
    : [];
  const declaredPermissionIds = new Set(input.declaredPermissionIds ?? []);
  const descriptors: IndexedSourceDescriptor[] = [];

  manifestSources.forEach((source, index) => {
    if (!isIndexedSourceManifestDescriptor(source)) {
      issues.push({
        type: "warning",
        code: "INDEXED_SOURCE_INVALID",
        message: `Invalid indexed source declaration at index ${index}: missing source id`,
        index,
      });
      return;
    }

    const descriptor = createIndexedSourceDescriptorFromManifest(
      source,
      input.defaults,
    );

    if (!descriptor) {
      issues.push({
        type: "warning",
        code: "INDEXED_SOURCE_INVALID",
        message: `Invalid indexed source declaration '${source.id}': missing template or kind`,
        sourceId: source.id,
        index,
      });
      return;
    }

    const admissionIssues = getIndexedSourceAdmissionIssues(descriptor);
    const permissionScopes = descriptor.admission?.permissionScopes ?? [];
    const requiredPermissionIds = resolveIndexedSourcePermissionIds(
      permissionScopes,
    );
    const missingPermissionIds = requiredPermissionIds.filter(
      (permissionId) => !declaredPermissionIds.has(permissionId),
    );

    if (admissionIssues.length > 0) {
      issues.push({
        type: "error",
        code: "INDEXED_SOURCE_ADMISSION_BLOCKED",
        message: `Indexed source '${descriptor.id}' failed admission policy: ${admissionIssues.join(", ")}`,
        sourceId: descriptor.id,
        admissionIssues,
      });
    }

    if (missingPermissionIds.length > 0) {
      issues.push({
        type: "error",
        code: "INDEXED_SOURCE_PERMISSION_MISSING",
        message: `Indexed source '${descriptor.id}' requires manifest permissions: ${missingPermissionIds.join(", ")}`,
        sourceId: descriptor.id,
        missingPermissionIds,
        permissionScopes,
      });
    }

    if (admissionIssues.length === 0 && missingPermissionIds.length === 0) {
      descriptors.push(descriptor);
    }
  });

  return { descriptors, issues };
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
    (descriptor.kind === "browser-bookmark" ||
      descriptor.kind === "browser-history") &&
    admission?.owner !== "official-plugin"
  ) {
    issues.push("browser-data-requires-official-plugin");
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

function hasIndexedSourceCapabilityHandler(
  source: IndexedSource,
  capability: keyof IndexedSourceCapabilities,
): boolean {
  switch (capability) {
    case "scan":
      return typeof source.scan === "function";
    case "watch":
      return typeof source.handleWatchEvent === "function";
    case "reconcile":
      return typeof source.reconcile === "function";
    case "search":
      return typeof source.search === "function";
    case "reset":
      return typeof source.resetIndex === "function";
    case "clear":
      return typeof source.clearIndex === "function";
    case "open":
      return typeof source.open === "function";
  }
}

export function getIndexedSourceLifecycleIssues(
  source: IndexedSource,
): IndexedSourceLifecycleIssue[] {
  const issues: IndexedSourceLifecycleIssue[] = [];
  const { capabilities } = source.descriptor;

  if (!hasIndexedSourceCapabilityHandler(source, "scan")) {
    issues.push("missing-scan-handler");
  }

  const capabilityChecks: Array<{
    capability: keyof IndexedSourceCapabilities;
    issue: IndexedSourceLifecycleIssue;
  }> = [
    { capability: "watch", issue: "watch-capability-missing-handler" },
    { capability: "reconcile", issue: "reconcile-capability-missing-handler" },
    { capability: "search", issue: "search-capability-missing-handler" },
    { capability: "reset", issue: "reset-capability-missing-handler" },
    { capability: "clear", issue: "clear-capability-missing-handler" },
    { capability: "open", issue: "open-capability-missing-handler" },
  ];

  for (const check of capabilityChecks) {
    if (
      capabilities[check.capability] === true &&
      !hasIndexedSourceCapabilityHandler(source, check.capability)
    ) {
      issues.push(check.issue);
    }
  }

  for (const check of capabilityChecks) {
    if (
      capabilities[check.capability] !== true &&
      hasIndexedSourceCapabilityHandler(source, check.capability)
    ) {
      issues.push("handler-provided-without-capability");
      break;
    }
  }

  return Array.from(new Set(issues));
}

export function isIndexedSourceLifecycleReady(source: IndexedSource): boolean {
  return getIndexedSourceLifecycleIssues(source).length === 0;
}

export function getIndexedSourceContractIssues(
  source: IndexedSource,
): IndexedSourceContractIssues {
  const admission = getIndexedSourceAdmissionIssues(source.descriptor);
  const lifecycle = getIndexedSourceLifecycleIssues(source);

  return {
    admission,
    lifecycle,
    ready: admission.length === 0 && lifecycle.length === 0,
  };
}

export function isIndexedSourceContractReady(source: IndexedSource): boolean {
  return getIndexedSourceContractIssues(source).ready;
}

export function normalizeSearchProviderUserConfigs(
  descriptors: SearchProviderDescriptor[],
  configs: SearchProviderUserConfig[] = [],
): SearchProviderRuntimeConfig[] {
  const configById = new Map(
    configs.map((config) => [config.providerId, config]),
  );

  return descriptors
    .map((descriptor, index): SearchProviderRuntimeConfig => {
      const saved = configById.get(descriptor.id);
      return {
        descriptor,
        providerId: descriptor.id,
        enabled:
          saved?.enabled ??
          (descriptor.policy.defaultState === "enabled" &&
            descriptor.policy.requiresUserConsent !== true),
        order:
          typeof saved?.order === "number" && Number.isFinite(saved.order)
            ? saved.order
            : descriptor.defaultOrder + index,
        updatedAt: saved?.updatedAt,
      };
    })
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.descriptor.defaultOrder - right.descriptor.defaultOrder ||
        left.descriptor.displayName.localeCompare(right.descriptor.displayName),
    );
}

export function isSearchProviderEnabledByConfig(
  providerId: string,
  descriptors: SearchProviderDescriptor[],
  configs: SearchProviderUserConfig[] = [],
): boolean {
  const normalizedProviderId = providerId.trim();
  if (!normalizedProviderId) {
    return false;
  }

  return (
    normalizeSearchProviderUserConfigs(descriptors, configs).find(
      (config) => config.providerId === normalizedProviderId,
    )?.enabled === true
  );
}

export function getSearchProviderUserConfigSignature(
  configs: SearchProviderUserConfig[] = [],
): string {
  return configs
    .map((config) => ({
      providerId: config.providerId,
      enabled: config.enabled,
      order: Number.isFinite(config.order) ? config.order : 0,
    }))
    .sort(
      (left, right) =>
        left.order - right.order ||
        left.providerId.localeCompare(right.providerId),
    )
    .map(
      (config) =>
        `${config.providerId}:${config.enabled ? 1 : 0}:${config.order}`,
    )
    .join("|");
}

export function isIndexedSourceEnabledByProviderConfig(
  sourceId: string,
  providerIds: string[] = [],
  configs: SearchProviderUserConfig[] = [],
): boolean {
  const linkedProviderIds = new Set(
    [sourceId, ...providerIds]
      .map((providerId) => providerId.trim())
      .filter(Boolean),
  );

  if (linkedProviderIds.size === 0) {
    return false;
  }

  return configs.some(
    (config) =>
      config.enabled === true && linkedProviderIds.has(config.providerId),
  );
}

export function getSearchProviderIdsForIndexedSource(
  sourceId: string,
  descriptors: SearchProviderDescriptor[] = [],
): string[] {
  const normalizedSourceId = sourceId.trim();
  if (!normalizedSourceId) {
    return [];
  }

  const providerIds = new Set<string>([normalizedSourceId]);
  for (const descriptor of descriptors) {
    if (descriptor.policy.indexedSourceId === normalizedSourceId) {
      providerIds.add(descriptor.id);
    }
  }

  return [...providerIds];
}

export function resolveSearchProviderRegistrationDecision(
  descriptor: SearchProviderDescriptor,
): SearchProviderRegistrationDecision {
  const issues: SearchProviderRegistrationIssue[] = [];
  const policy = descriptor.policy;

  if (!policy.owner) {
    issues.push("missing-owner");
  }

  if (policy.permissionScopes.length === 0) {
    issues.push("missing-permission-scope");
  }

  if (
    policy.owner === "third-party-plugin" &&
    policy.mode === "push" &&
    !policy.permissionScopes.includes("root-results")
  ) {
    issues.push("third-party-push-requires-root-results");
  }

  if (
    policy.owner === "third-party-plugin" &&
    policy.mode === "push" &&
    (policy.defaultState !== "ask" || policy.requiresUserConsent !== true)
  ) {
    issues.push("third-party-push-requires-explicit-consent");
  }

  if (
    policy.owner === "third-party-plugin" &&
    policy.mode === "indexed" &&
    policy.requiresUserConsent !== true
  ) {
    issues.push("third-party-indexed-requires-explicit-consent");
  }

  if (
    policy.defaultState === "enabled" &&
    policy.requiresUserConsent === true
  ) {
    issues.push("high-privacy-requires-explicit-consent");
  }

  if (
    (policy.indexedSourceId === "browser-bookmarks" ||
      policy.indexedSourceId === "browser-history") &&
    policy.owner !== "official-plugin"
  ) {
    issues.push("browser-data-requires-official-plugin");
  }

  if (
    policy.indexedSource &&
    (policy.indexedSource.kind === "browser-bookmark" ||
      policy.indexedSource.kind === "browser-history") &&
    policy.owner !== "official-plugin"
  ) {
    issues.push("browser-data-requires-official-plugin");
  }

  const uniqueIssues = Array.from(new Set(issues));
  const requiresConsent =
    uniqueIssues.length === 0 &&
    (policy.defaultState === "ask" || policy.requiresUserConsent === true);

  return {
    status:
      uniqueIssues.length > 0
        ? "blocked"
        : requiresConsent
          ? "requires-consent"
          : "allowed",
    issues: uniqueIssues,
  };
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

export interface IndexedSourcePathMatchOptions {
  platform?: IndexedSourcePlatform | (string & {});
  caseSensitive?: boolean;
}

export interface IndexedSourceWatchRootRoute {
  root: IndexedSourceRoot;
  eligible: boolean;
  reason?: IndexedSourceTaskSkipReason;
}

export function normalizeIndexedSourcePathForMatch(
  value: string,
  options: IndexedSourcePathMatchOptions = {},
): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+$/g, "");
  const caseSensitive = options.caseSensitive ?? options.platform === "linux";
  return caseSensitive ? normalized : normalized.toLowerCase();
}

export function isIndexedSourcePathInsideRoot(
  targetPath: string,
  rootPath: string,
  options: IndexedSourcePathMatchOptions = {},
): boolean {
  const target = normalizeIndexedSourcePathForMatch(targetPath, options);
  const root = normalizeIndexedSourcePathForMatch(rootPath, options);
  return target === root || target.startsWith(`${root}/`);
}

export function resolveIndexedSourceRootSkipReason(
  root: IndexedSourceRoot,
): IndexedSourceTaskSkipReason | null {
  if (
    root.permissionState === "denied" ||
    root.permissionState === "promptable"
  ) {
    return `root-permission:${root.permissionState}`;
  }
  return null;
}

export function resolveIndexedSourceWatchRootRoute(
  event: IndexedSourceWatchEvent,
  roots: IndexedSourceRoot[],
  options: IndexedSourcePathMatchOptions = {},
): IndexedSourceWatchRootRoute | null {
  const root = roots.find((candidate) =>
    isIndexedSourcePathInsideRoot(
      event.path,
      event.rootPath ?? candidate.path,
      options,
    ),
  );

  if (!root) {
    return null;
  }

  const reason = resolveIndexedSourceRootSkipReason(root);
  return {
    root,
    eligible: reason == null,
    reason: reason ?? undefined,
  };
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
