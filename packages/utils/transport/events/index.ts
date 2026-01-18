/**
 * @fileoverview Predefined TuffEvents for all application domains
 * @module @talex-touch/utils/transport/events
 *
 * @description
 * This module exports all predefined TuffEvents organized by domain.
 * Each event is type-safe with request/response types enforced at compile time.
 *
 * @example
 * ```typescript
 * import { CoreBoxEvents, StorageEvents } from '@talex-touch/utils/transport/events'
 *
 * // Send a typed request
 * await transport.send(CoreBoxEvents.search.query, { text: 'hello' })
 *
 * // Register a typed handler
 * transport.on(StorageEvents.app.get, async ({ key }) => {
 *   return storage.get(key)
 * })
 * ```
 */

import type {
  AgentsCancelRequest,
  AgentsCancelResponse,
  AgentsExecuteImmediateRequest,
  AgentsExecuteImmediateResponse,
  AgentsExecuteRequest,
  AgentsExecuteResponse,
  AgentsGetRequest,
  AgentsGetResponse,
  AgentsListResponse,
  AgentsStatsResponse,
  AgentsTaskStatusRequest,
  AgentsTaskStatusResponse,
  AgentsToolsGetRequest,
  AgentsToolsGetResponse,
  AgentsToolsListResponse,
} from './types/agents'

import type {
  AnalyticsExportPayload,
  AnalyticsExportResult,
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageUpdateRequest,
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsSnapshotRequest,
  AnalyticsToggleRequest,
  BuildVerificationStatus,
  CounterPayload,
  CurrentMetrics,
  DevToolsOptions,
  ExecuteCommandRequest,
  ExecuteCommandResponse,
  FeatureStats,
  GaugePayload,
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
  SetLocaleRequest,
  ShowInFolderRequest,
  StartupRequest,
  StartupResponse,
  TrackDurationPayload,
  TrackEventPayload,
} from './types/app'

import type {
  BoxItem,
  BoxItemBatchDeleteResponse,
  BoxItemBatchUpsertResponse,
  BoxItemClearRequest,
  BoxItemClearResponse,
  BoxItemCreateRequest,
  BoxItemDeleteRequest,
  BoxItemSyncResponse,
  BoxItemUpdateRequest,
  BoxItemUpsertRequest,
} from './types/box-item'

// ============================================================================
// App Events
// ============================================================================

import type {
  ClipboardApplyRequest,
  ClipboardChangePayload,
  ClipboardDeleteRequest,
  ClipboardItem,
  ClipboardQueryRequest,
  ClipboardQueryResponse,
  ClipboardSetFavoriteRequest,
  ClipboardWriteRequest,
} from './types/clipboard'

// ============================================================================
// CoreBox Events
// ============================================================================

import type {
  ActivationState,
  AllowClipboardRequest,
  AllowClipboardResponse,
  AllowInputMonitoringResponse,
  CancelSearchRequest,
  CancelSearchResponse,
  ClearInputResponse,
  CoreBoxClearItemsPayload,
  CoreBoxExecuteRequest,
  CoreBoxForwardKeyEvent,
  CoreBoxInputChangeRequest,
  CoreBoxLayoutUpdateRequest,
  CoreBoxNoResultsPayload,
  CoreBoxSearchEndPayload,
  CoreBoxSearchUpdatePayload,
  CoreBoxTogglePinRequest,
  CoreBoxTogglePinResponse,
  CoreBoxUIModeExitedPayload,
  CoreBoxUIViewStateResponse,
  DeactivateProviderRequest,
  EnterUIModeRequest,
  ExpandOptions,
  FocusWindowResponse,
  GetInputResponse,
  GetProviderDetailsRequest,
  IProviderActivate,
  ProviderDetail,
  SetInputRequest,
  SetInputResponse,
  SetInputVisibilityRequest,
  TuffQuery,
  TuffSearchResult,
} from './types/core-box'

// ============================================================================
// Storage Events
// ============================================================================

import type {
  DivisionBoxCloseRequest,
  DivisionBoxCloseResponse,
  DivisionBoxFlowTriggerRequest,
  DivisionBoxFlowTriggerResponse,
  DivisionBoxGetActiveSessionsRequest,
  DivisionBoxGetActiveSessionsResponse,
  DivisionBoxGetStateRequest,
  DivisionBoxGetStateResponse,
  DivisionBoxGetWindowStateRequest,
  DivisionBoxGetWindowStateResponse,
  DivisionBoxInputChangeRequest,
  DivisionBoxInputChangeResponse,
  DivisionBoxOpenRequest,
  DivisionBoxOpenResponse,
  DivisionBoxSessionDestroyedPayload,
  DivisionBoxSetOpacityRequest,
  DivisionBoxSetOpacityResponse,
  DivisionBoxStateChangedPayload,
  DivisionBoxToggleDevToolsRequest,
  DivisionBoxToggleDevToolsResponse,
  DivisionBoxTogglePinRequest,
  DivisionBoxTogglePinResponse,
  DivisionBoxUpdateStateRequest,
  DivisionBoxUpdateStateResponse,
} from './types/division-box'

// ============================================================================
// Plugin Events
// ============================================================================

import type {
  DownloadAddTaskRequest,
  DownloadAddTaskResponse,
  DownloadClearHistoryItemRequest,
  DownloadGetConfigResponse,
  DownloadGetErrorStatsResponse,
  DownloadGetHistoryRequest,
  DownloadGetHistoryResponse,
  DownloadGetLogsResponse,
  DownloadGetNotificationConfigResponse,
  DownloadGetStatsResponse,
  DownloadGetTasksByStatusRequest,
  DownloadGetTasksResponse,
  DownloadGetTaskStatusResponse,
  DownloadGetTempStatsResponse,
  DownloadMigrationNeededResponse,
  DownloadMigrationRetryResponse,
  DownloadMigrationStartResponse,
  DownloadMigrationStatusResponse,
  DownloadNotificationClickedPayload,
  DownloadOpResponse,
  DownloadTaskIdRequest,
  DownloadTaskPayload,
  DownloadTaskRetryingPayload,
  DownloadUpdateConfigRequest,
  DownloadUpdateNotificationConfigRequest,
  DownloadUpdatePriorityRequest,
} from './types/download'

// ============================================================================
// BoxItem Events
// ============================================================================

import type {
  FileIndexBatteryStatus,
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult,
  FileIndexStats,
  FileIndexStatus,
} from './types/file-index'

// ============================================================================
// Market Events
// ============================================================================

import type {
  FlowAcknowledgeRequest,
  FlowAcknowledgeResponse,
  FlowCancelResponse,
  FlowConsentCheckRequest,
  FlowConsentCheckResponse,
  FlowConsentGrantRequest,
  FlowConsentGrantResponse,
  FlowDeliverPayload,
  FlowDispatchRequest,
  FlowDispatchResponse,
  FlowGetTargetsRequest,
  FlowGetTargetsResponse,
  FlowNativeShareRequest,
  FlowNativeShareResponse,
  FlowRegisterTargetsRequest,
  FlowReportErrorRequest,
  FlowReportErrorResponse,
  FlowSelectTargetRequest,
  FlowSelectTargetResponse,
  FlowSessionUpdatePayload,
  FlowSetPluginEnabledRequest,
  FlowSetPluginHandlerRequest,
  FlowUnregisterTargetsRequest,
} from './types/flow'

// ============================================================================
// Permission Events
// ============================================================================

import type {
  MarketCheckUpdatesResponse,
  MarketGetPluginRequest,
  MarketGetPluginResponse,
  MarketHttpRequest,
  MarketHttpRequestResponse,
  MarketSearchRequest,
  MarketSearchResponse,
  MarketUpdatesAvailablePayload,
} from './types/market'

// ============================================================================
// Agents Events
// ============================================================================

