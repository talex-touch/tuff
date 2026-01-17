/**
 * @fileoverview Type definitions for Plugin domain events
 * @module @talex-touch/utils/transport/events/types/plugin
 */

// ============================================================================
// Plugin Lifecycle Types
// ============================================================================

/**
 * Plugin status enumeration.
 */
// ============================================================================
// Plugin Management (Renderer/Main) Types
// ============================================================================

import type { ITouchPlugin } from '../../../plugin'
import type {
  PluginInstallConfirmRequest,
  PluginInstallConfirmResponse,
  PluginInstallProgressEvent,
} from '../../../plugin/install'
import type { PluginInstallRequest } from '../../../plugin/providers/types'
import type {
  InputChangedRequest,
  PluginFilters,
  PluginStateEvent,
  TriggerFeatureRequest,
} from '../../../plugin/sdk/types'

export enum PluginStatus {
  /**
   * Plugin is not loaded.
   */
  UNLOADED = 'unloaded',

  /**
   * Plugin is currently loading.
   */
  LOADING = 'loading',

  /**
   * Plugin is loaded and active.
   */
  ACTIVE = 'active',

  /**
   * Plugin is loaded but disabled.
   */
  DISABLED = 'disabled',

  /**
   * Plugin encountered an error.
   */
  ERROR = 'error',
}

/**
 * Request to load a plugin.
 */
export interface PluginLoadRequest {
  /**
   * Plugin name to load.
   */
  name: string
}

/**
 * Request to unload a plugin.
 */
export interface PluginUnloadRequest {
  /**
   * Plugin name to unload.
   */
  name: string
}

/**
 * Request to reload a plugin.
 */
export interface PluginReloadRequest {
  /**
   * Plugin name to reload.
   */
  name: string
}

/**
 * Request to enable a plugin.
 */
export interface PluginEnableRequest {
  /**
   * Plugin name to enable.
   */
  name: string
}

/**
 * Request to disable a plugin.
 */
export interface PluginDisableRequest {
  /**
   * Plugin name to disable.
   */
  name: string
}

/**
 * Plugin information returned after lifecycle operations.
 */
export interface PluginInfo {
  /**
   * Plugin name (unique identifier).
   */
  name: string

  /**
   * Plugin version.
   */
  version: string

  /**
   * Current plugin status.
   */
  status: PluginStatus

  /**
   * Display name.
   */
  displayName?: string

  /**
   * Plugin description.
   */
  description?: string

  /**
   * Plugin author.
   */
  author?: string

  /**
   * Plugin icon.
   */
  icon?: string

  /**
   * Whether this is a dev mode plugin.
   */
  isDev?: boolean

  /**
   * Plugin path on disk.
   */
  path?: string

  /**
   * Error message if status is ERROR.
   */
  error?: string
}

// ============================================================================
// Feature Types
// ============================================================================

/**
 * Request to trigger a plugin feature.
 */
export interface FeatureTriggerRequest {
  /**
   * Plugin name.
   */
  pluginName: string

  /**
   * Feature ID to trigger.
   */
  featureId: string

  /**
   * Query/input for the feature.
   */
  query?: unknown

  /**
   * Additional context.
   */
  context?: Record<string, unknown>
}

/**
 * Response from feature trigger.
 */
export interface FeatureTriggerResponse {
  /**
   * Whether the feature was triggered successfully.
   */
  success: boolean

  /**
   * Result data from the feature.
   */
  data?: unknown

  /**
   * Error message if not successful.
   */
  error?: string
}

// ============================================================================
// Log Types
// ============================================================================

/**
 * Log level enumeration.
 */
export enum PluginLogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Plugin log entry.
 */
export interface PluginLogEntry {
  /**
   * Plugin name that generated this log.
   */
  pluginName: string

  /**
   * Log level.
   */
  level: PluginLogLevel

  /**
   * Log message.
   */
  message: string

  /**
   * Timestamp when log was created.
   */
  timestamp: number

  /**
   * Additional data.
   */
  data?: unknown

  /**
   * Stack trace (for errors).
   */
  stack?: string
}

// ============================================================================
// Message Transport Types
// ============================================================================

/**
 * Plugin message for inter-plugin or plugin-main communication.
 */
export interface PluginMessage {
  /**
   * Source plugin name.
   */
  from: string

  /**
   * Target plugin name (or '*' for broadcast).
   */
  to: string

  /**
   * Message type/event name.
   */
  type: string

  /**
   * Message payload.
   */
  payload?: unknown

  /**
   * Message ID for request-response correlation.
   */
  messageId?: string

  /**
   * Whether this is a response to a previous message.
   */
  isResponse?: boolean
}

/**
 * Response to a plugin message.
 */
