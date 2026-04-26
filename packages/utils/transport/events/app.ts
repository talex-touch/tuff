import { defineEvent, defineRawEvent } from "../event/builder";

import type {
  ActiveAppSnapshot,
  AnalyticsExportPayload,
  AnalyticsExportResult,
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageUpdateRequest,
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsSnapshotRequest,
  AnalyticsToggleRequest,
  AutoStartGetResponse,
  AutoStartUpdateRequest,
  AutoStartUpdateResponse,
  BatteryStatusPayload,
  BuildVerificationStatus,
  CounterPayload,
  CurrentMetrics,
  DevToolsOptions,
  ExecuteCommandRequest,
  ExecuteCommandResponse,
  FeatureStats,
  GaugePayload,
  GetActiveAppRequest,
  GetPathRequest,
  HistogramPayload,
  NavigateRequest,
  OpenAppRequest,
  OpenExternalRequest,
  OSInfo,
  PackageInfo,
  PerformanceHistoryEntry,
  PerformanceSummary,
  PluginStats,
  ReadFileRequest,
  RendererPerfReport,
  ReportMetricsRequest,
  ReportMetricsResponse,
  SecureValueGetRequest,
  SecureValueSetRequest,
  SetLocaleRequest,
  ShowInFolderRequest,
  StartupRequest,
  StartupResponse,
  TrackDurationPayload,
  TrackEventPayload,
  TraySettingsGetResponse,
  TraySettingsUpdateRequest,
  TraySettingsUpdateResponse,
} from "./types/app";

import type {
  AppIndexAddPathRequest,
  AppIndexAddPathResult,
  AppIndexDiagnoseRequest,
  AppIndexDiagnoseResult,
  AppIndexEntryMutationResult,
  AppIndexManagedEntry,
  AppIndexReindexRequest,
  AppIndexReindexResult,
  AppIndexRemoveEntryRequest,
  AppIndexSetEntryEnabledRequest,
  AppIndexSettings,
  AppIndexUpsertEntryRequest,
} from "./types/app-index";

import type {
  DeviceIdleDiagnostic,
  DeviceIdleSettings,
} from "./types/device-idle";

import type {
  FileIndexAddPathRequest,
  FileIndexAddPathResult,
  FileIndexBatteryStatus,
  FileIndexFailedFile,
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult,
  FileIndexStats,
  FileIndexStatus,
} from "./types/file-index";

/**
 * Application-level events for window management, system info, and analytics.
 */