import type {
  PermissionCheckRequest,
  PermissionCheckResponse,
  PermissionGetAllResponse,
  PermissionGetAuditLogsRequest,
  PermissionGetAuditLogsResponse,
  PermissionGetPerformanceResponse,
  PermissionGetPluginRequest,
  PermissionGetPluginResponse,
  PermissionGetRegistryResponse,
  PermissionGetStatusRequest,
  PermissionGetStatusResponse,
  PermissionGrantMultipleRequest,
  PermissionGrantRequest,
  PermissionOperationResult,
  PermissionRevokeAllRequest,
  PermissionRevokeRequest,
  PermissionStartupRequestPayload,
  PermissionUpdatedPayload,
} from './types/permission'

// ============================================================================
// Platform Events
// ============================================================================

import type {
  PlatformCapabilityListRequest,
  PlatformCapabilityListResponse,
} from './types/platform'

// ============================================================================
// Tray Events
// ============================================================================

import type {
  FeatureTriggerRequest,
  FeatureTriggerResponse,
  PluginApiFeatureInputChangedRequest,
  PluginApiGetManifestRequest,
  PluginApiGetManifestResponse,
  PluginApiGetOfficialListRequest,
  PluginApiGetOfficialListResponse,
  PluginApiGetPathsRequest,
  PluginApiGetPathsResponse,
  PluginApiGetPerformanceRequest,
  PluginApiGetPerformanceResponse,
  PluginApiGetRequest,
  PluginApiGetResponse,
  PluginApiGetRuntimeStatsRequest,
  PluginApiGetRuntimeStatsResponse,
  PluginApiGetStatusRequest,
  PluginApiGetStatusResponse,
  PluginApiInstallRequest,
  PluginApiInstallResponse,
  PluginApiListRequest,
  PluginApiListResponse,
  PluginApiOpenFolderRequest,
  PluginApiOpenPathRequest,
  PluginApiOpenPathResponse,
  PluginApiOperationRequest,
  PluginApiOperationResponse,
  PluginApiSaveManifestRequest,
  PluginApiSaveManifestResponse,
  PluginApiTriggerFeatureRequest,
  PluginApiTriggerFeatureResponse,
  PluginDevServerStatusRequest,
  PluginDevServerStatusResponse,
  PluginDisableRequest,
  PluginEnableRequest,
  PluginInfo,
  PluginInstallConfirmPayload,
  PluginInstallConfirmResponsePayload,
  PluginInstallProgressPayload,
  PluginInstallSourceRequest,
  PluginInstallSourceResponse,
  PluginLoadRequest,
  PluginLogEntry,
  PluginPerformanceGetMetricsResponse,
  PluginPerformanceGetPathsResponse,
  PluginPushCrashedPayload,
  PluginPushReloadPayload,
  PluginPushReloadReadmePayload,
  PluginPushStateChangedPayload,
  PluginPushStatusUpdatedPayload,
  PluginReconnectDevServerRequest,
  PluginReconnectDevServerResponse,
  PluginReloadRequest,
  PluginStorageClearRequest,
  PluginStorageFileDetailsRequest,
  PluginStorageFileRequest,
  PluginStorageListFilesRequest,
  PluginStorageOpenFolderRequest,
  PluginStorageOpenInEditorRequest,
  PluginStorageSetFileRequest,
  PluginStorageStatsRequest,
  PluginStorageTreeRequest,
  PluginStorageUpdatePayload,
  PluginUnloadRequest,
} from './types/plugin'

// ============================================================================
// Sentry Events
// ============================================================================

import type {
  SentryGetConfigResponse,
  SentryGetSearchCountResponse,
  SentryGetTelemetryStatsResponse,
  SentryRecordPerformanceRequest,
  SentryRecordPerformanceResponse,
  SentryUpdateUserRequest,
} from './types/sentry'

import type {
  PluginStorageDeleteRequest,
  PluginStorageGetRequest,
  PluginStorageSetRequest,
  StorageDeleteRequest,
  StorageGetRequest,
  StorageGetVersionedResponse,
  StorageSaveRequest,
  StorageSaveResult,
  StorageSetRequest,
  StorageUpdateNotification,
} from './types/storage'

import type {
  TrayAutostartGetResponse,
  TrayAutostartUpdateRequest,
  TrayAutostartUpdateResponse,
  TrayHideDockSetResponse,
  TrayShowGetResponse,
  TrayShowSetRequest,
  TrayShowSetResponse,
} from './types/tray'

// ============================================================================
// Clipboard Events
// ============================================================================

import type {
  UpdateAutoCheckRequest,
  UpdateAutoDownloadRequest,
  UpdateAvailablePayload,
  UpdateCachedReleaseRequest,
  UpdateCheckRequest,
  UpdateCheckResponse,
  UpdateDownloadRequest,
  UpdateDownloadResponse,
  UpdateGetCachedReleaseResponse,
  UpdateGetSettingsResponse,
  UpdateGetStatusResponse,
  UpdateIgnoreVersionRequest,
  UpdateInstallRequest,
  UpdateOpResponse,
  UpdateRecordActionRequest,
  UpdateUpdateSettingsRequest,
} from './types/update'

// ============================================================================
// MetaOverlay Events
// ============================================================================

import { defineEvent, defineRawEvent } from '../event/builder'

// ============================================================================
// File Index Events
// ============================================================================

import { MetaOverlayEvents } from './meta-overlay'