export interface PluginMessageResponse {
  /**
   * Whether the message was delivered.
   */
  delivered: boolean

  /**
   * Response data (if synchronous).
   */
  data?: unknown

  /**
   * Error if delivery failed.
   */
  error?: string
}

export interface PluginApiListRequest {
  filters?: PluginFilters
}

export type PluginApiListResponse = ITouchPlugin[]

export interface PluginApiGetRequest {
  name: string
}

export type PluginApiGetResponse = ITouchPlugin | null

export interface PluginApiGetStatusRequest {
  name: string
}

export type PluginApiGetStatusResponse = number

export interface PluginApiOperationRequest {
  name: string
}

export interface PluginApiOperationResponse {
  success: boolean
  error?: string
}

export type PluginApiInstallRequest = PluginInstallRequest
export type PluginApiInstallResponse = PluginApiOperationResponse

export type PluginApiUninstallRequest = PluginApiOperationRequest
export type PluginApiUninstallResponse = PluginApiOperationResponse

export type PluginApiTriggerFeatureRequest = TriggerFeatureRequest
export type PluginApiTriggerFeatureResponse = unknown

export type PluginApiFeatureInputChangedRequest = InputChangedRequest

export interface PluginApiOpenFolderRequest {
  name: string
}

export interface PluginApiGetOfficialListRequest {
  force?: boolean
}

export interface PluginApiGetOfficialListResponse {
  plugins: unknown[]
}

export interface PluginApiGetManifestRequest {
  name: string
}

export type PluginApiGetManifestResponse = Record<string, unknown> | null

export interface PluginApiSaveManifestRequest {
  name: string
  manifest: Record<string, unknown>
  reload?: boolean
}

export interface PluginApiSaveManifestResponse {
  success: boolean
  error?: string
}

export interface PluginApiGetPathsRequest {
  name: string
}

export interface PluginApiGetPathsResponse {
  pluginPath: string
  dataPath: string
  configPath: string
  logsPath: string
  tempPath: string
}

export interface PluginApiOpenPathRequest {
  name: string
  pathType: 'plugin' | 'data' | 'config' | 'logs' | 'temp'
}

export interface PluginApiOpenPathResponse {
  success: boolean
  path?: string
  error?: string
}

export interface PluginApiGetPerformanceRequest {
  name: string
}

export type PluginApiGetPerformanceResponse = unknown

export interface PluginApiGetRuntimeStatsRequest {
  name: string
}

export type PluginApiGetRuntimeStatsResponse = unknown

export interface PluginReconnectDevServerRequest {
  pluginName: string
}

export interface PluginReconnectDevServerResponse {
  success: boolean
  error?: string
}

export type PluginPushStateChangedPayload = PluginStateEvent

export interface PluginPushStatusUpdatedPayload {
  plugin: string
  status: number
}

export interface PluginPushReloadReadmePayload {
  source?: string
  plugin: string
  readme: string
}

export interface PluginPushCrashedPayload {
  plugin?: string
  message?: string
  stack?: string
  [key: string]: unknown
}

export type PluginInstallProgressPayload = PluginInstallProgressEvent
export type PluginInstallConfirmPayload = PluginInstallConfirmRequest
export type PluginInstallConfirmResponsePayload = PluginInstallConfirmResponse

export interface PluginInstallSourceRequest {
  source: string
  hintType?: unknown
  metadata?: Record<string, unknown>
  clientMetadata?: Record<string, unknown>
}

export interface PluginInstallSourceResponse {
  status: 'success' | 'error'
  manifest?: unknown
  provider?: unknown
  official?: boolean
  message?: string
  error?: string
}

export interface PluginStorageOpenInEditorRequest {
  pluginName: string
}

export interface PluginDevServerStatusRequest {
  pluginName: string
}

export interface PluginDevServerStatusResponse {
  monitoring: boolean
  connected: boolean
  error?: string
}

export interface PluginPushReloadPayload {
  source?: string
  plugin: unknown
}

export interface PluginStorageFileRequest {
  pluginName: string
  fileName: string
}

export interface PluginStorageSetFileRequest extends PluginStorageFileRequest {
  content: unknown
}

export interface PluginStorageListFilesRequest {
  pluginName: string
}

export interface PluginStorageStatsRequest {
  pluginName: string
}

export interface PluginStorageTreeRequest {
  pluginName: string
}

export interface PluginStorageFileDetailsRequest extends PluginStorageFileRequest {}

export interface PluginStorageClearRequest {
  pluginName: string
}

export interface PluginStorageOpenFolderRequest {
  pluginName: string
}

export interface PluginStorageUpdatePayload {
  name: string
  fileName?: string
}

export type PluginPerformanceGetMetricsResponse = unknown

export type PluginPerformanceGetPathsResponse = PluginApiGetPathsResponse
