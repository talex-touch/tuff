export type IndexedAutoScanSkipReason =
  | "disabled"
  | "initializing"
  | "missing-context"
  | "no-paths"
  | "app-busy"
  | "search-active"
  | "interval";

export interface IndexedAutoScanPreflightInput {
  autoScanEnabled: boolean;
  isInitializing: boolean;
  hasDbContext: boolean;
  hasInitializationContext: boolean;
  watchPathCount: number;
  appBusy: boolean;
  searchActive: boolean;
  hasEligiblePaths?: boolean;
}

export interface IndexedAutoScanPreflightDecision {
  allowed: boolean;
  reason?: IndexedAutoScanSkipReason;
}

export function resolveIndexedAutoScanPreflight(
  input: IndexedAutoScanPreflightInput,
): IndexedAutoScanPreflightDecision {
  if (!input.autoScanEnabled) {
    return { allowed: false, reason: "disabled" };
  }

  if (input.isInitializing) {
    return { allowed: false, reason: "initializing" };
  }

  if (!input.hasDbContext || !input.hasInitializationContext) {
    return { allowed: false, reason: "missing-context" };
  }

  if (input.watchPathCount === 0) {
    return { allowed: false, reason: "no-paths" };
  }

  if (input.appBusy) {
    return { allowed: false, reason: "app-busy" };
  }

  if (input.searchActive) {
    return { allowed: false, reason: "search-active" };
  }

  if (input.hasEligiblePaths === false) {
    return { allowed: false, reason: "interval" };
  }

  return { allowed: true };
}
