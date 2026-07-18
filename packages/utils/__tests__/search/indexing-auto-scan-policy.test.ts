import { describe, expect, it } from "vitest";
import { resolveIndexedAutoScanPreflight } from "../../search";

const readyInput = {
  autoScanEnabled: true,
  isInitializing: false,
  hasDbContext: true,
  hasInitializationContext: true,
  watchPathCount: 1,
  appBusy: false,
  searchActive: false,
  hasEligiblePaths: true,
};

describe("indexing auto scan policy", () => {
  it("allows auto scan when all preflight gates pass", () => {
    expect(resolveIndexedAutoScanPreflight(readyInput)).toEqual({
      allowed: true,
    });
  });

  it("allows early preflight before scan eligibility is known", () => {
    const { hasEligiblePaths: _hasEligiblePaths, ...input } = readyInput;

    expect(resolveIndexedAutoScanPreflight(input)).toEqual({ allowed: true });
  });

  it.each([
    ["disabled", { autoScanEnabled: false }],
    ["initializing", { isInitializing: true }],
    ["missing-context", { hasDbContext: false }],
    ["missing-context", { hasInitializationContext: false }],
    ["no-paths", { watchPathCount: 0 }],
    ["app-busy", { appBusy: true }],
    ["search-active", { searchActive: true }],
    ["interval", { hasEligiblePaths: false }],
  ] as const)("returns %s when its gate fails", (reason, patch) => {
    expect(
      resolveIndexedAutoScanPreflight({ ...readyInput, ...patch }),
    ).toEqual({
      allowed: false,
      reason,
    });
  });

  it("keeps deterministic gate priority", () => {
    expect(
      resolveIndexedAutoScanPreflight({
        ...readyInput,
        autoScanEnabled: false,
        isInitializing: true,
        appBusy: true,
      }),
    ).toEqual({ allowed: false, reason: "disabled" });
  });
});