// Re-export all types for convenience
export * from './types'

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
    close: defineEvent('app')
      .module('window')
      .event('close')
      .define<void, void>(),

    /**
     * Minimize the application window.
     */
    minimize: defineEvent('app')
      .module('window')
      .event('minimize')
      .define<void, void>(),

    /**
     * Hide the application window.
     */
    hide: defineEvent('app')
      .module('window')
      .event('hide')
      .define<void, void>(),

    /**
     * Focus the application window.
     */
    focus: defineEvent('app')
      .module('window')
      .event('focus')
      .define<void, void>(),

    /**
     * Request renderer to navigate.
     */
    navigate: defineEvent('app')
      .module('window')
      .event('navigate')
      .define<NavigateRequest, void>(),

    /**
     * Request renderer to open download center.
     */
    openDownloadCenter: defineEvent('app')
      .module('window')
      .event('open-download-center')
      .define<void, void>(),
  },

  /**
   * I18n / locale events.
   */
  i18n: {
    /**
     * Set main-process locale.
     */
    setLocale: defineEvent('app')
      .module('i18n')
      .event('set-locale')
      .define<SetLocaleRequest, void>(),
  },

  /**
   * System information events.
   */
  system: {
    /**
     * Get operating system information.
     */
    getOS: defineEvent('app')
      .module('system')
      .event('get-os')
      .define<void, OSInfo>(),

    /**
     * Get application package information.
     */
    getPackage: defineEvent('app')
      .module('system')
      .event('get-package')
      .define<void, PackageInfo>(),

    /**
     * Open an external URL in the default browser.
     */
    openExternal: defineEvent('app')
      .module('system')
      .event('open-external')
      .define<OpenExternalRequest, void>(),

    /**
     * Show a file/folder in the system file manager.
     */
    showInFolder: defineEvent('app')
      .module('system')
      .event('show-in-folder')
      .define<ShowInFolderRequest, void>(),

    /**
     * Open an application.
     */
    openApp: defineEvent('app')
      .module('system')
      .event('open-app')
      .define<OpenAppRequest, void>(),

    /**
     * Execute a command/open a path.
     */
    executeCommand: defineEvent('app')
      .module('system')
      .event('execute-command')
      .define<ExecuteCommandRequest, ExecuteCommandResponse>(),

    /**
     * Get current working directory.
     */
    getCwd: defineEvent('app')
      .module('system')
      .event('get-cwd')
      .define<void, string>(),

    /**
     * Resolve an Electron app path.
     */
    getPath: defineEvent('app')
      .module('system')
      .event('get-path')
      .define<GetPathRequest, string | null>(),

    /**
     * Read a local file as text.
     */
    readFile: defineEvent('app')
      .module('system')
      .event('read-file')
      .define<ReadFileRequest, string>(),

    /**
     * Get startup handshake info.
     */
    startup: defineEvent('app')
      .module('system')
      .event('startup')
      .define<StartupRequest, StartupResponse>(),
  },

  /**
   * File index events.
   */
  fileIndex: {
    /**
     * Get current indexing status.
     */
    status: defineEvent('app')
      .module('file-index')
      .event('status')
      .define<void, FileIndexStatus>(),

    /**
     * Get indexing statistics.
     */
    stats: defineEvent('app')
      .module('file-index')
      .event('stats')
      .define<void, FileIndexStats>(),

    /**
     * Trigger a full index rebuild.
     */
    rebuild: defineEvent('app')
      .module('file-index')
      .event('rebuild')
      .define<FileIndexRebuildRequest | void, FileIndexRebuildResult>(),

    /**
     * Get current battery status (for indexing throttling UI).
     */
    batteryLevel: defineEvent('app')
      .module('file-index')
      .event('battery-level')
      .define<void, FileIndexBatteryStatus | null>(),

    /**
     * Stream indexing progress updates.
     */
    progress: defineEvent('app')
      .module('file-index')
      .event('progress')
      .define<void, AsyncIterable<FileIndexProgress>>({
        stream: { enabled: true },
      }),
  },

  /**
   * Debug and developer tools events.
   */
  debug: {
    /**
     * Open developer tools.
     */
    openDevTools: defineEvent('app')
      .module('debug')
      .event('open-devtools')
      .define<DevToolsOptions | void, void>(),
  },

  /**
   * Build verification events.
   */
  build: {
    /**
     * Get build verification status.
     */
    getVerificationStatus: defineEvent('app')
      .module('build')
      .event('get-verification-status')
      .define<void, BuildVerificationStatus>(),
  },

  /**
   * Analytics and metrics events.
   */
  analytics: {
    /**
     * Get aggregated metrics snapshot for a specific window.
     */
    getSnapshot: defineEvent('app')
      .module('analytics')
      .event('get-snapshot')
      .define<AnalyticsSnapshotRequest, AnalyticsSnapshot>(),

    /**
     * Get metrics snapshots within a time range.
     */
    getRange: defineEvent('app')
      .module('analytics')
      .event('get-range')
      .define<AnalyticsRangeRequest, AnalyticsSnapshot[]>(),

    /**
     * Export metrics for a window/range.
     */
    export: defineEvent('app')
      .module('analytics')
      .event('export')
      .define<AnalyticsExportPayload, AnalyticsExportResult>(),

    /**
     * Toggle analytics reporting.
     */
    toggleReporting: defineEvent('app')
      .module('analytics')
      .event('toggle-reporting')
      .define<AnalyticsToggleRequest, { enabled: boolean }>(),

    /**
     * Analytics message center events.
     */
    messages: {
      list: defineEvent('app')
        .module('analytics')
        .event('messages.list')
        .define<AnalyticsMessageListRequest, AnalyticsMessage[]>(),

      mark: defineEvent('app')
        .module('analytics')
        .event('messages.mark')
        .define<AnalyticsMessageUpdateRequest, AnalyticsMessage | null>(),
    },

    /**
     * SDK-level plugin analytics events.
     */
    sdk: {
      trackEvent: defineEvent('app')
        .module('analytics')
        .event('sdk.track-event')
        .define<TrackEventPayload, { ok: true }>(),

      trackDuration: defineEvent('app')
        .module('analytics')
        .event('sdk.track-duration')
        .define<TrackDurationPayload, { ok: true }>(),

      getStats: defineEvent('app')
        .module('analytics')
        .event('sdk.get-stats')
        .define<{ pluginName?: string, pluginVersion?: string }, PluginStats>(),

      getFeatureStats: defineEvent('app')
        .module('analytics')
        .event('sdk.get-feature-stats')
        .define<{ pluginName?: string, pluginVersion?: string, featureId: string }, FeatureStats>(),

      getTopFeatures: defineEvent('app')
        .module('analytics')
        .event('sdk.get-top-features')
        .define<{ pluginName?: string, pluginVersion?: string, limit?: number }, Array<{ id: string, count: number }>>(),

      incrementCounter: defineEvent('app')
        .module('analytics')
        .event('sdk.increment-counter')
        .define<CounterPayload, { ok: true }>(),

      setGauge: defineEvent('app')
        .module('analytics')
        .event('sdk.set-gauge')
        .define<GaugePayload, { ok: true }>(),

      recordHistogram: defineEvent('app')
        .module('analytics')
        .event('sdk.record-histogram')
        .define<HistogramPayload, { ok: true }>(),
    },

    /**
     * Get current performance metrics.
     * @deprecated Use analytics.getSnapshot instead.
     */
    getCurrent: defineEvent('app')
      .module('analytics')
      .event('get-current')
      .define<void, CurrentMetrics>(),

    /**
     * Get performance history.
     */
    getHistory: defineEvent('app')
      .module('analytics')
      .event('get-history')
      .define<void, PerformanceHistoryEntry[]>(),

    /**
     * Get performance summary.
     */
    getSummary: defineEvent('app')
      .module('analytics')
      .event('get-summary')
      .define<void, PerformanceSummary>(),

    /**
     * Report metrics to an endpoint (legacy).
     * @deprecated Use analytics.export instead.
     */
    report: defineEvent('app')
      .module('analytics')
      .event('report')
      .define<ReportMetricsRequest, ReportMetricsResponse>(),

    /**
     * Report renderer performance incidents.
     */
    perfReport: defineEvent('app')
      .module('analytics')
      .event('perf-report')
      .define<RendererPerfReport, void>(),
  },
} as const

// ============================================================================
// Download Events
// ============================================================================

