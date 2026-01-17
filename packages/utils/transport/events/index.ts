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
  TrackDurationPayload,
  TrackEventPayload,
} from './types/app'

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
  DownloadGetTaskStatusResponse,
  DownloadGetTasksByStatusRequest,
  DownloadGetTasksResponse,
  DownloadGetTempStatsResponse,
  DownloadGetStatsResponse,
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
// App Events
// ============================================================================

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
// CoreBox Events
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
// Storage Events
// ============================================================================

import type {
  ActivationState,
  AllowClipboardRequest,
  AllowClipboardResponse,
  AllowInputMonitoringResponse,
  CancelSearchRequest,
  CancelSearchResponse,
  ClearInputResponse,
  CoreBoxLayoutUpdateRequest,
  DeactivateProviderRequest,
  EnterUIModeRequest,
  ExpandOptions,
  FocusWindowResponse,
  GetInputResponse,
  GetProviderDetailsRequest,
  ProviderDetail,
  SetInputRequest,
  SetInputResponse,
  SetInputVisibilityRequest,
  TuffQuery,
  TuffSearchResult,
} from './types/core-box'

// ============================================================================
// Plugin Events
// ============================================================================

import type {
  FeatureTriggerRequest,
  FeatureTriggerResponse,
  PluginDisableRequest,
  PluginEnableRequest,
  PluginInfo,
  PluginLoadRequest,
  PluginLogEntry,
  PluginReloadRequest,
  PluginUnloadRequest,
} from './types/plugin'

// ============================================================================
// BoxItem Events
// ============================================================================

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
  FlowAcknowledgeRequest,
  FlowAcknowledgeResponse,
  FlowCancelResponse,
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

import type {
  DivisionBoxCloseRequest,
  DivisionBoxCloseResponse,
  DivisionBoxFlowTriggerRequest,
  DivisionBoxFlowTriggerResponse,
  DivisionBoxGetActiveSessionsRequest,
  DivisionBoxGetActiveSessionsResponse,
  DivisionBoxGetWindowStateRequest,
  DivisionBoxGetWindowStateResponse,
  DivisionBoxGetStateRequest,
  DivisionBoxGetStateResponse,
  DivisionBoxInputChangeRequest,
  DivisionBoxInputChangeResponse,
  DivisionBoxOpenRequest,
  DivisionBoxOpenResponse,
  DivisionBoxSetOpacityRequest,
  DivisionBoxSetOpacityResponse,
  DivisionBoxSessionDestroyedPayload,
  DivisionBoxStateChangedPayload,
  DivisionBoxToggleDevToolsRequest,
  DivisionBoxToggleDevToolsResponse,
  DivisionBoxTogglePinRequest,
  DivisionBoxTogglePinResponse,
  DivisionBoxUpdateStateRequest,
  DivisionBoxUpdateStateResponse,
} from './types/division-box'

// ============================================================================
// Clipboard Events
// ============================================================================

import { defineEvent } from '../event/builder'

// ============================================================================
// MetaOverlay Events
// ============================================================================

import { MetaOverlayEvents } from './meta-overlay'

// ============================================================================
// File Index Events
// ============================================================================

import type {
  FileIndexBatteryStatus,
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult,
  FileIndexStats,
  FileIndexStatus,
} from './types/file-index'

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
     * Read a local file as text.
     */
    readFile: defineEvent('app')
      .module('system')
      .event('read-file')
      .define<ReadFileRequest, string>(),
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
    .define<{ sessionId: string; _sdkapi?: number }, FlowCancelResponse>(),

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
    show: defineEvent('core-box')
      .module('ui')
      .event('show')
      .define<void, void>(),

    /**
     * Hide the CoreBox window.
     */
    hide: defineEvent('core-box')
      .module('ui')
      .event('hide')
      .define<void, void>(),

    /**
     * Expand or collapse the CoreBox.
     */
    expand: defineEvent('core-box')
      .module('ui')
      .event('expand')
      .define<ExpandOptions | number, void>(),

    /**
     * Focus the CoreBox window.
     */
    focusWindow: defineEvent('core-box')
      .module('ui')
      .event('focus-window')
      .define<void, FocusWindowResponse>(),
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
    query: defineEvent('core-box')
      .module('search')
      .event('query')
      .define<{ query: TuffQuery }, TuffSearchResult>({
        stream: { enabled: true, bufferSize: 100 },
      }),

    /**
     * Cancel an in-progress search.
     */
    cancel: defineEvent('core-box')
      .module('search')
      .event('cancel')
      .define<CancelSearchRequest, CancelSearchResponse>(),
  },

  /**
   * Input field events.
   */
  input: {
    /**
     * Get current input value.
     */
    get: defineEvent('core-box')
      .module('input')
      .event('get')
      .define<void, GetInputResponse>(),

    /**
     * Set input value.
     */
    set: defineEvent('core-box')
      .module('input')
      .event('set')
      .define<SetInputRequest, SetInputResponse>(),

    /**
     * Clear input value.
     */
    clear: defineEvent('core-box')
      .module('input')
      .event('clear')
      .define<void, ClearInputResponse>(),

    /**
     * Set input visibility.
     */
    setVisibility: defineEvent('core-box')
      .module('input')
      .event('set-visibility')
      .define<SetInputVisibilityRequest, void>(),

    /**
     * Request input value from renderer.
     */
    requestValue: defineEvent('core-box')
      .module('input')
      .event('request-value')
      .define<void, GetInputResponse>(),

    /**
     * Set query from main process.
     */
    setQuery: defineEvent('core-box')
      .module('input')
      .event('set-query')
      .define<SetInputRequest, void>(),
  },

  /**
   * Provider management events.
   */
  provider: {
    /**
     * Deactivate a specific provider.
     */
    deactivate: defineEvent('core-box')
      .module('provider')
      .event('deactivate')
      .define<DeactivateProviderRequest, ActivationState>(),

    /**
     * Deactivate all providers.
     */
    deactivateAll: defineEvent('core-box')
      .module('provider')
      .event('deactivate-all')
      .define<void, ActivationState>(),

    /**
     * Get details for multiple providers.
     *
     * @remarks
     * This event supports batching for efficiency.
     */
    getDetails: defineEvent('core-box')
      .module('provider')
      .event('get-details')
      .define<GetProviderDetailsRequest, ProviderDetail[]>({
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
    enter: defineEvent('core-box')
      .module('ui-mode')
      .event('enter')
      .define<EnterUIModeRequest, void>(),

    /**
     * Exit plugin UI mode.
     */
    exit: defineEvent('core-box')
      .module('ui-mode')
      .event('exit')
      .define<void, void>(),
  },

  /**
   * Clipboard monitoring events.
   */
  clipboard: {
    /**
     * Allow clipboard monitoring for specific types.
     */
    allow: defineEvent('core-box')
      .module('clipboard')
      .event('allow')
      .define<AllowClipboardRequest, AllowClipboardResponse>(),
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
  boxItem: BoxItemEvents,
  clipboard: ClipboardEvents,
  metaOverlay: MetaOverlayEvents,
  flow: FlowEvents,
  divisionBox: DivisionBoxEvents,
} as const

// Export MetaOverlayEvents separately for convenience
export { MetaOverlayEvents }
