import type { IndexedSourceDescriptor } from "../../search";
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
  createSearchProviderDescriptorFromManifest,
  getSearchProviderManifestCoverage,
  getSearchProviderIdsForIndexedSource,
  IndexedSourceReconcileReasons,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  isIndexedSourceAdmissionReady,
  createSystemSettingsIndexedSourceDescriptor,
  normalizeSearchProviderUserConfigs,
  isIndexedSourceEnabledByProviderConfig,
  resolveIndexedSourceRootSkipReason,
  resolveSearchProviderManifestDescriptors,
  resolveSearchProviderPermissionIds,
  resolveSearchProviderRegistrationDecision,
  resolveIndexedSourceTaskEligibility,
  resolveIndexedSourceWatchRootRoute,
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
      jobId: `scan:${DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT - 1}`,
    });
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