export const DownloadEvents = {
  task: {
    add: defineEvent('download')
      .module('task')
      .event('add')
      .define<DownloadAddTaskRequest, DownloadAddTaskResponse>(),

    pause: defineEvent('download')
      .module('task')
      .event('pause')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),

    resume: defineEvent('download')
      .module('task')
      .event('resume')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),

    cancel: defineEvent('download')
      .module('task')
      .event('cancel')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),

    retry: defineEvent('download')
      .module('task')
      .event('retry')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),

    remove: defineEvent('download')
      .module('task')
      .event('remove')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),

    getStatus: defineEvent('download')
      .module('task')
      .event('get-status')
      .define<DownloadTaskIdRequest, DownloadGetTaskStatusResponse>(),

    updatePriority: defineEvent('download')
      .module('task')
      .event('update-priority')
      .define<DownloadUpdatePriorityRequest, DownloadOpResponse>(),

    pauseAll: defineEvent('download')
      .module('task')
      .event('pause-all')
      .define<void, DownloadOpResponse>(),

    resumeAll: defineEvent('download')
      .module('task')
      .event('resume-all')
      .define<void, DownloadOpResponse>(),

    cancelAll: defineEvent('download')
      .module('task')
      .event('cancel-all')
      .define<void, DownloadOpResponse>(),
  },

  list: {
    getAll: defineEvent('download')
      .module('list')
      .event('get')
      .define<void, DownloadGetTasksResponse>(),

    getByStatus: defineEvent('download')
      .module('list')
      .event('get-by-status')
      .define<DownloadGetTasksByStatusRequest, DownloadGetTasksResponse>(),
  },

  config: {
    get: defineEvent('download')
      .module('config')
      .event('get')
      .define<void, DownloadGetConfigResponse>(),

    update: defineEvent('download')
      .module('config')
      .event('update')
      .define<DownloadUpdateConfigRequest, DownloadOpResponse>(),

    getNotification: defineEvent('download')
      .module('config')
      .event('get-notification')
      .define<void, DownloadGetNotificationConfigResponse>(),

    updateNotification: defineEvent('download')
      .module('config')
      .event('update-notification')
      .define<DownloadUpdateNotificationConfigRequest, DownloadOpResponse>(),
  },

  history: {
    get: defineEvent('download')
      .module('history')
      .event('get')
      .define<DownloadGetHistoryRequest, DownloadGetHistoryResponse>(),

    clear: defineEvent('download')
      .module('history')
      .event('clear')
      .define<void, DownloadOpResponse>(),

    clearItem: defineEvent('download')
      .module('history')
      .event('clear-item')
      .define<DownloadClearHistoryItemRequest, DownloadOpResponse>(),
  },

  file: {
    open: defineEvent('download')
      .module('file')
      .event('open')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),

    showInFolder: defineEvent('download')
      .module('file')
      .event('show-in-folder')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),

    delete: defineEvent('download')
      .module('file')
      .event('delete')
      .define<DownloadTaskIdRequest, DownloadOpResponse>(),
  },

  maintenance: {
    cleanupTemp: defineEvent('download')
      .module('maintenance')
      .event('cleanup-temp')
      .define<void, DownloadOpResponse>(),
  },

  logs: {
    get: defineEvent('download')
      .module('logs')
      .event('get')
      .define<{ limit?: number }, DownloadGetLogsResponse>(),

    getErrorStats: defineEvent('download')
      .module('logs')
      .event('get-error-stats')
      .define<void, DownloadGetErrorStatsResponse>(),

    clear: defineEvent('download')
      .module('logs')
      .event('clear')
      .define<void, DownloadOpResponse>(),
  },

  temp: {
    getStats: defineEvent('download')
      .module('temp')
      .event('get-stats')
      .define<void, DownloadGetTempStatsResponse>(),
  },

  stats: {
    get: defineEvent('download')
      .module('stats')
      .event('get')
      .define<void, DownloadGetStatsResponse>(),
  },

  migration: {
    checkNeeded: defineEvent('download')
      .module('migration')
      .event('check-needed')
      .define<void, DownloadMigrationNeededResponse>(),

    start: defineEvent('download')
      .module('migration')
      .event('start')
      .define<void, DownloadMigrationStartResponse>(),

    retry: defineEvent('download')
      .module('migration')
      .event('retry')
      .define<void, DownloadMigrationRetryResponse>(),

    status: defineEvent('download')
      .module('migration')
      .event('status')
      .define<void, DownloadMigrationStatusResponse>(),
  },

  push: {
    taskAdded: defineEvent('download')
      .module('push')
      .event('task-added')
      .define<DownloadTaskPayload, void>(),

    taskProgress: defineEvent('download')
      .module('push')
      .event('task-progress')
      .define<DownloadTaskPayload, void>(),

    taskCompleted: defineEvent('download')
      .module('push')
      .event('task-completed')
      .define<DownloadTaskPayload, void>(),

    taskFailed: defineEvent('download')
      .module('push')
      .event('task-failed')
      .define<DownloadTaskPayload, void>(),

    taskUpdated: defineEvent('download')
      .module('push')
      .event('task-updated')
      .define<DownloadTaskPayload, void>(),

    taskRetrying: defineEvent('download')
      .module('push')
      .event('task-retrying')
      .define<DownloadTaskRetryingPayload, void>(),

    notificationClicked: defineEvent('download')
      .module('push')
      .event('notification-clicked')
      .define<DownloadNotificationClickedPayload, void>(),
  },
} as const

// ============================================================================
// Update Events
// ============================================================================

export const UpdateEvents = {
  check: defineEvent('update')
    .module('service')
    .event('check')
    .define<UpdateCheckRequest, UpdateCheckResponse>(),

  getSettings: defineEvent('update')
    .module('service')
    .event('get-settings')
    .define<void, UpdateGetSettingsResponse>(),

  updateSettings: defineEvent('update')
    .module('service')
    .event('update-settings')
    .define<UpdateUpdateSettingsRequest, UpdateOpResponse>(),

  getStatus: defineEvent('update')
    .module('service')
    .event('get-status')
    .define<void, UpdateGetStatusResponse>(),

  clearCache: defineEvent('update')
    .module('service')
    .event('clear-cache')
    .define<void, UpdateOpResponse>(),

  getCachedRelease: defineEvent('update')
    .module('service')
    .event('get-cached-release')
    .define<UpdateCachedReleaseRequest, UpdateGetCachedReleaseResponse>(),

  recordAction: defineEvent('update')
    .module('service')
    .event('record-action')
    .define<UpdateRecordActionRequest, UpdateOpResponse>(),

  download: defineEvent('update')
    .module('service')
    .event('download')
    .define<UpdateDownloadRequest, UpdateDownloadResponse>(),

  install: defineEvent('update')
    .module('service')
    .event('install')
    .define<UpdateInstallRequest, UpdateOpResponse>(),

  ignoreVersion: defineEvent('update')
    .module('service')
    .event('ignore-version')
    .define<UpdateIgnoreVersionRequest, UpdateOpResponse>(),

  setAutoDownload: defineEvent('update')
    .module('service')
    .event('set-auto-download')
    .define<UpdateAutoDownloadRequest, UpdateOpResponse>(),

  setAutoCheck: defineEvent('update')
    .module('service')
    .event('set-auto-check')
    .define<UpdateAutoCheckRequest, UpdateOpResponse>(),

  available: defineEvent('update')
    .module('push')
    .event('available')
    .define<UpdateAvailablePayload, void>(),
} as const

// ============================================================================
// Flow Events
// ============================================================================

export const FlowEvents = {
  dispatch: defineEvent('flow')
    .module('bus')
    .event('dispatch')
    .define<FlowDispatchRequest, FlowDispatchResponse>(),

  getTargets: defineEvent('flow')
    .module('bus')
    .event('get-targets')
    .define<FlowGetTargetsRequest, FlowGetTargetsResponse>(),

  cancel: defineEvent('flow')
    .module('bus')
    .event('cancel')
    .define<{ sessionId: string, _sdkapi?: number }, FlowCancelResponse>(),

  acknowledge: defineEvent('flow')
    .module('bus')
    .event('acknowledge')
    .define<FlowAcknowledgeRequest, FlowAcknowledgeResponse>(),

  reportError: defineEvent('flow')
    .module('bus')
    .event('report-error')
    .define<FlowReportErrorRequest, FlowReportErrorResponse>(),

  selectTarget: defineEvent('flow')
    .module('bus')
    .event('select-target')
    .define<FlowSelectTargetRequest, FlowSelectTargetResponse>(),

  checkConsent: defineEvent('flow')
    .module('consent')
    .event('check')
    .define<FlowConsentCheckRequest, FlowConsentCheckResponse>(),

  grantConsent: defineEvent('flow')
    .module('consent')
    .event('grant')
    .define<FlowConsentGrantRequest, FlowConsentGrantResponse>(),

  sessionUpdate: defineEvent('flow')
    .module('session')
    .event('update')
    .define<FlowSessionUpdatePayload, void>(),

  deliver: defineEvent('flow')
    .module('session')
    .event('deliver')
    .define<FlowDeliverPayload, void>(),

  triggerTransfer: defineEvent('flow')
    .module('ui')
    .event('trigger-transfer')
    .define<void, void>(),

  triggerDetach: defineEvent('flow')
    .module('ui')
    .event('trigger-detach')
    .define<void, void>(),

  registerTargets: defineEvent('flow')
    .module('plugin')
    .event('register-targets')
    .define<FlowRegisterTargetsRequest, { success: boolean }>(),

  unregisterTargets: defineEvent('flow')
    .module('plugin')
    .event('unregister-targets')
    .define<FlowUnregisterTargetsRequest, { success: boolean }>(),

  setPluginEnabled: defineEvent('flow')
    .module('plugin')
    .event('set-plugin-enabled')
    .define<FlowSetPluginEnabledRequest, { success: boolean }>(),

  setPluginHandler: defineEvent('flow')
    .module('plugin')
    .event('set-plugin-handler')
    .define<FlowSetPluginHandlerRequest, { success: boolean }>(),

  nativeShare: defineEvent('flow')
    .module('native')
    .event('share')
    .define<FlowNativeShareRequest, FlowNativeShareResponse>(),
} as const

// ============================================================================
// DivisionBox Events
// ============================================================================

