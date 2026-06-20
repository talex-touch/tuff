import type {
  IndexedSourceDescriptor,
  IndexedSourceDiagnostics,
} from "../../search";
import { describe, expect, it } from "vitest";
import {
  appendIndexedSourceTaskHistory,
  createBrowserBookmarksIndexedSourceDescriptor,
  createBrowserHistoryIndexedSourceDescriptor,
  createIndexedSourceDescriptorTemplate,
  createQuicklinksIndexedSourceDescriptor,
  deriveSearchProvidersFromPushFeatures,
  DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT,
  getIndexedSourceAdmissionIssues,
  getIndexedSourceLifecycleIssues,
  createSearchProviderDescriptorFromManifest,
  getSearchProviderManifestCoverage,
  getSearchProviderIdsForIndexedSource,
  getIndexedSourceContractIssues,
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  mapIndexedFileSourceRecord,
  isSearchProviderEnabledByConfig,
  isIndexedSourceAdmissionReady,
  isIndexedSourceContractReady,
  isIndexedSourceLifecycleReady,
  createSystemSettingsIndexedSourceDescriptor,
  normalizeSearchProviderUserConfigs,
  isIndexedSourceEnabledByProviderConfig,
  resolveIndexedSourceRootSkipReason,
  resolveIndexedSourceProviderConfigEnablement,
  resolveSearchProviderManifestDescriptors,
  resolveSearchProviderPermissionIds,
  resolveIndexedSourceManifestDescriptors,
  resolveIndexedSourcePermissionIds,
  resolveSearchProviderRegistrationDecision,
  resolveIndexedSourceTaskEligibility,
  resolveIndexedSourceWatchRootRoute,
  toIndexedSourceRecordTimestamp,
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
  it("builds reusable Quicklinks, Browser Data, and System Settings source descriptor templates", () => {
    const quicklinks = createQuicklinksIndexedSourceDescriptor();
    const browserBookmarks = createBrowserBookmarksIndexedSourceDescriptor();
    const browserHistory = createBrowserHistoryIndexedSourceDescriptor();
    const systemSettings = createSystemSettingsIndexedSourceDescriptor();

    expect(quicklinks).toMatchObject({
      id: "quicklinks",
      kind: "quicklink",
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
    });
    expect(getIndexedSourceAdmissionIssues(quicklinks)).toEqual([]);

    expect(browserBookmarks).toMatchObject({
      id: "browser-bookmarks",
      kind: "browser-bookmark",
      priority: "deferred",
      storage: "sqlite-index",
      privacy: "high",
      capabilities: {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true,
      },
      admission: {
        owner: "official-plugin",
        permissionScopes: ["browser-data", "file-system"],
        defaultState: "disabled",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
      },
    });
    expect(getIndexedSourceAdmissionIssues(browserBookmarks)).toEqual([]);

    expect(browserHistory).toMatchObject({
      id: "browser-history",
      kind: "browser-history",
      priority: "deferred",
      storage: "sqlite-index",
      privacy: "high",
      capabilities: {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true,
      },
      admission: {
        owner: "official-plugin",
        permissionScopes: ["browser-data", "file-system"],
        defaultState: "disabled",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
      },
    });
    expect(getIndexedSourceAdmissionIssues(browserHistory)).toEqual([]);

    expect(systemSettings).toMatchObject({
      id: "system-settings",
      kind: "system-setting",
      priority: "fast",
      storage: "ephemeral",
      privacy: "low",
      capabilities: {
        scan: true,
        watch: false,
        reconcile: true,
        clear: false,
        open: true,
      },
      admission: {
        owner: "core",
        permissionScopes: ["system-index"],
        defaultState: "enabled",
        clearable: false,
        rebuildable: true,
      },
    });
    expect(getIndexedSourceAdmissionIssues(systemSettings)).toEqual([]);
  });

  it("allows source descriptor templates to be overridden without changing admission rules", () => {
    const descriptor = createIndexedSourceDescriptorTemplate(
      "browser-bookmarks",
      {
        id: "touch-browser-data.browser-bookmarks",
        displayName: "Touch Browser Bookmarks",
        admission: {
          notes: "Official plugin-owned browser bookmarks source",
        },
      },
    );

    expect(descriptor).toMatchObject({
      id: "touch-browser-data.browser-bookmarks",
      displayName: "Touch Browser Bookmarks",
      kind: "browser-bookmark",
      privacy: "high",
      admission: {
        owner: "official-plugin",
        permissionScopes: ["browser-data", "file-system"],
        defaultState: "disabled",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
      },
    });
    expect(isIndexedSourceAdmissionReady(descriptor)).toBe(true);
  });

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

  it("validates source lifecycle handlers against declared capabilities", () => {
    const source = {
      descriptor: buildDescriptor({
        capabilities: {
          scan: true,
          watch: true,
          reconcile: true,
          search: true,
          reset: true,
          clear: true,
          open: true,
        },
      }),
      getHealth: async () => ({
        status: "ready" as const,
        permissionState: "granted" as const,
        itemCount: 1,
        watchState: "active" as const,
        reconcileState: "idle" as const,
      }),
      getRoots: async () => [],
      async *scan () {
        yield { sourceId: "quicklink", records: [], done: true };
      },
      reconcile: async () => ({
        sourceId: "quicklink",
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
        startedAt: 1,
        completedAt: 2,
      }),
      handleWatchEvent: async () => [],
      search: async () => ({ sourceId: "quicklink", records: [] }),
      resetIndex: async () => ({
        sourceId: "quicklink",
        reason: "manual-rebuild" as const,
        clearedSearchIndex: false,
        clearedScanProgress: false,
        startedAt: 1,
        completedAt: 2,
      }),
      clearIndex: async () => {},
      open: async () => ({ status: "started" as const }),
    };

    expect(getIndexedSourceLifecycleIssues(source)).toEqual([]);
    expect(isIndexedSourceLifecycleReady(source)).toBe(true);
    expect(getIndexedSourceContractIssues(source)).toEqual({
      admission: [],
      lifecycle: [],
      ready: true,
    });
    expect(isIndexedSourceContractReady(source)).toBe(true);
  });

  it("reports lifecycle capability declarations without matching handlers", () => {
    const source = {
      descriptor: buildDescriptor({
        capabilities: {
          scan: true,
          watch: true,
          reconcile: false,
          search: true,
          reset: true,
          clear: true,
          open: true,
        },
      }),
      getHealth: async () => ({
        status: "ready" as const,
        permissionState: "granted" as const,
        itemCount: 1,
        watchState: "active" as const,
        reconcileState: "idle" as const,
      }),
      getRoots: async () => [],
      async *scan () {
        yield { sourceId: "quicklink", records: [], done: true };
      },
      reconcile: async () => ({
        sourceId: "quicklink",
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 0,
        errors: 0,
        startedAt: 1,
        completedAt: 2,
      }),
    };

    expect(getIndexedSourceLifecycleIssues(source)).toEqual([
      "watch-capability-missing-handler",
      "search-capability-missing-handler",
      "reset-capability-missing-handler",
      "clear-capability-missing-handler",
      "open-capability-missing-handler",
      "handler-provided-without-capability",
    ]);
    expect(isIndexedSourceLifecycleReady(source)).toBe(false);
    expect(getIndexedSourceContractIssues(source)).toMatchObject({
      admission: ["watch-capability-requires-reconcile"],
      ready: false,
    });
  });

  it("summarizes admission and lifecycle contract issues together", () => {
    const source = {
      descriptor: buildDescriptor({
        privacy: "high",
        capabilities: {
          scan: true,
          watch: true,
          reconcile: true,
          clear: true,
          open: true,
        },
        admission: {
          owner: "official-plugin",
          permissionScopes: ["file-system"],
          defaultState: "enabled",
          clearable: true,
          rebuildable: true,
        },
      }),
      getHealth: async () => ({
        status: "ready" as const,
        permissionState: "granted" as const,
        itemCount: 1,
        watchState: "active" as const,
        reconcileState: "idle" as const,
      }),
      getRoots: async () => [],
      async *scan () {
        yield { sourceId: "quicklink", records: [], done: true };
      },
    };

    expect(getIndexedSourceContractIssues(source)).toEqual({
      admission: ["high-privacy-requires-explicit-enable"],
      lifecycle: [
        "watch-capability-missing-handler",
        "reconcile-capability-missing-handler",
        "clear-capability-missing-handler",
        "open-capability-missing-handler",
      ],
      ready: false,
    });
    expect(isIndexedSourceContractReady(source)).toBe(false);
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

  it("resolves watch root routing and permission skip reasons through SDK helpers", () => {
    const roots = [
      {
        sourceId: "files",
        path: "C:\\Users\\Boss\\Documents",
        permissionState: "granted" as const,
      },
      {
        sourceId: "files",
        path: "C:\\Users\\Boss\\Private",
        permissionState: "promptable" as const,
      },
    ];

    expect(
      resolveIndexedSourceWatchRootRoute(
        {
          action: "change",
          path: "c:/users/boss/documents/a.txt",
          occurredAt: 1,
        },
        roots,
        { platform: "win32" },
      ),
    ).toMatchObject({
      eligible: true,
      root: { path: "C:\\Users\\Boss\\Documents" },
    });

    expect(
      resolveIndexedSourceWatchRootRoute(
        {
          action: "change",
          path: "C:/Users/Boss/Private/a.txt",
          occurredAt: 1,
        },
        roots,
        { platform: "win32" },
      ),
    ).toMatchObject({
      eligible: false,
      reason: "root-permission:promptable",
    });
    expect(resolveIndexedSourceRootSkipReason(roots[1])).toBe(
      "root-permission:promptable",
    );
  });

  it("keeps Linux watch root matching case-sensitive by default", () => {
    const roots = [
      {
        sourceId: "files",
        path: "/Users/Boss/Documents",
        permissionState: "granted" as const,
      },
    ];

    expect(
      resolveIndexedSourceWatchRootRoute(
        {
          action: "change",
          path: "/users/boss/documents/a.txt",
          occurredAt: 1,
        },
        roots,
        { platform: "linux" },
      ),
    ).toBeNull();

    expect(
      resolveIndexedSourceWatchRootRoute(
        {
          action: "change",
          path: "/users/boss/documents/a.txt",
          occurredAt: 1,
        },
        roots,
        { platform: "linux", caseSensitive: false },
      ),
    ).toMatchObject({
      eligible: true,
    });
  });

  it("appends indexed source task history newest first with a bounded limit", () => {
    const current = Array.from(
      { length: DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT },
      (_, index) => ({
        kind: "scan" as const,
        status: "succeeded" as const,
        completedAt: index + 1,
        jobId: `scan:${index + 1}`,
      }),
    );

    const next = appendIndexedSourceTaskHistory(current, {
      kind: "watch",
      status: "skipped",
      completedAt: 99,
      jobId: "watch:99",
      error: "skipped:health:disabled",
    });

    expect(next).toHaveLength(DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT);
    expect(next[0]).toMatchObject({
      kind: "watch",
      status: "skipped",
      jobId: "watch:99",
    });
    expect(next.at(-1)).toMatchObject({
      jobId: "scan:2",
    });
  });

  it("keeps the latest indexed source task history entries when existing history is unsorted", () => {
    const next = appendIndexedSourceTaskHistory(
      [
        {
          kind: "scan",
          status: "succeeded",
          completedAt: 1,
          jobId: "scan:old",
        },
        {
          kind: "scan",
          status: "failed",
          completedAt: 5,
          jobId: "scan:newer",
        },
      ],
      {
        kind: "watch",
        status: "failed",
        completedAt: 3,
        jobId: "watch:middle",
      },
      2,
    );

    expect(next.map((task) => task.jobId)).toEqual(["scan:newer", "watch:middle"]);
  });

  it("normalizes invalid indexed source task history limits to empty history", () => {
    expect(
      appendIndexedSourceTaskHistory(
        [
          {
            kind: "scan",
            status: "succeeded",
            completedAt: 1,
          },
        ],
        {
          kind: "reset",
          status: "failed",
          completedAt: 2,
          error: "reset failed",
        },
        0,
      ),
    ).toEqual([]);
  });

  it("drops indexed source task history entries with invalid completedAt values", () => {
    const next = appendIndexedSourceTaskHistory(
      [
        {
          kind: "scan",
          status: "succeeded",
          completedAt: Number.NaN,
          jobId: "bad-existing",
        },
        {
          kind: "scan",
          status: "succeeded",
          completedAt: 10,
          jobId: "valid-existing",
        },
      ],
      {
        kind: "watch",
        status: "failed",
        completedAt: Number.POSITIVE_INFINITY,
        jobId: "bad-new",
      },
    );

    expect(next).toEqual([
      {
        kind: "scan",
        status: "succeeded",
        completedAt: 10,
        jobId: "valid-existing",
      },
    ]);
  });

  it("sanitizes indexed source task history entries before exposing bounded history", () => {
    const currentSummary = {
      kept: "yes",
      ok: true,
      count: 2,
      missing: undefined,
      badObject: { nested: true },
      badArray: ["nested"],
      badNumber: Number.NaN,
    };
    const next = appendIndexedSourceTaskHistory(
      [
        {
          kind: "unknown" as never,
          status: "succeeded",
          completedAt: 5,
          jobId: "bad-kind",
        },
        {
          kind: "scan",
          status: "unknown" as never,
          completedAt: 6,
          jobId: "bad-status",
        },
        {
          kind: "scan",
          status: "succeeded",
          completedAt: 10,
          queuedAt: 12,
          startedAt: -1,
          occurredAt: Number.POSITIVE_INFINITY,
          jobId: "valid-existing",
          summary: currentSummary as never,
        },
      ],
      {
        kind: "watch",
        status: "failed",
        completedAt: 20,
        queuedAt: -1,
        occurredAt: 25,
        error: 123 as never,
        summary: {
          action: "change",
          failed: true,
          badNumber: Number.POSITIVE_INFINITY,
          nested: { bad: true },
        } as never,
      },
    );

    currentSummary.kept = "mutated";

    expect(next).toEqual([
      {
        kind: "watch",
        status: "failed",
        completedAt: 20,
        occurredAt: 20,
        summary: {
          action: "change",
          failed: true,
        },
      },
      {
        kind: "scan",
        status: "succeeded",
        completedAt: 10,
        queuedAt: 10,
        jobId: "valid-existing",
        summary: {
          kept: "yes",
          ok: true,
          count: 2,
          missing: undefined,
        },
      },
    ]);
  });

  it("allows diagnostics to carry source-level progress and ETA", () => {
    const diagnostics: IndexedSourceDiagnostics = {
      descriptor: buildDescriptor(),
      health: {
        status: "warming",
        permissionState: "granted",
        itemCount: 12,
        watchState: "active",
        reconcileState: "running",
      },
      roots: [],
      progress: {
        sourceId: "quicklink",
        stage: "indexing",
        status: "estimated",
        current: 20,
        total: 100,
        progress: 20,
        startedAt: 1,
        updatedAt: 2,
        estimatedRemainingMs: 4000,
        estimatedCompletionAt: 6000,
        averageItemsPerSecond: 20,
        speedSampleCount: 2,
        estimateBasis: "stage-speed",
      },
    };

    expect(diagnostics.progress).toMatchObject({
      sourceId: "quicklink",
      status: "estimated",
      estimatedRemainingMs: 4000,
      estimateBasis: "stage-speed",
    });
  });
});

describe("indexed file source record mapping", () => {
  it("maps file rows into reusable indexed source records", () => {
    expect(
      mapIndexedFileSourceRecord(
        {
          path: "/Users/boss/Documents/spec.md",
          name: "spec.md",
          displayName: "Product Spec",
          extension: ".md",
          size: 1024,
          mtime: new Date(2000),
          type: "document",
          isDir: false,
        },
        { sourceId: "file-provider" },
      ),
    ).toEqual({
      sourceId: "file-provider",
      recordId: "/Users/boss/Documents/spec.md",
      stableKey: "/Users/boss/Documents/spec.md",
      kind: "file",
      title: "Product Spec",
      subtitle: "/Users/boss/Documents/spec.md",
      path: "/Users/boss/Documents/spec.md",
      mtime: 2000,
      size: 1024,
      metadata: {
        extension: ".md",
        type: "document",
        isDir: false,
      },
    });
  });

  it("normalizes optional file row fields without leaking null metadata values", () => {
    expect(
      mapIndexedFileSourceRecord(
        {
          path: "/Users/boss/Downloads/archive",
          name: "archive",
          displayName: null,
          extension: null,
          size: null,
          mtime: "not-a-date",
          type: null,
          isDir: null,
        },
        { sourceId: "file-provider" },
      ),
    ).toMatchObject({
      title: "archive",
      mtime: undefined,
      size: undefined,
      metadata: {
        extension: undefined,
        type: "file",
        isDir: false,
      },
    });
  });

  it("converts valid timestamp inputs and drops invalid timestamp values", () => {
    expect(toIndexedSourceRecordTimestamp(new Date(1000))).toBe(1000);
    expect(toIndexedSourceRecordTimestamp(2000)).toBe(2000);
    expect(toIndexedSourceRecordTimestamp("1970-01-01T00:00:03.000Z")).toBe(
      3000,
    );
    expect(toIndexedSourceRecordTimestamp("")).toBeUndefined();
    expect(toIndexedSourceRecordTimestamp("invalid")).toBeUndefined();
    expect(toIndexedSourceRecordTimestamp(null)).toBeUndefined();
  });
});

describe("search provider sdk contracts", () => {
  it("normalizes provider enabled state and ordering from descriptors plus user config", () => {
    const configs = normalizeSearchProviderUserConfigs(
      [
        {
          id: "app-provider",
          displayName: "Apps",
          kind: "app",
          owner: "core",
          mode: "indexed",
          priority: "fast",
          defaultOrder: 10,
          policy: {
            owner: "core",
            mode: "indexed",
            permissionScopes: ["none"],
            defaultState: "enabled",
          },
        },
        {
          id: "browser-bookmarks",
          displayName: "Browser Bookmarks",
          kind: "browser-bookmark",
          owner: "official-plugin",
          mode: "indexed",
          priority: "deferred",
          defaultOrder: 40,
          policy: {
            owner: "official-plugin",
            mode: "indexed",
            permissionScopes: ["browser-data", "file-system"],
            defaultState: "ask",
            requiresUserConsent: true,
          },
        },
      ],
      [{ providerId: "browser-bookmarks", enabled: true, order: 5 }],
    );

    expect(configs.map((config) => config.providerId)).toEqual([
      "browser-bookmarks",
      "app-provider",
    ]);
    expect(configs[0]).toMatchObject({
      providerId: "browser-bookmarks",
      enabled: true,
      order: 5,
    });
    expect(configs[1]).toMatchObject({
      providerId: "app-provider",
      enabled: true,
      order: 10,
    });
  });

  it("resolves provider enablement through normalized sdk config", () => {
    const descriptors = [
      createSearchProviderDescriptorFromManifest(
        {
          id: "plugin.ask",
          mode: "push",
          permissionScopes: ["root-results"],
          defaultState: "ask",
          requiresUserConsent: true,
        },
        { pluginName: "plugin" },
      ),
      createSearchProviderDescriptorFromManifest(
        {
          id: "plugin.default-on",
          mode: "push",
          permissionScopes: ["root-results"],
          defaultState: "enabled",
        },
        { pluginName: "plugin" },
      ),
    ];

    expect(isSearchProviderEnabledByConfig("plugin.ask", descriptors)).toBe(
      false,
    );
    expect(
      isSearchProviderEnabledByConfig("plugin.default-on", descriptors),
    ).toBe(true);
    expect(
      isSearchProviderEnabledByConfig("plugin.ask", descriptors, [
        { providerId: "plugin.ask", enabled: true, order: 1 },
      ]),
    ).toBe(true);
    expect(
      isSearchProviderEnabledByConfig("plugin.default-on", descriptors, [
        { providerId: "plugin.default-on", enabled: false, order: 1 },
      ]),
    ).toBe(false);
    expect(isSearchProviderEnabledByConfig("missing", descriptors)).toBe(false);
  });

  it("requires explicit root-result permission for third-party push providers", () => {
    expect(
      resolveSearchProviderRegistrationDecision({
        id: "plugin.quicklinks",
        displayName: "Quicklinks",
        kind: "quicklink",
        owner: "third-party-plugin",
        mode: "push",
        priority: "fast",
        defaultOrder: 20,
        policy: {
          owner: "third-party-plugin",
          mode: "push",
          permissionScopes: ["none"],
          defaultState: "ask",
          pushesToRootResults: true,
          requiresUserConsent: true,
        },
      }),
    ).toEqual({
      status: "blocked",
      issues: ["third-party-push-requires-root-results"],
    });
  });

  it("requires explicit consent for third-party push providers", () => {
    expect(
      resolveSearchProviderRegistrationDecision({
        id: "plugin.quicklinks",
        displayName: "Quicklinks",
        kind: "quicklink",
        owner: "third-party-plugin",
        mode: "push",
        priority: "fast",
        defaultOrder: 20,
        policy: {
          owner: "third-party-plugin",
          mode: "push",
          permissionScopes: ["root-results"],
          defaultState: "enabled",
          pushesToRootResults: true,
          requiresUserConsent: false,
        },
      }),
    ).toEqual({
      status: "blocked",
      issues: ["third-party-push-requires-explicit-consent"],
    });
  });

  it("maps root-result provider scopes to manifest permissions", () => {
    expect(
      resolveSearchProviderPermissionIds([
        "root-results",
        "file-system",
        "network",
        "root-results",
      ]),
    ).toEqual(["search.root-results", "fs.index", "network.internet"]);
  });

  it("normalizes manifest search provider declarations into runtime descriptors", () => {
    expect(
      createSearchProviderDescriptorFromManifest(
        {
          id: "touch-quicklinks",
          displayName: "Quicklinks",
          mode: "push",
          permissionScopes: ["root-results"],
          defaultState: "ask",
          requiresUserConsent: true,
          pushesToRootResults: true,
        },
        {
          pluginName: "touch-quicklinks",
          defaultOrder: 120,
        },
      ),
    ).toMatchObject({
      id: "touch-quicklinks",
      displayName: "Quicklinks",
      kind: "plugin",
      owner: "third-party-plugin",
      mode: "push",
      priority: "fast",
      defaultOrder: 120,
      policy: {
        owner: "third-party-plugin",
        mode: "push",
        permissionScopes: ["root-results"],
        defaultState: "ask",
        requiresUserConsent: true,
        pushesToRootResults: true,
      },
    });
  });

  it("summarizes push-feature provider manifest coverage", () => {
    expect(
      getSearchProviderManifestCoverage(
        [
          { id: "quicklinks", name: "Quicklinks", push: true },
          { id: "settings", name: "Settings", push: false },
        ],
        [],
      ),
    ).toEqual({
      pushFeatureIds: ["quicklinks"],
      pushFeatureCount: 1,
      explicitProviderCount: 0,
      hasPushFeatures: true,
      hasExplicitProviders: false,
      needsExplicitProviderMigration: true,
    });

    expect(
      getSearchProviderManifestCoverage(
        [{ id: "quicklinks", name: "Quicklinks", push: true }],
        [
          {
            id: "plugin.quicklinks",
            mode: "push",
            permissionScopes: ["root-results"],
            defaultState: "ask",
          },
        ],
      ),
    ).toMatchObject({
      explicitProviderCount: 1,
      hasExplicitProviders: true,
      needsExplicitProviderMigration: false,
    });
  });

  it("derives legacy push-feature provider descriptors through the public sdk helper", () => {
    expect(
      deriveSearchProvidersFromPushFeatures(
        [{ id: "quicklinks", name: "Quicklinks", push: true }],
        { pluginName: "touch-quicklinks", defaultOrder: 120 },
      ),
    ).toEqual([
      {
        id: "touch-quicklinks.root-results",
        displayName: "Quicklinks",
        featureId: "quicklinks",
        kind: "plugin",
        mode: "push",
        permissionScopes: ["root-results"],
        defaultState: "ask",
        requiresUserConsent: true,
        pushesToRootResults: true,
        defaultOrder: 120,
      },
    ]);

    expect(
      deriveSearchProvidersFromPushFeatures(
        [
          { id: "open", name: "Open", push: true },
          { id: "search", name: "Search", push: true },
        ],
        { pluginName: "touch-browser-open", defaultOrder: 70 },
      ).map((provider) => provider.id),
    ).toEqual(["touch-browser-open.open", "touch-browser-open.search"]);
  });

  it("resolves manifest providers with policy and permission issues in one sdk pass", () => {
    const result = resolveSearchProviderManifestDescriptors({
      manifestProviders: [
        {
          id: "plugin.quicklinks",
          mode: "push",
          permissionScopes: ["none"],
          defaultState: "ask",
          requiresUserConsent: true,
        },
        {
          id: "plugin.web",
          mode: "push",
          permissionScopes: ["root-results", "network"],
          defaultState: "ask",
          requiresUserConsent: true,
        },
      ],
      defaults: { pluginName: "plugin" },
      declaredPermissionIds: ["search.root-results"],
    });

    expect(result.descriptors).toEqual([]);
    expect(result.issues).toMatchObject([
      {
        code: "SEARCH_PROVIDER_POLICY_BLOCKED",
        providerId: "plugin.quicklinks",
        issues: ["third-party-push-requires-root-results"],
      },
      {
        code: "SEARCH_PROVIDER_PERMISSION_MISSING",
        providerId: "plugin.web",
        missingPermissionIds: ["network.internet"],
      },
    ]);
  });

  it("resolves legacy push features through sdk manifest resolution", () => {
    const result = resolveSearchProviderManifestDescriptors({
      features: [{ id: "quicklinks", name: "Quicklinks", push: true }],
      defaults: { pluginName: "touch-quicklinks", defaultOrder: 120 },
      declaredPermissionIds: ["search.root-results"],
    });

    expect(result.derivedFromPushFeatures).toBe(true);
    expect(result.descriptors.map((descriptor) => descriptor.id)).toEqual([
      "touch-quicklinks.root-results",
    ]);
    expect(result.issues).toMatchObject([
      {
        code: "SEARCH_PROVIDER_DERIVED_FROM_PUSH_FEATURE",
        featureIds: ["quicklinks"],
      },
    ]);
  });

  it("reports invalid manifest provider shapes without throwing", () => {
    const result = resolveSearchProviderManifestDescriptors({
      manifestProviders: [{ id: "", mode: "push", permissionScopes: [] }],
      defaults: { pluginName: "plugin" },
      declaredPermissionIds: [],
    });

    expect(result.descriptors).toEqual([]);
    expect(result.issues).toMatchObject([
      {
        type: "warning",
        code: "SEARCH_PROVIDER_INVALID",
        index: 0,
      },
    ]);
  });

  it("keeps browser data providers official-plugin gated", () => {
    const indexedSource = buildDescriptor({
      id: "browser-bookmarks",
      kind: "browser-bookmark",
      privacy: "high",
      admission: {
        owner: "third-party-plugin",
        permissionScopes: ["browser-data", "file-system"],
        defaultState: "ask",
        requiresUserConsent: true,
        clearable: true,
        rebuildable: true,
      },
    });

    expect(
      resolveSearchProviderRegistrationDecision({
        id: "browser-bookmarks",
        displayName: "Browser Bookmarks",
        kind: "browser-bookmark",
        owner: "third-party-plugin",
        mode: "indexed",
        priority: "deferred",
        defaultOrder: 50,
        policy: {
          owner: "third-party-plugin",
          mode: "indexed",
          permissionScopes: ["browser-data", "file-system", "root-results"],
          defaultState: "ask",
          requiresUserConsent: true,
          indexedSource,
        },
      }),
    ).toEqual({
      status: "blocked",
      issues: ["browser-data-requires-official-plugin"],
    });
  });

  it("links official plugin providers to runtime indexed source ids", () => {
    const descriptor = createSearchProviderDescriptorFromManifest(
      {
        id: "touch-browser-data.browser-bookmarks",
        displayName: "Browser Bookmarks",
        kind: "browser-bookmark",
        owner: "official-plugin",
        mode: "push",
        priority: "fast",
        defaultOrder: 60,
        permissionScopes: ["root-results", "browser-data"],
        defaultState: "ask",
        requiresUserConsent: true,
        pushesToRootResults: true,
        indexedSourceId: "browser-bookmarks",
      },
      { pluginName: "touch-browser-data" },
    );

    expect(descriptor.policy.indexedSourceId).toBe("browser-bookmarks");
    expect(resolveSearchProviderRegistrationDecision(descriptor)).toEqual({
      status: "requires-consent",
      issues: [],
    });
  });

  it("blocks third-party providers that claim browser runtime source ids", () => {
    expect(
      resolveSearchProviderRegistrationDecision({
        id: "third-party.browser-bookmarks",
        displayName: "Browser Bookmarks",
        kind: "browser-bookmark",
        owner: "third-party-plugin",
        mode: "push",
        priority: "fast",
        defaultOrder: 60,
        policy: {
          owner: "third-party-plugin",
          mode: "push",
          permissionScopes: ["root-results", "browser-data"],
          defaultState: "ask",
          requiresUserConsent: true,
          pushesToRootResults: true,
          indexedSourceId: "browser-bookmarks",
        },
      }),
    ).toEqual({
      status: "blocked",
      issues: ["browser-data-requires-official-plugin"],
    });
  });

  it("enables indexed sources only from explicit linked provider config", () => {
    expect(
      isIndexedSourceEnabledByProviderConfig(
        "browser-bookmarks",
        ["touch-browser-data.browser-bookmarks"],
        [],
      ),
    ).toBe(false);

    expect(
      isIndexedSourceEnabledByProviderConfig(
        "browser-bookmarks",
        ["touch-browser-data.browser-bookmarks"],
        [
          { providerId: "browser-bookmarks", enabled: false, order: 1 },
          {
            providerId: "touch-browser-data.browser-bookmarks",
            enabled: false,
            order: 2,
          },
        ],
      ),
    ).toBe(false);

    expect(
      isIndexedSourceEnabledByProviderConfig(
        "browser-bookmarks",
        ["touch-browser-data.browser-bookmarks"],
        [
          {
            providerId: "touch-browser-data.browser-bookmarks",
            enabled: true,
            order: 1,
          },
        ],
      ),
    ).toBe(true);
  });

  it("allows low-privacy sources to keep default enablement while honoring explicit source disable", () => {
    expect(
      isIndexedSourceEnabledByProviderConfig(
        "quicklinks",
        ["touch-dev-toolbox.dev-toolbox"],
        [],
        { defaultEnabled: true },
      ),
    ).toBe(true);

    expect(
      isIndexedSourceEnabledByProviderConfig(
        "quicklinks",
        ["touch-dev-toolbox.dev-toolbox"],
        [
          { providerId: "quicklinks", enabled: false, order: 1 },
          { providerId: "touch-dev-toolbox.dev-toolbox", enabled: false, order: 2 },
        ],
        { defaultEnabled: true },
      ),
    ).toBe(false);

    expect(
      isIndexedSourceEnabledByProviderConfig(
        "quicklinks",
        ["touch-dev-toolbox.dev-toolbox"],
        [{ providerId: "touch-dev-toolbox.dev-toolbox", enabled: true, order: 2 }],
        { defaultEnabled: true },
      ),
    ).toBe(true);
  });

  it("resolves indexed source enablement details from linked provider config", () => {
    expect(
      resolveIndexedSourceProviderConfigEnablement(
        "browser-bookmarks",
        ["touch-browser-data.browser-bookmarks"],
        [
          {
            providerId: "touch-browser-data.browser-bookmarks",
            enabled: true,
            order: 1,
          },
        ],
      ),
    ).toEqual({
      sourceId: "browser-bookmarks",
      providerIds: ["browser-bookmarks", "touch-browser-data.browser-bookmarks"],
      configuredProviderIds: ["touch-browser-data.browser-bookmarks"],
      enabledProviderIds: ["touch-browser-data.browser-bookmarks"],
      disabledProviderIds: [],
      enabled: true,
      reason: "explicitly-enabled",
    });

    expect(
      resolveIndexedSourceProviderConfigEnablement(
        "browser-bookmarks",
        ["touch-browser-data.browser-bookmarks"],
        [
          {
            providerId: "touch-browser-data.browser-bookmarks",
            enabled: false,
            order: 1,
          },
        ],
      ),
    ).toMatchObject({
      configuredProviderIds: ["touch-browser-data.browser-bookmarks"],
      enabledProviderIds: [],
      disabledProviderIds: ["touch-browser-data.browser-bookmarks"],
      enabled: false,
      reason: "explicitly-disabled",
    });
  });

  it("reports default indexed source enablement without masking explicit source disable", () => {
    expect(
      resolveIndexedSourceProviderConfigEnablement("quicklinks", [], [], {
        defaultEnabled: true,
      }),
    ).toMatchObject({
      enabled: true,
      reason: "default-enabled",
    });

    expect(
      resolveIndexedSourceProviderConfigEnablement(
        "quicklinks",
        ["touch-dev-toolbox.dev-toolbox"],
        [
          { providerId: "quicklinks", enabled: false, order: 1 },
          { providerId: "touch-dev-toolbox.dev-toolbox", enabled: false, order: 2 },
        ],
        { defaultEnabled: true },
      ),
    ).toMatchObject({
      configuredProviderIds: ["quicklinks", "touch-dev-toolbox.dev-toolbox"],
      disabledProviderIds: ["quicklinks", "touch-dev-toolbox.dev-toolbox"],
      enabled: false,
      reason: "explicitly-disabled",
    });
  });

  it("resolves provider ids linked to an indexed source", () => {
    const descriptors = [
      createSearchProviderDescriptorFromManifest(
        {
          id: "touch-browser-data.browser-bookmarks",
          mode: "push",
          owner: "official-plugin",
          permissionScopes: ["root-results", "browser-data"],
          defaultState: "ask",
          indexedSourceId: "browser-bookmarks",
        },
        { pluginName: "touch-browser-data" },
      ),
      createSearchProviderDescriptorFromManifest(
        {
          id: "touch-translation.results",
          mode: "push",
          permissionScopes: ["root-results"],
          defaultState: "ask",
        },
        { pluginName: "touch-translation" },
      ),
    ];

    expect(
      getSearchProviderIdsForIndexedSource("browser-bookmarks", descriptors),
    ).toEqual(["browser-bookmarks", "touch-browser-data.browser-bookmarks"]);
    expect(getSearchProviderIdsForIndexedSource("", descriptors)).toEqual([]);
  });
});

describe("indexed source manifest sdk contracts", () => {
  it("maps indexed source scopes to manifest permissions", () => {
    expect(
      resolveIndexedSourcePermissionIds([
        "browser-data",
        "file-system",
        "browser-data",
        "network",
      ]),
    ).toEqual(["fs.read", "fs.index", "network.internet"]);
  });

  it("resolves official browser-data indexed source manifest declarations", () => {
    const result = resolveIndexedSourceManifestDescriptors({
      manifestSources: [
        {
          id: "browser-bookmarks",
          template: "browser-bookmarks",
          displayName: "Browser Bookmarks",
          admission: {
            owner: "official-plugin",
          },
        },
      ],
      defaults: {
        pluginName: "touch-browser-data",
        owner: "official-plugin",
      },
      declaredPermissionIds: ["fs.read", "fs.index"],
    });

    expect(result.issues).toEqual([]);
    expect(result.descriptors).toHaveLength(1);
    expect(result.descriptors[0]).toMatchObject({
      id: "browser-bookmarks",
      kind: "browser-bookmark",
      privacy: "high",
      admission: {
        owner: "official-plugin",
        permissionScopes: ["browser-data", "file-system"],
        defaultState: "disabled",
        requiresUserConsent: true,
      },
    });
  });

  it("blocks unsafe indexed source manifest declarations before runtime registration", () => {
    const result = resolveIndexedSourceManifestDescriptors({
      manifestSources: [
        {
          id: "browser-bookmarks",
          template: "browser-bookmarks",
          admission: {
            owner: "third-party-plugin",
          },
        },
      ],
      defaults: {
        pluginName: "third-party-browser-data",
      },
      declaredPermissionIds: ["fs.read"],
    });

    expect(result.descriptors).toEqual([]);
    expect(result.issues).toMatchObject([
      {
        type: "error",
        code: "INDEXED_SOURCE_ADMISSION_BLOCKED",
        sourceId: "browser-bookmarks",
        admissionIssues: ["browser-data-requires-official-plugin"],
      },
      {
        type: "error",
        code: "INDEXED_SOURCE_PERMISSION_MISSING",
        sourceId: "browser-bookmarks",
        missingPermissionIds: ["fs.index"],
      },
    ]);
  });

  it("reports invalid indexed source manifest shapes without throwing", () => {
    const result = resolveIndexedSourceManifestDescriptors({
      manifestSources: [{ id: "" }],
      defaults: { pluginName: "plugin" },
    });

    expect(result.descriptors).toEqual([]);
    expect(result.issues).toMatchObject([
      {
        type: "warning",
        code: "INDEXED_SOURCE_INVALID",
        index: 0,
      },
    ]);
  });
});
