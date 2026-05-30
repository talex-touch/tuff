import type { IndexedSourceDescriptor } from "../../search";
import { describe, expect, it } from "vitest";
import {
  getIndexedSourceAdmissionIssues,
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  isIndexedSourceAdmissionReady,
  resolveIndexedSourceTaskEligibility,
} from "../../search";

function buildDescriptor(
  overrides: Partial<IndexedSourceDescriptor> = {},
): IndexedSourceDescriptor {
  return {
    id: "quicklink",
    kind: "quicklink",
    displayName: "Quicklinks",
    platforms: ["darwin", "win32", "linux"],
    priority: "fast",
    storage: "sqlite-index",
    privacy: "low",
    capabilities: {
      scan: true,
      watch: true,
      reconcile: true,
      clear: true,
      open: true,
    },
    admission: {
      owner: "official-plugin",
      permissionScopes: ["none"],
      defaultState: "enabled",
      clearable: true,
      rebuildable: true,
    },
    ...overrides,
  };
}

describe("indexedSource admission", () => {
  it("exports standard reconcile reason codes", () => {
    expect(IndexedSourceReconcileReasons).toMatchObject({
      Scheduled: "scheduled",
      ManualRepair: "manual-repair",
      WatchGap: "watch-gap",
      WatchRootRecovered: "file-watch-root-recovered",
      Unsupported: "reconcile-not-supported",
    });
  });

  it("exports standard scan reason codes", () => {
    expect(IndexedSourceScanReasons).toMatchObject({
      Startup: "startup",
      ManualRebuild: "manual-rebuild",
      Scheduled: "scheduled",
      WatchRecovery: "watch-recovery",
      SchemaMigration: "schema-migration",
      HealthRepair: "health-repair",
    });
  });

  it("exports standard reset reason codes", () => {
    expect(IndexedSourceResetReasons).toMatchObject({
      ManualRebuild: "manual-rebuild",
      SchemaMigration: "schema-migration",
      IntegrityRepair: "integrity-repair",
      HealthRepair: "health-repair",
      UserClear: "user-clear",
    });
  });

  it("accepts a complete indexed source descriptor", () => {
    const descriptor = buildDescriptor();

    expect(getIndexedSourceAdmissionIssues(descriptor)).toEqual([]);
    expect(isIndexedSourceAdmissionReady(descriptor)).toBe(true);
  });

  it("requires browser data sources to be high privacy and scoped", () => {
    const descriptor = buildDescriptor({
      kind: "browser-history",
      privacy: "medium",
      admission: {
        owner: "official-plugin",
        permissionScopes: ["file-system"],
        defaultState: "ask",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
      },
    });

    expect(getIndexedSourceAdmissionIssues(descriptor)).toEqual([
      "browser-data-requires-high-privacy",
      "missing-permission-scope",
    ]);
    expect(isIndexedSourceAdmissionReady(descriptor)).toBe(false);
  });

  it("requires persistent indexed sources to be clearable", () => {
    const descriptor = buildDescriptor({
      storage: "sqlite-index",
      admission: {
        owner: "third-party-plugin",
        permissionScopes: ["file-system"],
        defaultState: "ask",
        clearable: false,
        rebuildable: true,
      },
    });

    expect(getIndexedSourceAdmissionIssues(descriptor)).toEqual([
      "persistent-source-must-be-clearable",
    ]);
  });

  it("guards external fast sources to trusted external-tool scopes", () => {
    const descriptor = buildDescriptor({
      storage: "external-fast",
      capabilities: {
        scan: false,
        watch: false,
        reconcile: true,
        clear: false,
        open: true,
      },
      admission: {
        owner: "third-party-plugin",
        permissionScopes: ["file-system"],
        defaultState: "enabled",
        clearable: false,
        rebuildable: false,
      },
    });

    expect(getIndexedSourceAdmissionIssues(descriptor)).toEqual([
      "external-fast-requires-external-tool-permission",
      "external-fast-cannot-be-third-party",
    ]);
  });

  it("resolves task eligibility from admission, capability and health", () => {
    const descriptor = buildDescriptor();

    expect(
      resolveIndexedSourceTaskEligibility({
        descriptor,
        task: "scan",
        health: {
          status: "ready",
          permissionState: "granted",
          itemCount: 1,
          watchState: "active",
          reconcileState: "idle",
        },
      }),
    ).toEqual({ eligible: true });

    expect(
      resolveIndexedSourceTaskEligibility({
        descriptor,
        task: "scan",
        health: {
          status: "disabled",
          permissionState: "promptable",
          itemCount: 0,
          watchState: "pending-permission",
          reconcileState: "idle",
        },
      }),
    ).toEqual({
      eligible: false,
      reason: "health:disabled",
    });

    expect(
      resolveIndexedSourceTaskEligibility({
        descriptor: buildDescriptor({
          capabilities: {
            scan: false,
            watch: false,
            reconcile: true,
            clear: true,
            open: true,
          },
        }),
        task: "scan",
        health: {
          status: "ready",
          permissionState: "granted",
          itemCount: 1,
          watchState: "not-supported",
          reconcileState: "idle",
        },
      }),
    ).toEqual({
      eligible: false,
      reason: "capability:scan-not-supported",
    });

    expect(
      resolveIndexedSourceTaskEligibility({
        descriptor: buildDescriptor({
          capabilities: {
            scan: true,
            watch: false,
            reconcile: true,
            clear: true,
            open: true,
          },
        }),
        task: "watch",
        health: {
          status: "ready",
          permissionState: "granted",
          itemCount: 1,
          watchState: "not-supported",
          reconcileState: "idle",
        },
      }),
    ).toEqual({
      eligible: false,
      reason: "capability:watch-not-supported",
    });
  });

  it("returns admission task skip reasons for invalid descriptors", () => {
    expect(
      resolveIndexedSourceTaskEligibility({
        descriptor: buildDescriptor({
          privacy: "high",
          admission: {
            owner: "official-plugin",
            permissionScopes: ["file-system"],
            defaultState: "enabled",
            clearable: true,
            rebuildable: true,
          },
        }),
        task: "reconcile",
        health: {
          status: "ready",
          permissionState: "granted",
          itemCount: 1,
          watchState: "active",
          reconcileState: "idle",
        },
      }),
    ).toEqual({
      eligible: false,
      reason: "admission:high-privacy-requires-explicit-enable",
    });
  });
});