export const DivisionBoxEvents = {
  open: defineEvent('division-box')
    .module('session')
    .event('open')
    .define<DivisionBoxOpenRequest, DivisionBoxOpenResponse>(),

  close: defineEvent('division-box')
    .module('session')
    .event('close')
    .define<DivisionBoxCloseRequest, DivisionBoxCloseResponse>(),

  getState: defineEvent('division-box')
    .module('session')
    .event('get-state')
    .define<DivisionBoxGetStateRequest, DivisionBoxGetStateResponse>(),

  updateState: defineEvent('division-box')
    .module('session')
    .event('update-state')
    .define<DivisionBoxUpdateStateRequest, DivisionBoxUpdateStateResponse>(),

  getActiveSessions: defineEvent('division-box')
    .module('session')
    .event('get-active-sessions')
    .define<DivisionBoxGetActiveSessionsRequest, DivisionBoxGetActiveSessionsResponse>(),

  stateChanged: defineEvent('division-box')
    .module('session')
    .event('state-changed')
    .define<DivisionBoxStateChangedPayload, void>(),

  sessionDestroyed: defineEvent('division-box')
    .module('session')
    .event('session-destroyed')
    .define<DivisionBoxSessionDestroyedPayload, void>(),

  togglePin: defineEvent('division-box')
    .module('window')
    .event('toggle-pin')
    .define<DivisionBoxTogglePinRequest, DivisionBoxTogglePinResponse>(),

  setOpacity: defineEvent('division-box')
    .module('window')
    .event('set-opacity')
    .define<DivisionBoxSetOpacityRequest, DivisionBoxSetOpacityResponse>(),

  toggleDevTools: defineEvent('division-box')
    .module('window')
    .event('toggle-devtools')
    .define<DivisionBoxToggleDevToolsRequest, DivisionBoxToggleDevToolsResponse>(),

  getWindowState: defineEvent('division-box')
    .module('window')
    .event('get-window-state')
    .define<DivisionBoxGetWindowStateRequest, DivisionBoxGetWindowStateResponse>(),

  inputChange: defineEvent('division-box')
    .module('ui')
    .event('input-change')
    .define<DivisionBoxInputChangeRequest, DivisionBoxInputChangeResponse>(),

  flowTrigger: defineEvent('division-box')
    .module('flow')
    .event('trigger')
    .define<DivisionBoxFlowTriggerRequest, DivisionBoxFlowTriggerResponse>(),
} as const

/**
 * CoreBox events for search, UI control, and input management.
 */
export const CoreBoxEvents = {
  /**
   * UI control events.
   */
  ui: {
    /**
     * Show the CoreBox window.
     */
    show: defineRawEvent<void, void>('core-box:show'),

    /**
     * Hide the CoreBox window.
     */
    hide: defineRawEvent<void, void>('core-box:hide'),

    /**
     * Expand or collapse the CoreBox.
     */
    expand: defineRawEvent<ExpandOptions | number, void>('core-box:expand'),

    /**
     * Focus the CoreBox window.
     */
    focusWindow: defineRawEvent<void, FocusWindowResponse>('core-box:focus-window'),

    /**
     * Forward a key event to the attached UI view.
     */
    forwardKeyEvent: defineRawEvent<CoreBoxForwardKeyEvent, void>('core-box:forward-key-event'),

    /**
     * Query current UI view state.
     */
    getUIViewState: defineRawEvent<void, CoreBoxUIViewStateResponse>('core-box:get-ui-view-state'),

    /**
     * Notify renderer that CoreBox was triggered by shortcut.
     */
    shortcutTriggered: defineRawEvent<void, void>('core-box:shortcut-triggered'),

    /**
     * Notify renderer that UI mode exited.
     */
    uiModeExited: defineRawEvent<CoreBoxUIModeExitedPayload, void>('core-box:ui-mode-exited'),
  },

  /**
   * Layout events (renderer -> main).
   */
  layout: {
    /**
     * Report current desired window height and state flags.
     *
     * @remarks
     * This event is expected to be sent frequently. The main process should
     * coalesce updates and decide when/how to resize the window.
     */
    update: defineEvent('core-box')
      .module('layout')
      .event('update')
      .define<CoreBoxLayoutUpdateRequest, void>({
        batch: { enabled: true, windowMs: 16, mergeStrategy: 'latest' },
      }),
  },

  /**
   * Search events.
   */
  search: {
    /**
     * Execute a search query.
     *
     * @remarks
     * This event supports streaming results via MessagePort.
     */
    query: defineRawEvent<{ query: TuffQuery }, TuffSearchResult>('core-box:query', {
      stream: { enabled: true, bufferSize: 100 },
    }),

    /**
     * Cancel an in-progress search.
     */
    cancel: defineRawEvent<CancelSearchRequest, CancelSearchResponse>('core-box:cancel-search'),

    /**
     * Push incremental search results to renderer.
     */
    update: defineRawEvent<CoreBoxSearchUpdatePayload, void>('core-box:search-update'),

    /**
     * Mark search finished/cancelled.
     */
    end: defineRawEvent<CoreBoxSearchEndPayload, void>('core-box:search-end'),

    /**
     * Notify renderer about empty results (UI sizing hint).
     */
    noResults: defineRawEvent<CoreBoxNoResultsPayload, void>('core-box:no-results'),
  },

  /**
   * Input field events.
   */
  input: {
    /**
     * Get current input value.
     */
    get: defineRawEvent<void, GetInputResponse>('core-box:get-input'),

    /**
     * Set input value.
     */
    set: defineRawEvent<SetInputRequest, SetInputResponse>('core-box:set-input'),

    /**
     * Clear input value.
     */
    clear: defineRawEvent<void, ClearInputResponse>('core-box:clear-input'),

    /**
     * Set input visibility.
     */
    setVisibility: defineRawEvent<SetInputVisibilityRequest, void>('core-box:set-input-visibility'),

    /**
     * Broadcast input changes from renderer.
     */
    change: defineRawEvent<CoreBoxInputChangeRequest, void>('core-box:input-change'),

    /**
     * Request input value from renderer.
     */
    requestValue: defineRawEvent<void, GetInputResponse>('core-box:request-input-value'),

    /**
     * Set query from main process.
     */
    setQuery: defineRawEvent<SetInputRequest, void>('core-box:set-query'),
  },

  /**
   * Item execution and mutations.
   */
  item: {
    execute: defineRawEvent<CoreBoxExecuteRequest, IProviderActivate[] | null>('core-box:execute'),

    clear: defineRawEvent<CoreBoxClearItemsPayload | void, void>('core-box:clear-items'),

    togglePin: defineRawEvent<CoreBoxTogglePinRequest, CoreBoxTogglePinResponse>('core-box:toggle-pin'),
  },

  /**
   * Provider management events.
   */
  provider: {
    /**
     * Deactivate a specific provider.
     */
    deactivate: defineRawEvent<DeactivateProviderRequest, ActivationState>('core-box:deactivate-provider'),

    /**
     * Deactivate all providers.
     */
    deactivateAll: defineRawEvent<void, ActivationState>('core-box:deactivate-providers'),

    /**
     * Get current activated providers.
     */
    getActivated: defineRawEvent<void, ActivationState>('core-box:get-activated-providers'),

    /**
     * Get details for multiple providers.
     *
     * @remarks
     * This event supports batching for efficiency.
     */
    getDetails: defineRawEvent<GetProviderDetailsRequest, ProviderDetail[]>('core-box:get-provider-details', {
      batch: { enabled: true, windowMs: 50, mergeStrategy: 'dedupe' },
    }),
  },

  /**
   * UI mode events.
   */
  uiMode: {
    /**
     * Enter plugin UI mode.
     */
    enter: defineRawEvent<EnterUIModeRequest, void>('core-box:enter-ui-mode'),

    /**
     * Exit plugin UI mode.
     */
    exit: defineRawEvent<void, void>('core-box:exit-ui-mode'),
  },

  /**
   * Clipboard monitoring events.
   */
  clipboard: {
    /**
     * Allow clipboard monitoring for specific types.
     */
    allow: defineRawEvent<AllowClipboardRequest, AllowClipboardResponse>('core-box:allow-clipboard'),
  },

  /**
   * Input monitoring events.
   */
  inputMonitoring: {
    /**
     * Allow input monitoring.
     */
    allow: defineEvent('core-box')
      .module('input-monitoring')
      .event('allow')
      .define<void, AllowInputMonitoringResponse>(),
  },
} as const