export const AppEvents = {
  /**
   * Window management events.
   */
  window: {
    /**
     * Close the application window.
     */
    close: defineEvent("app")
      .module("window")
      .event("close")
      .define<void, void>(),

    /**
     * Minimize the application window.
     */
    minimize: defineEvent("app")
      .module("window")
      .event("minimize")
      .define<void, void>(),

    /**
     * Hide the application window.
     */
    hide: defineEvent("app")
      .module("window")
      .event("hide")
      .define<void, void>(),

    /**
     * Focus the application window.
     */
    focus: defineEvent("app")
      .module("window")
      .event("focus")
      .define<void, void>(),

    /**
     * Request renderer to navigate.
     */
    navigate: defineEvent("app")
      .module("window")
      .event("navigate")
      .define<NavigateRequest, void>(),

    /**
     * Request renderer to open download center.
     */
    openDownloadCenter: defineEvent("app")
      .module("window")
      .event("open-download-center")
      .define<void, void>(),
  },

  /**
   * App lifecycle events.
   */
  lifecycle: {
    /**
     * Fired before the app begins shutdown.
     */
    beforeQuit: defineEvent("app")
      .module("lifecycle")
      .event("before-quit")
      .define<void, void>(),
  },

  /**
   * I18n / locale events.
   */
  i18n: {
    /**
     * Set main-process locale.
     */
    setLocale: defineEvent("app")
      .module("i18n")
      .event("set-locale")
      .define<SetLocaleRequest, void>(),
  },

  /**
   * System information events.
   */
  system: {
    /**
     * Get operating system information.
     */
    getOS: defineEvent("app")
      .module("system")
      .event("get-os")
      .define<void, OSInfo>(),

    /**
     * Get application package information.
     */
    getPackage: defineEvent("app")
      .module("system")
      .event("get-package")
      .define<void, PackageInfo>(),

    autoStartGet: defineEvent("app")
      .module("system")
      .event("autostart.get")
      .define<void, AutoStartGetResponse>(),

    autoStartUpdate: defineEvent("app")
      .module("system")
      .event("autostart.update")
      .define<AutoStartUpdateRequest, AutoStartUpdateResponse>(),

    traySettingsGet: defineEvent("app")
      .module("system")
      .event("tray-settings.get")
      .define<void, TraySettingsGetResponse>(),

    traySettingsUpdate: defineEvent("app")
      .module("system")
      .event("tray-settings.update")
      .define<TraySettingsUpdateRequest, TraySettingsUpdateResponse>(),

    /**
     * Open an external URL in the default browser.
     */
    openExternal: defineEvent("app")
      .module("system")
      .event("open-external")
      .define<OpenExternalRequest, void>(),

    /**
     * Show a file/folder in the system file manager.
     */
    showInFolder: defineEvent("app")
      .module("system")
      .event("show-in-folder")
      .define<ShowInFolderRequest, void>(),

    /**
     * Open an application.
     */
    openApp: defineEvent("app")
      .module("system")
      .event("open-app")
      .define<OpenAppRequest, void>(),

    /**
     * Open intelligence prompts folder.
     */
    openPromptsFolder: defineEvent("app")
      .module("system")
      .event("open-prompts-folder")
      .define<void, void>(),

    /**
     * Execute a command/open a path.
     */
    executeCommand: defineEvent("app")
      .module("system")
      .event("execute-command")
      .define<ExecuteCommandRequest, ExecuteCommandResponse>(),

    /**
     * Get current working directory.
     */
    getCwd: defineEvent("app")
      .module("system")
      .event("get-cwd")
      .define<void, string>(),

    /**
     * Resolve an Electron app path.
     */
    getPath: defineEvent("app")
      .module("system")
      .event("get-path")
      .define<GetPathRequest, string | null>(),

    /**
     * Get currently active foreground application snapshot.
     */
    getActiveApp: defineEvent("app")
      .module("system")
      .event("get-active-app")
      .define<GetActiveAppRequest, ActiveAppSnapshot | null>(),

    /**
     * Read a secure local value.
     */
    getSecureValue: defineEvent("app")
      .module("system")
      .event("get-secure-value")
      .define<SecureValueGetRequest, string | null>(),

    /**
     * Write a secure local value.
     */
    setSecureValue: defineEvent("app")
      .module("system")
      .event("set-secure-value")
      .define<SecureValueSetRequest, void>(),

    /**
     * Read a local file as text.
     */
    readFile: defineEvent("app")
      .module("system")
      .event("read-file")
      .define<ReadFileRequest, string>(),

    /**
     * Get startup handshake info.
     */
    startup: defineEvent("app")
      .module("system")
      .event("startup")
      .define<StartupRequest, StartupResponse>(),
  },

  /**
   * Power / battery events.
   */
  power: {
    /**
     * Battery status broadcast.
     */
    batteryStatus: defineRawEvent<BatteryStatusPayload, void>(
      "power:battery-status",
    ),
  },

  /**
   * File index events.
   */
  fileIndex: {
    /**
     * Get current indexing status.
     */
    status: defineEvent("app")
      .module("file-index")
      .event("status")
      .define<void, FileIndexStatus>(),

    /**
     * Get indexing statistics.
     */
    stats: defineEvent("app")
      .module("file-index")
      .event("stats")
      .define<void, FileIndexStats>(),

    /**
     * Trigger a full index rebuild.
     */
    rebuild: defineEvent("app")
      .module("file-index")
      .event("rebuild")
      .define<FileIndexRebuildRequest | void, FileIndexRebuildResult>(),

    /**
     * Get current battery status (for indexing throttling UI).
     */
    batteryLevel: defineEvent("app")
      .module("file-index")
      .event("battery-level")
      .define<void, FileIndexBatteryStatus | null>(),

    /**
     * Stream indexing progress updates.
     */
    progress: defineEvent("app")
      .module("file-index")
      .event("progress")
      .define<void, AsyncIterable<FileIndexProgress>>({
        stream: { enabled: true },
      }),

    /**
     * Get list of failed files with error details.
     */
    failedFiles: defineEvent("app")
      .module("file-index")
      .event("failed-files")
      .define<void, FileIndexFailedFile[]>(),

    /**
     * Add a path to file index watch list.
     */
    addPath: defineEvent("app")
      .module("file-index")
      .event("add-path")
      .define<FileIndexAddPathRequest, FileIndexAddPathResult>(),
  },

  /**
   * Device idle policy events.
   */
  deviceIdle: {
    /**
     * Get device idle settings.
     */
    getSettings: defineEvent("app")
      .module("device-idle")
      .event("settings.get")
      .define<void, DeviceIdleSettings>(),

    /**
     * Update device idle settings.
     */
    updateSettings: defineEvent("app")
      .module("device-idle")
      .event("settings.update")
      .define<Partial<DeviceIdleSettings>, DeviceIdleSettings>(),

    /**
     * Get current device idle policy diagnostic.
     */
    getDiagnostic: defineEvent("app")
      .module("device-idle")
      .event("diagnostic.get")
      .define<void, DeviceIdleDiagnostic>(),
  },

  /**
   * App index scheduling events.
   */
  appIndex: {
    /**
     * Get app index settings.
     */
    getSettings: defineEvent("app")
      .module("app-index")
      .event("settings.get")
      .define<void, AppIndexSettings>(),

    /**
     * Update app index settings.
     */
    updateSettings: defineEvent("app")
      .module("app-index")
      .event("settings.update")
      .define<Partial<AppIndexSettings>, AppIndexSettings>(),

    /**
     * Add an application path to the index list.
     */
    addPath: defineEvent("app")
      .module("app-index")
      .event("add-path")
      .define<AppIndexAddPathRequest, AppIndexAddPathResult>(),

    /**
     * List user-managed launcher entries.
     */
    listEntries: defineEvent("app")
      .module("app-index")
      .event("entries.list")
      .define<void, AppIndexManagedEntry[]>(),

    /**
     * Create or update a user-managed launcher entry.
     */
    upsertEntry: defineEvent("app")
      .module("app-index")
      .event("entry.upsert")
      .define<AppIndexUpsertEntryRequest, AppIndexEntryMutationResult>(),

    /**
     * Remove a user-managed launcher entry.
     */
    removeEntry: defineEvent("app")
      .module("app-index")
      .event("entry.remove")
      .define<AppIndexRemoveEntryRequest, AppIndexEntryMutationResult>(),

    /**
     * Enable or disable a user-managed launcher entry.
     */
    setEntryEnabled: defineEvent("app")
      .module("app-index")
      .event("entry.set-enabled")
      .define<AppIndexSetEntryEnabledRequest, AppIndexEntryMutationResult>(),

    /**
     * Diagnose why a single application target does or does not match app search.
     */
    diagnose: defineEvent("app")
      .module("app-index")
      .event("diagnose")
      .define<AppIndexDiagnoseRequest, AppIndexDiagnoseResult>(),

    /**
     * Reindex or rescan one application target for search diagnostics.
     */
    reindex: defineEvent("app")
      .module("app-index")
      .event("reindex")
      .define<AppIndexReindexRequest, AppIndexReindexResult>(),
  },

  /**
   * Debug and developer tools events.
   */
  debug: {
    /**
     * Open developer tools.
     */
    openDevTools: defineEvent("app")
      .module("debug")
      .event("open-devtools")
      .define<DevToolsOptions | void, void>(),
  },

  /**
   * Build verification events.
   */
  build: {
    /**
     * Get build verification status.
     */
    getVerificationStatus: defineEvent("app")
      .module("build")
      .event("get-verification-status")
      .define<void, BuildVerificationStatus>(),

    /**
     * Legacy build verification status request.
     */
    getVerificationStatusLegacy: defineRawEvent<void, BuildVerificationStatus>(
      "build:get-verification-status",
    ),

    /**
     * Build verification status broadcast.
     */
    statusUpdated: defineRawEvent<BuildVerificationStatus, void>(
      "build:verification-status",
    ),
  },

  /**
   * Analytics and metrics events.
   */
  analytics: {
    /**
     * Get aggregated metrics snapshot for a specific window.
     */
    getSnapshot: defineEvent("app")
      .module("analytics")
      .event("get-snapshot")
      .define<AnalyticsSnapshotRequest, AnalyticsSnapshot>(),

    /**
     * Get metrics snapshots within a time range.
     */
    getRange: defineEvent("app")
      .module("analytics")
      .event("get-range")
      .define<AnalyticsRangeRequest, AnalyticsSnapshot[]>(),

    /**
     * Export metrics for a window/range.
     */
    export: defineEvent("app")
      .module("analytics")
      .event("export")
      .define<AnalyticsExportPayload, AnalyticsExportResult>(),

    /**
     * Toggle analytics reporting.
     */
    toggleReporting: defineEvent("app")
      .module("analytics")
      .event("toggle-reporting")
      .define<AnalyticsToggleRequest, { enabled: boolean }>(),

    /**
     * Analytics message center events.
     */
    messages: {
      list: defineEvent("app")
        .module("analytics")
        .event("messages.list")
        .define<AnalyticsMessageListRequest, AnalyticsMessage[]>(),

      mark: defineEvent("app")
        .module("analytics")
        .event("messages.mark")
        .define<AnalyticsMessageUpdateRequest, AnalyticsMessage | null>(),
    },

    /**
     * SDK-level plugin analytics events.
     */
    sdk: {
      trackEvent: defineEvent("app")
        .module("analytics")
        .event("sdk.track-event")
        .define<TrackEventPayload, { ok: true }>(),

      trackDuration: defineEvent("app")
        .module("analytics")
        .event("sdk.track-duration")
        .define<TrackDurationPayload, { ok: true }>(),

      getStats: defineEvent("app")
        .module("analytics")
        .event("sdk.get-stats")
        .define<{ pluginName?: string; pluginVersion?: string }, PluginStats>(),

      getFeatureStats: defineEvent("app")
        .module("analytics")
        .event("sdk.get-feature-stats")
        .define<
          { pluginName?: string; pluginVersion?: string; featureId: string },
          FeatureStats
        >(),

      getTopFeatures: defineEvent("app")
        .module("analytics")
        .event("sdk.get-top-features")
        .define<
          { pluginName?: string; pluginVersion?: string; limit?: number },
          Array<{ id: string; count: number }>
        >(),

      incrementCounter: defineEvent("app")
        .module("analytics")
        .event("sdk.increment-counter")
        .define<CounterPayload, { ok: true }>(),

      setGauge: defineEvent("app")
        .module("analytics")
        .event("sdk.set-gauge")
        .define<GaugePayload, { ok: true }>(),

      recordHistogram: defineEvent("app")
        .module("analytics")
        .event("sdk.record-histogram")
        .define<HistogramPayload, { ok: true }>(),
    },

    /**
     * Get current performance metrics.
     * @deprecated Use analytics.getSnapshot instead.
     */
    getCurrent: defineEvent("app")
      .module("analytics")
      .event("get-current")
      .define<void, CurrentMetrics>(),

    /**
     * Get performance history.
     */
    getHistory: defineEvent("app")
      .module("analytics")
      .event("get-history")
      .define<void, PerformanceHistoryEntry[]>(),

    /**
     * Get performance summary.
     */
    getSummary: defineEvent("app")
      .module("analytics")
      .event("get-summary")
      .define<void, PerformanceSummary>(),

    /**
     * Report metrics to an endpoint (legacy).
     * @deprecated Use analytics.export instead.
     */
    report: defineEvent("app")
      .module("analytics")
      .event("report")
      .define<ReportMetricsRequest, ReportMetricsResponse>(),

    /**
     * Report renderer performance incidents.
     */
    perfReport: defineEvent("app")
      .module("analytics")
      .event("perf-report")
      .define<RendererPerfReport, void>(),
  },
} as const;
