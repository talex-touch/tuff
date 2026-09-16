export interface AppIndexSettings {
  hideNoisySystemApps: boolean;
  startupBackfillEnabled: boolean;
  startupBackfillRetryMax: number;
  startupBackfillRetryBaseMs: number;
  startupBackfillRetryMaxMs: number;
  fullSyncEnabled: boolean;
  fullSyncIntervalMs: number;
  fullSyncCheckIntervalMs: number;
  fullSyncCooldownMs: number;
  fullSyncPersistRetry: number;
}

export interface AppIndexAddPathRequest {
  path: string;
}

export interface AppIndexAddPathResult {
  success: boolean;
  status: "added" | "updated" | "invalid" | "error";
  path?: string;
  reason?: string;
}

export type AppIndexEntryLaunchKind = "path" | "shortcut" | "uwp" | "protocol";
export type AppIndexManagedEntrySource = "manual" | "scanned";
export type AppIndexEntryIdentityKind =
  | "macos-path"
  | "macos-bundle"
  | "windows-uwp"
  | "windows-shortcut"
  | "windows-path"
  | "windows-protocol"
  | "linux-desktop"
  | "fallback";

export interface AppIndexManagedEntry {
  path: string;
  name: string;
  displayName?: string;
  icon?: string;
  enabled: boolean;
  source?: AppIndexManagedEntrySource;
  removable?: boolean;
  bundleId?: string;
  /**
   * The identity the scan persisted for this app (`stableId || uniqueId`), when it has one.
   *
   * Carried so the surface can resolve the same catalog item id the search projection does, which
   * is what keeps one application's launches in one usage bucket.
   */
  appIdentity?: string;
  identityKind?: AppIndexEntryIdentityKind;
  launchKind: AppIndexEntryLaunchKind;
  launchTarget: string;
  launchArgs?: string;
  workingDirectory?: string;
  displayPath?: string;
  description?: string;
}

/**
 * The per-entry facts a list needs to reorder or narrow itself with.
 *
 * Usage totals and shortcut state are otherwise read one entry at a time (the detail panel's
 * usage query is deliberately expensive), which a list of a hundred and fifty applications
 * cannot afford to fan out per row. They come back together here instead.
 */
export interface AppIndexEntrySummary {
  path: string;
  /** Total recorded launches, across every entry point. */
  executeCount: number;
  hasShortcut: boolean;
  hasAliases: boolean;
}

export interface AppIndexSummariesResult {
  success: boolean;
  reason?: "db-not-ready" | "error";
  summaries?: AppIndexEntrySummary[];
}

export interface AppIndexUpsertEntryRequest {
  path: string;
  displayName?: string;
  icon?: string;
  launchKind?: AppIndexEntryLaunchKind;
  launchTarget?: string;
  launchArgs?: string;
  workingDirectory?: string;
  displayPath?: string;
  description?: string;
  enabled?: boolean;
}

export interface AppIndexRemoveEntryRequest {
  path: string;
}

export interface AppIndexSetEntryEnabledRequest {
  path: string;
  enabled: boolean;
}

export interface AppIndexEntryMutationResult {
  success: boolean;
  status: "added" | "updated" | "removed" | "invalid" | "not-found" | "error";
  entry?: AppIndexManagedEntry;
  reason?: string;
}

export interface AppIndexDiagnoseRequest {
  target: string;
  query?: string;
}

export interface AppIndexDiagnosticApp {
  id: number;
  path: string;
  name: string;
  displayName?: string;
  rawDisplayName?: string;
  displayNameStatus?: "clean" | "fallback" | "missing";
  identityKind?: AppIndexEntryIdentityKind;
  displayNameSource?: string;
  displayNameQuality?:
    | "localized"
    | "system"
    | "manifest"
    | "registry"
    | "filename"
    | "fallback";
  iconPresent?: boolean;
  fileName?: string;
  bundleId?: string;
  appIdentity?: string;
  launchKind: AppIndexEntryLaunchKind;
  launchTarget: string;
  launchArgs?: string;
  workingDirectory?: string;
  displayPath?: string;
  description?: string;
  alternateNames: string[];
  entrySource?: string;
  entryEnabled: boolean;
}

export interface AppIndexDiagnosticKeyword {
  value: string;
  priority: number;
}

export interface AppIndexDiagnosticMatch {
  itemId: string;
  keyword?: string;
  priority?: number;
  score?: number;
  overlapCount?: number;
}

export interface AppIndexDiagnosticStage {
  ran: boolean;
  targetHit: boolean;
  matches: AppIndexDiagnosticMatch[];
  reason?: string;
}