/**
 * Storage events for app and plugin configuration persistence.
 */
export const StorageEvents = {
  /**
   * Application storage events.
   */
  app: {
    /**
     * Get a value from app storage.
     *
     * @remarks
     * This event supports batching for efficiency.
     */
    get: defineEvent('storage')
      .module('app')
      .event('get')
      .define<StorageGetRequest, unknown>({
        batch: { enabled: true, windowMs: 16, maxSize: 20 },
      }),

    /**
     * Get a value with version info from app storage.
     */
    getVersioned: defineEvent('storage')
      .module('app')
      .event('get-versioned')
      .define<StorageGetRequest, StorageGetVersionedResponse | null>({
        batch: { enabled: true, windowMs: 16, maxSize: 20 },
      }),

    /**
     * Set a value in app storage.
     *
     * @remarks
     * This event supports batching with 'latest' strategy.
     */
    set: defineEvent('storage')
      .module('app')
      .event('set')
      .define<StorageSetRequest, void>({
        batch: { enabled: true, windowMs: 100, mergeStrategy: 'latest' },
      }),

    /**
     * Save a value with version tracking in app storage.
     */
    save: defineEvent('storage')
      .module('app')
      .event('save')
      .define<StorageSaveRequest, StorageSaveResult>(),

    /**
     * Delete a value from app storage.
     */
    delete: defineEvent('storage')
      .module('app')
      .event('delete')
      .define<StorageDeleteRequest, void>(),

    /**
     * Subscribe to storage updates.
     */
    updated: defineEvent('storage')
      .module('app')
      .event('updated')
      .define<void, AsyncIterable<StorageUpdateNotification>>({
        stream: { enabled: true },
      }),
  },

  /**
   * Plugin storage events.
   */
  plugin: {
    /**
     * Get a value from plugin storage.
     *
     * @remarks
     * This event supports batching for efficiency.
     */
    get: defineEvent('storage')
      .module('plugin')
      .event('get')
      .define<PluginStorageGetRequest, unknown>({
        batch: { enabled: true, windowMs: 16 },
      }),

    /**
     * Set a value in plugin storage.
     *
     * @remarks
     * This event supports batching with 'latest' strategy.
     */
    set: defineEvent('storage')
      .module('plugin')
      .event('set')
      .define<PluginStorageSetRequest, void>({
        batch: { enabled: true, windowMs: 100, mergeStrategy: 'latest' },
      }),

    /**
     * Delete a value from plugin storage.
     */
    delete: defineEvent('storage')
      .module('plugin')
      .event('delete')
      .define<PluginStorageDeleteRequest, void>(),
  },
} as const

/**
 * Plugin lifecycle and feature events.
 */
export const PluginEvents = {
  /**
   * Plugin lifecycle events.
   */
  lifecycle: {
    /**
     * Load a plugin.
     */
    load: defineEvent('plugin')
      .module('lifecycle')
      .event('load')
      .define<PluginLoadRequest, PluginInfo>(),

    /**
     * Unload a plugin.
     */
    unload: defineEvent('plugin')
      .module('lifecycle')
      .event('unload')
      .define<PluginUnloadRequest, void>(),

    /**
     * Reload a plugin.
     */
    reload: defineEvent('plugin')
      .module('lifecycle')
      .event('reload')
      .define<PluginReloadRequest, PluginInfo>(),

    /**
     * Enable a plugin.
     */
    enable: defineEvent('plugin')
      .module('lifecycle')
      .event('enable')
      .define<PluginEnableRequest, void>(),

    /**
     * Disable a plugin.
     */
    disable: defineEvent('plugin')
      .module('lifecycle')
      .event('disable')
      .define<PluginDisableRequest, void>(),
  },

  /**
   * Lifecycle notifications pushed to plugin renderer processes.
   */
  lifecycleSignal: {
    active: defineEvent('plugin')
      .module('lifecycle')
      .event('active')
      .define<void, void>(),

    inactive: defineEvent('plugin')
      .module('lifecycle')
      .event('inactive')
      .define<void, void>(),

    enabled: defineEvent('plugin')
      .module('lifecycle')
      .event('enabled')
      .define<unknown, void>(),

    disabled: defineEvent('plugin')
      .module('lifecycle')
      .event('disabled')
      .define<unknown, void>(),

    crashed: defineEvent('plugin')
      .module('lifecycle')
      .event('crashed')
      .define<unknown, void>(),
  },

  /**
   * Renderer-facing push/broadcast events.
   */
  push: {
    stateChanged: defineRawEvent<PluginPushStateChangedPayload, void>('plugin:state-changed'),
    statusUpdated: defineRawEvent<PluginPushStatusUpdatedPayload, void>('plugin-status-updated'),
    reloadReadme: defineRawEvent<PluginPushReloadReadmePayload, void>('plugin:reload-readme'),
    reload: defineRawEvent<PluginPushReloadPayload, void>('plugin:reload'),
    crashed: defineRawEvent<PluginPushCrashedPayload, void>('plugin-crashed'),
  },

  /**
   * Plugin management APIs (renderer/main).
   */
  api: {
    list: defineEvent('plugin')
      .module('api')
      .event('list')
      .define<PluginApiListRequest, PluginApiListResponse>(),

    get: defineEvent('plugin')
      .module('api')
      .event('get')
      .define<PluginApiGetRequest, PluginApiGetResponse>(),

    getStatus: defineEvent('plugin')
      .module('api')
      .event('get-status')
      .define<PluginApiGetStatusRequest, PluginApiGetStatusResponse>(),

    enable: defineEvent('plugin')
      .module('api')
      .event('enable')
      .define<PluginApiOperationRequest, PluginApiOperationResponse>(),

    disable: defineEvent('plugin')
      .module('api')
      .event('disable')
      .define<PluginApiOperationRequest, PluginApiOperationResponse>(),

    reload: defineEvent('plugin')
      .module('api')
      .event('reload')
      .define<PluginApiOperationRequest, PluginApiOperationResponse>(),

    install: defineEvent('plugin')
      .module('api')
      .event('install')
      .define<PluginApiInstallRequest, PluginApiInstallResponse>(),

    uninstall: defineEvent('plugin')
      .module('api')
      .event('uninstall')
      .define<PluginApiOperationRequest, PluginApiOperationResponse>(),

    triggerFeature: defineEvent('plugin')
      .module('api')
      .event('trigger-feature')
      .define<PluginApiTriggerFeatureRequest, PluginApiTriggerFeatureResponse>(),

    featureInputChanged: defineEvent('plugin')
      .module('api')
      .event('feature-input-changed')
      .define<PluginApiFeatureInputChangedRequest, void>(),

    openFolder: defineEvent('plugin')
      .module('api')
      .event('open-folder')
      .define<PluginApiOpenFolderRequest, void>(),

    getOfficialList: defineEvent('plugin')
      .module('api')
      .event('get-official-list')
      .define<PluginApiGetOfficialListRequest, PluginApiGetOfficialListResponse>(),

    getManifest: defineEvent('plugin')
      .module('api')
      .event('get-manifest')
      .define<PluginApiGetManifestRequest, PluginApiGetManifestResponse>(),

    saveManifest: defineEvent('plugin')
      .module('api')
      .event('save-manifest')
      .define<PluginApiSaveManifestRequest, PluginApiSaveManifestResponse>(),

    getPaths: defineEvent('plugin')
      .module('api')
      .event('get-paths')
      .define<PluginApiGetPathsRequest, PluginApiGetPathsResponse>(),

    openPath: defineEvent('plugin')
      .module('api')
      .event('open-path')
      .define<PluginApiOpenPathRequest, PluginApiOpenPathResponse>(),

    getPerformance: defineEvent('plugin')
      .module('api')
      .event('get-performance')
      .define<PluginApiGetPerformanceRequest, PluginApiGetPerformanceResponse>(),

    getRuntimeStats: defineEvent('plugin')
      .module('api')
      .event('get-runtime-stats')
      .define<PluginApiGetRuntimeStatsRequest, PluginApiGetRuntimeStatsResponse>(),
  },

  install: {
    progress: defineRawEvent<PluginInstallProgressPayload, void>('plugin:install-progress'),
    confirm: defineRawEvent<PluginInstallConfirmPayload, void>('plugin:install-confirm'),
    confirmResponse: defineRawEvent<PluginInstallConfirmResponsePayload, void>('plugin:install-confirm-response'),
    source: defineRawEvent<PluginInstallSourceRequest, PluginInstallSourceResponse>('plugin:install-source'),
  },

  devServer: {
    reconnect: defineRawEvent<PluginReconnectDevServerRequest, PluginReconnectDevServerResponse>('plugin:reconnect-dev-server'),
    status: defineRawEvent<PluginDevServerStatusRequest, PluginDevServerStatusResponse>('plugin:dev-server-status'),
  },

  storage: {
    getFile: defineEvent('plugin')
      .module('storage')
      .event('get-file')
      .define<PluginStorageFileRequest, unknown>(),

    setFile: defineEvent('plugin')
      .module('storage')
      .event('set-file')
      .define<PluginStorageSetFileRequest, { success: boolean, error?: string }>(),

    deleteFile: defineEvent('plugin')
      .module('storage')
      .event('delete-file')
      .define<PluginStorageFileRequest, { success: boolean, error?: string }>(),

    listFiles: defineEvent('plugin')
      .module('storage')
      .event('list-files')
      .define<PluginStorageListFilesRequest, string[]>(),

    getStats: defineEvent('plugin')
      .module('storage')
      .event('get-stats')
      .define<PluginStorageStatsRequest, unknown>(),

    getTree: defineEvent('plugin')
      .module('storage')
      .event('get-tree')
      .define<PluginStorageTreeRequest, unknown>(),

    getFileDetails: defineEvent('plugin')
      .module('storage')
      .event('get-file-details')
      .define<PluginStorageFileDetailsRequest, unknown>(),

    clear: defineEvent('plugin')
      .module('storage')
      .event('clear')
      .define<PluginStorageClearRequest, { success: boolean, error?: string }>(),

    openFolder: defineEvent('plugin')
      .module('storage')
      .event('open-folder')
      .define<PluginStorageOpenFolderRequest, void>(),

    openInEditor: defineRawEvent<PluginStorageOpenInEditorRequest, { success: boolean, error?: string }>(
      'plugin:storage:open-in-editor',
    ),

    update: defineEvent('plugin')
      .module('storage')
      .event('update')
      .define<PluginStorageUpdatePayload, void>(),
  },

  performance: {
    getMetrics: defineEvent('plugin')
      .module('performance')
      .event('get-metrics')
      .define<void, PluginPerformanceGetMetricsResponse>(),

    getPaths: defineEvent('plugin')
      .module('performance')
      .event('get-paths')
      .define<void, PluginPerformanceGetPathsResponse>(),
  },

  /**
   * Feature trigger events.
   */
  feature: {
    /**
     * Trigger a plugin feature.
     */
    trigger: defineEvent('plugin')
      .module('feature')
      .event('trigger')
      .define<FeatureTriggerRequest, FeatureTriggerResponse>(),
  },

  /**
   * Plugin logging events.
   */
  log: {
    /**
     * Write a log entry.
     *
     * @remarks
     * This event supports batching for efficiency.
     */
    write: defineEvent('plugin')
      .module('log')
      .event('write')
      .define<PluginLogEntry, void>({
        batch: { enabled: true, windowMs: 100, maxSize: 50 },
      }),
  },
} as const

