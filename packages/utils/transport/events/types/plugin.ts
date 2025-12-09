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
