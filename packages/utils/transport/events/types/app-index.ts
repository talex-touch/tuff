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

export type AppIndexEntryLaunchKind = "path" | "shortcut" | "uwp";

export interface AppIndexManagedEntry {
  path: string;
  name: string;
  displayName?: string;
  icon?: string;
  enabled: boolean;
  launchKind: AppIndexEntryLaunchKind;
  launchTarget: string;
  launchArgs?: string;
  workingDirectory?: string;
  displayPath?: string;
  description?: string;
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
}

export interface AppIndexReindexResult {
  success: boolean;
  status: "reindexed" | "added" | "updated" | "invalid" | "not-found" | "error";
  path?: string;
  reason?: string;
  diagnostic?: AppIndexDiagnoseResult;
}