export const MarketEvents = {
  api: {
    checkUpdates: defineRawEvent<void, MarketCheckUpdatesResponse>('market:check-updates'),
    search: defineRawEvent<MarketSearchRequest, MarketSearchResponse>('market:search'),
    getPlugin: defineRawEvent<MarketGetPluginRequest, MarketGetPluginResponse>('market:get-plugin'),
    httpRequest: defineRawEvent<MarketHttpRequest, MarketHttpRequestResponse>('market:http-request'),

    featured: defineRawEvent<unknown, unknown>('market:featured'),
    npmList: defineRawEvent<void, unknown>('market:npm-list'),
  },

  push: {
    updatesAvailable: defineRawEvent<MarketUpdatesAvailablePayload, void>('market:updates-available'),
  },
} as const

export const PermissionEvents = {
  api: {
    getPlugin: defineRawEvent<PermissionGetPluginRequest, PermissionGetPluginResponse>('permission:get-plugin'),
    getStatus: defineRawEvent<PermissionGetStatusRequest, PermissionGetStatusResponse>('permission:get-status'),
    grant: defineRawEvent<PermissionGrantRequest, PermissionOperationResult>('permission:grant'),
    revoke: defineRawEvent<PermissionRevokeRequest, PermissionOperationResult>('permission:revoke'),
    grantMultiple: defineRawEvent<PermissionGrantMultipleRequest, PermissionOperationResult>('permission:grant-multiple'),
    grantSession: defineRawEvent<PermissionGrantMultipleRequest, PermissionOperationResult>('permission:grant-session'),
    revokeAll: defineRawEvent<PermissionRevokeAllRequest, PermissionOperationResult>('permission:revoke-all'),
    check: defineRawEvent<PermissionCheckRequest, PermissionCheckResponse>('permission:check'),
    getAll: defineRawEvent<void, PermissionGetAllResponse>('permission:get-all'),
    getRegistry: defineRawEvent<void, PermissionGetRegistryResponse>('permission:get-registry'),
    getAuditLogs: defineRawEvent<PermissionGetAuditLogsRequest | void, PermissionGetAuditLogsResponse>('permission:get-audit-logs'),
    clearAuditLogs: defineRawEvent<void, PermissionOperationResult>('permission:clear-audit-logs'),
    getPerformance: defineRawEvent<void, PermissionGetPerformanceResponse>('permission:get-performance'),
    resetPerformance: defineRawEvent<void, PermissionOperationResult>('permission:reset-performance'),
  },

  push: {
    updated: defineRawEvent<PermissionUpdatedPayload, void>('permission:updated'),
    startupRequest: defineRawEvent<PermissionStartupRequestPayload, void>('permission:startup-request'),
  },
} as const

export const PlatformEvents = {
  capabilities: {
    list: defineEvent('platform')
      .module('capabilities')
      .event('list')
      .define<PlatformCapabilityListRequest | void, PlatformCapabilityListResponse>(),
  },
} as const

export const AgentsEvents = {
  api: {
    list: defineRawEvent<void, AgentsListResponse>('agents:list'),
    listAll: defineRawEvent<void, AgentsListResponse>('agents:list-all'),
    get: defineRawEvent<AgentsGetRequest, AgentsGetResponse>('agents:get'),
    execute: defineRawEvent<AgentsExecuteRequest, AgentsExecuteResponse>('agents:execute'),
    executeImmediate: defineRawEvent<AgentsExecuteImmediateRequest, AgentsExecuteImmediateResponse>('agents:execute-immediate'),
    cancel: defineRawEvent<AgentsCancelRequest, AgentsCancelResponse>('agents:cancel'),
    taskStatus: defineRawEvent<AgentsTaskStatusRequest, AgentsTaskStatusResponse>('agents:task-status'),
    stats: defineRawEvent<void, AgentsStatsResponse>('agents:stats'),

    tools: {
      list: defineEvent('agents')
        .module('tools')
        .event('list')
        .define<void, AgentsToolsListResponse>(),

      get: defineEvent('agents')
        .module('tools')
        .event('get')
        .define<AgentsToolsGetRequest, AgentsToolsGetResponse>(),
    },
  },

  market: {
    search: defineEvent('agents')
      .module('market')
      .event('search')
      .define<unknown, unknown>(),

    get: defineEvent('agents')
      .module('market')
      .event('get')
      .define<unknown, unknown>(),

    featured: defineEvent('agents')
      .module('market')
      .event('featured')
      .define<void, unknown>(),

    installed: defineEvent('agents')
      .module('market')
      .event('installed')
      .define<void, unknown>(),

    categories: defineEvent('agents')
      .module('market')
      .event('categories')
      .define<void, unknown>(),

    install: defineEvent('agents')
      .module('market')
      .event('install')
      .define<unknown, unknown>(),

    uninstall: defineEvent('agents')
      .module('market')
      .event('uninstall')
      .define<unknown, unknown>(),

    checkUpdates: defineEvent('agents')
      .module('market')
      .event('check-updates')
      .define<void, unknown>(),
  },
} as const

