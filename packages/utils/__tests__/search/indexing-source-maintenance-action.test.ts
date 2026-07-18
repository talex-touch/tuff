import type { IndexedSourceDiagnostics } from "../../search";
import { describe, expect, it } from "vitest";
import { resolveIndexedSourceMaintenanceActions } from "../../search";

function buildSource(
  overrides: Partial<IndexedSourceDiagnostics> = {},
): IndexedSourceDiagnostics {
  return {
    descriptor: {
      id: "file-provider",
      kind: "file",
      displayName: "File",
      platforms: ["darwin", "win32", "linux"],
      priority: "deferred",
      storage: "sqlite-index",
      privacy: "medium",
      capabilities: {
        scan: true,
        watch: true,
        reconcile: true,
        reset: true,
        clear: true,
        open: true,
      },
      admission: {
        owner: "core",
        permissionScopes: ["file-system"],
        defaultState: "enabled",
        clearable: true,
        rebuildable: true,
      },
    },
    health: {
      status: "ready",
      permissionState: "granted",
      itemCount: 12,
      watchState: "active",
      reconcileState: "idle",
    },
    roots: [],
    ...overrides,
  };
}

describe("indexed source maintenance action policy", () => {
  it("enables scan, reconcile, and reset for a healthy source", () => {
    expect(resolveIndexedSourceMaintenanceActions(buildSource())).toEqual([
      { action: "scan", enabled: true, reason: undefined },
      { action: "reconcile", enabled: true, reason: undefined },
      { action: "reset", enabled: true },
    ]);
  });

  it("blocks scan and reconcile when source health is not executable", () => {
    const actions = resolveIndexedSourceMaintenanceActions(
      buildSource({
        health: {
          status: "permission-required",
          permissionState: "denied",
          itemCount: 0,
          watchState: "pending-permission",
          reconcileState: "idle",
        },
      }),
    );

    expect(actions).toMatchObject([
      { action: "scan", enabled: false, reason: "health:permission-required" },
      {
        action: "reconcile",
        enabled: false,
        reason: "health:permission-required",
      },
      { action: "reset", enabled: true },
    ]);
  });

  it("blocks unsupported reset actions without hiding scan capability reasons", () => {
    const actions = resolveIndexedSourceMaintenanceActions(
      buildSource({
        descriptor: {
          ...buildSource().descriptor,
          capabilities: {
            scan: false,
            watch: false,
            reconcile: false,
            clear: false,
            open: true,
          },
        },
      }),
    );

    expect(actions).toEqual([
      {
        action: "scan",
        enabled: false,
        reason: "capability:scan-not-supported",
      },
      {
        action: "reconcile",
        enabled: false,
        reason: "capability:reconcile-not-supported",
      },
      {
        action: "reset",
        enabled: false,
        reason: "capability:reset-not-supported",
      },
    ]);
  });

  it("blocks admission-invalid high privacy sources before maintenance runs", () => {
    const actions = resolveIndexedSourceMaintenanceActions(
      buildSource({
        descriptor: {
          ...buildSource().descriptor,
          privacy: "high",
          admission: {
            owner: "core",
            permissionScopes: ["file-system"],
            defaultState: "enabled",
            clearable: true,
            rebuildable: true,
          },
        },
      }),
    );

    expect(actions.map((action) => action.reason)).toEqual([
      "admission:high-privacy-requires-explicit-enable",
      "admission:high-privacy-requires-explicit-enable",
      "admission:high-privacy-requires-explicit-enable",
    ]);
  });
});