export interface AppIndexDiagnosticQuery {
  raw: string;
  normalized: string;
  terms: string[];
  ftsQuery: string;
  candidateItemIds: string[];
  stages: {
    precise: AppIndexDiagnosticStage;
    phrase: AppIndexDiagnosticStage;
    prefix: AppIndexDiagnosticStage;
    fts: AppIndexDiagnosticStage;
    ngram: AppIndexDiagnosticStage;
    subsequence: AppIndexDiagnosticStage;
  };
}

export interface AppIndexDiagnoseResult {
  success: boolean;
  status: "found" | "not-found" | "invalid" | "error";
  target: string;
  reason?: string;
  app?: AppIndexDiagnosticApp;
  candidates?: AppIndexDiagnosticApp[];
  index?: {
    itemId: string;
    itemIds: string[];
    aliases: string[];
    generatedKeywords: string[];
    storedKeywords: string[];
    storedKeywordEntries: AppIndexDiagnosticKeyword[];
  };
  query?: AppIndexDiagnosticQuery;
}

export interface AppIndexReindexRequest {
  target: string;
  mode?: "keywords" | "scan";
  force?: boolean;
}

export interface AppIndexReindexResult {
  success: boolean;
  status: "reindexed" | "added" | "updated" | "invalid" | "not-found" | "error";
  path?: string;
  reason?: string;
  message?: string;
  error?: string;
  requiresConfirm?: boolean;
  diagnostic?: AppIndexDiagnoseResult;
}

/**
 * Where a launch was requested from. Mirrors the main-process `UsageEntryPoint` vocabulary so a
 * count can be attributed to the surface that produced it rather than merged into one opaque
 * total.
 */
export type AppLaunchEntryPoint =
  | "core-box"
  | "settings-app-detail"
  | "shortcut"
  | "recommendation";

export interface AppIndexLaunchRequest {
  path: string;
  entryPoint?: AppLaunchEntryPoint;
}

export interface AppIndexLaunchResult {
  success: boolean;
  reason?: "invalid-path" | "not-found" | "blocked" | "error";
  error?: string;
}

/** One hour of the day, 0-23, counted across all recorded launches. */
export type AppUsageHourDistribution = number[];
/** Sunday-first weekday buckets, 0-6. */
export type AppUsageWeekdayDistribution = number[];

export interface AppUsageTransition {
  /** Bundle id or identifier of the app the user came from. */
  fromApp: string;
  /** Resolved display name when the capture knew one. */
  fromAppName?: string;
  count: number;
}

export interface AppUsageEntryPointCount {
  entryPoint: AppLaunchEntryPoint;
  count: number;
}

export interface AppUsageTrendPoint {
  /** Day index, `floor(epochMs / 86400000)` — the key `usage_trend_daily` is bucketed by. */
  day: number;
  /** Start of that day in epoch milliseconds, for formatting on the renderer side. */
  timestamp: number;
  count: number;
}

/**
 * An application launched while this one was in front.
 *
 * Keyed by catalog item id rather than bundle id: the destination is read off the launch log's
 * own `item_id`, which every aggregate row is keyed by. The inbound direction is keyed by bundle
 * id instead, because that is the identity a foreground capture can see.
 */
export interface AppUsageOutboundTransition {
  toItemId: string;
  count: number;
}

export interface AppIndexUsageRequest {
  path: string;
}

/**
 * Per-application usage, assembled from the aggregate tables plus a bounded scan of the raw log
 * for the two dimensions the aggregates deliberately do not carry: entry point and transitions.
 */
export interface AppIndexUsageResult {
  success: boolean;
  reason?: "invalid-path" | "not-found" | "db-not-ready" | "error";
  error?: string;
  itemId?: string;
  /** Total recorded launches, across every entry point. */
  executeCount?: number;
  /** Times this app was shown as a search result. */
  searchCount?: number;
  lastExecutedAt?: number | null;
  hourDistribution?: AppUsageHourDistribution;
  weekdayDistribution?: AppUsageWeekdayDistribution;
  entryPoints?: AppUsageEntryPointCount[];
  /** Apps the user was in immediately before launching this one, most frequent first. */
  transitionsIn?: AppUsageTransition[];
  /** Apps the user launched next while this one was in front, most frequent first. */
  transitionsOut?: AppUsageOutboundTransition[];
  /** Daily launch counts for the trailing window, zero-filled and oldest first. */
  trend?: AppUsageTrendPoint[];
}

export interface AppIndexSetAliasesRequest {
  path: string;
  aliases: string[];
}

export interface AppIndexGetAliasesRequest {
  path: string;
}

export interface AppIndexGetAliasesResult {
  success: boolean;
  reason?: "invalid-path" | "not-found";
  aliases?: string[];
}

export interface AppIndexGetShortcutRequest {
  path: string;
}

export interface AppIndexGetShortcutResult {
  success: boolean;
  /** Null when this application has no bound accelerator. */
  accelerator?: string | null;
}

export interface AppIndexSetShortcutRequest {
  path: string;
  /** An empty string clears the binding. */
  accelerator: string;
}