export const TrayEvents = {
  autostart: {
    update: defineEvent('tray')
      .module('autostart')
      .event('update')
      .define<TrayAutostartUpdateRequest, TrayAutostartUpdateResponse>(),

    get: defineEvent('tray')
      .module('autostart')
      .event('get')
      .define<void, TrayAutostartGetResponse>(),
  },

  show: {
    get: defineEvent('tray')
      .module('show')
      .event('get')
      .define<void, TrayShowGetResponse>(),

    set: defineEvent('tray')
      .module('show')
      .event('set')
      .define<TrayShowSetRequest, TrayShowSetResponse>(),
  },

  hideDock: {
    set: defineEvent('tray')
      .module('hidedock')
      .event('set')
      .define<void, TrayHideDockSetResponse>(),
  },
} as const

export const SentryEvents = {
  api: {
    updateUser: defineRawEvent<SentryUpdateUserRequest, void>('sentry:update-user'),
    getConfig: defineRawEvent<void, SentryGetConfigResponse>('sentry:get-config'),
    getSearchCount: defineRawEvent<void, SentryGetSearchCountResponse>('sentry:get-search-count'),
    getTelemetryStats: defineRawEvent<void, SentryGetTelemetryStatsResponse>('sentry:get-telemetry-stats'),
    recordPerformance: defineRawEvent<SentryRecordPerformanceRequest, SentryRecordPerformanceResponse>('sentry:record-performance'),
  },
} as const

/**
 * BoxItem CRUD and sync events.
 */
export const BoxItemEvents = {
  /**
   * CRUD operations for individual items.
   */
  crud: {
    /**
     * Create a new BoxItem.
     */
    create: defineEvent('box-item')
      .module('crud')
      .event('create')
      .define<BoxItemCreateRequest, BoxItem>(),

    /**
     * Update an existing BoxItem.
     */
    update: defineEvent('box-item')
      .module('crud')
      .event('update')
      .define<BoxItemUpdateRequest, BoxItem>(),

    /**
     * Create or update a BoxItem.
     *
     * @remarks
     * This event supports batching for efficiency.
     */
    upsert: defineEvent('box-item')
      .module('crud')
      .event('upsert')
      .define<BoxItemUpsertRequest, BoxItem>({
        batch: { enabled: true, windowMs: 50, maxSize: 100 },
      }),

    /**
     * Delete a BoxItem.
     *
     * @remarks
     * This event supports batching for efficiency.
     */
    delete: defineEvent('box-item')
      .module('crud')
      .event('delete')
      .define<BoxItemDeleteRequest, void>({
        batch: { enabled: true, windowMs: 50 },
      }),
  },

  /**
   * Batch operations for multiple items.
   */
  batch: {
    /**
     * Batch upsert multiple BoxItems.
     */
    upsert: defineEvent('box-item')
      .module('batch')
      .event('upsert')
      .define<BoxItem[], BoxItemBatchUpsertResponse>(),

    /**
     * Batch delete multiple BoxItems.
     */
    delete: defineEvent('box-item')
      .module('batch')
      .event('delete')
      .define<string[], BoxItemBatchDeleteResponse>(),

    /**
     * Clear BoxItems by source.
     */
    clear: defineEvent('box-item')
      .module('batch')
      .event('clear')
      .define<BoxItemClearRequest, BoxItemClearResponse>(),
  },

  /**
   * Sync events for bulk data transfer.
   */
  sync: {
    /**
     * Request sync of all items.
     */
    request: defineEvent('box-item')
      .module('sync')
      .event('request')
      .define<void, void>(),

    /**
     * Receive sync response (streaming).
     *
     * @remarks
     * This event uses MessagePort streaming for large datasets.
     */
    response: defineEvent('box-item')
      .module('sync')
      .event('response')
      .define<void, AsyncIterable<BoxItemSyncResponse>>({
        stream: { enabled: true },
      }),
  },
} as const

/**
 * Clipboard domain events for history, monitoring, and actions.
 * @since v0.9.0
 */
export const ClipboardEvents = {
  /**
   * Subscribe to clipboard changes via MessagePort streaming.
   * @since v0.9.0
   */
  change: defineEvent('clipboard')
    .module('monitor')
    .event('change')
    .define<void, AsyncIterable<ClipboardChangePayload>>({
      stream: { enabled: true, bufferSize: 10 },
    }),

  /**
   * Query clipboard history with pagination and filters.
   * @since v0.9.0
   */
  getHistory: defineEvent('clipboard')
    .module('history')
    .event('get')
    .define<ClipboardQueryRequest, ClipboardQueryResponse>({
      batch: { enabled: true, windowMs: 50, mergeStrategy: 'dedupe' },
    }),

  /**
   * Get the most recent clipboard item.
   * @since v0.9.0
   */
  getLatest: defineEvent('clipboard')
    .module('history')
    .event('latest')
    .define<void, ClipboardItem | null>(),

  /**
   * Apply clipboard item to active application with auto-paste.
   * @since v0.9.0
   */
  apply: defineEvent('clipboard')
    .module('action')
    .event('apply')
    .define<ClipboardApplyRequest, void>(),

  /**
   * Delete a clipboard history item by ID.
   * @since v0.9.0
   */
  delete: defineEvent('clipboard')
    .module('history')
    .event('delete')
    .define<ClipboardDeleteRequest, void>(),

  /**
   * Toggle favorite status for a clipboard item.
   * @since v0.9.0
   */
  setFavorite: defineEvent('clipboard')
    .module('history')
    .event('set-favorite')
    .define<ClipboardSetFavoriteRequest, void>(),

  /**
   * Write content to system clipboard programmatically.
   * @since v0.9.0
   */
  write: defineEvent('clipboard')
    .module('action')
    .event('write')
    .define<ClipboardWriteRequest, void>(),
} as const

// ============================================================================
// Unified Export
// ============================================================================

/**
 * All TuffEvents organized by domain.
 *
 * @example
 * ```typescript
 * import { TuffEvents } from '@talex-touch/utils/transport/events'
 *
 * await transport.send(TuffEvents.coreBox.ui.hide)
 * await transport.send(TuffEvents.storage.app.get, { key: 'theme' })
 * await transport.send(TuffEvents.clipboard.getLatest)
 * await transport.send(TuffEvents.metaOverlay.ui.show, { item, builtinActions: [] })
 * ```
 */
export const TuffEvents = {
  app: AppEvents,
  coreBox: CoreBoxEvents,
  storage: StorageEvents,
  plugin: PluginEvents,
  market: MarketEvents,
  permission: PermissionEvents,
  platform: PlatformEvents,
  agents: AgentsEvents,
  tray: TrayEvents,
  sentry: SentryEvents,
  boxItem: BoxItemEvents,
  clipboard: ClipboardEvents,
  metaOverlay: MetaOverlayEvents,
  flow: FlowEvents,
  divisionBox: DivisionBoxEvents,
} as const

// Export MetaOverlayEvents separately for convenience
export { MetaOverlayEvents }
