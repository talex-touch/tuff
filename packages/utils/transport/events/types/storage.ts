/**
 * @fileoverview Type definitions for Storage domain events
 * @module @talex-touch/utils/transport/events/types/storage
 */

// ============================================================================
// App Storage Types
// ============================================================================

/**
 * Request to get a storage value.
 */
export interface StorageGetRequest {
  /**
   * Storage key to retrieve.
   */
  key: string
}

/**
 * Versioned storage response payload.
 */
export interface StorageGetVersionedResponse {
  /**
   * Stored data.
   */
  data: unknown

  /**
   * Current version number.
   */
  version: number
}

/**
 * Request to set a storage value.
 */
export interface StorageSetRequest {
  /**
   * Storage key.
   */
  key: string

  /**
   * Value to store.
   */
  value: unknown
}

/**
 * Request to save a storage value with version tracking.
 */
export interface StorageSaveRequest {
  /**
   * Storage key.
   */
  key: string

  /**
   * Serialized JSON content.
   */
  content?: string

  /**
   * Raw value to serialize (fallback when content not provided).
   */
  value?: unknown

  /**
   * Clear stored data for the key.
   */
  clear?: boolean

  /**
   * Force save even if content is unchanged.
   */
  force?: boolean

  /**
   * Client version for conflict detection.
   */
  version?: number
}

/**
 * Result for versioned storage save.
 */
export interface StorageSaveResult {
  success: boolean
  version: number
  conflict?: boolean
}

/**
 * Request to delete a storage value.
 */
export interface StorageDeleteRequest {
  /**
   * Storage key to delete.
   */
  key: string
}

// ============================================================================
// Plugin Storage Types
// ============================================================================

/**
 * Request to get a plugin storage value.
 */
export interface PluginStorageGetRequest {
  /**
   * Plugin name.
   */
  pluginName: string

  /**
   * Storage key.
   */
  key: string
}

/**
 * Request to set a plugin storage value.
 */
export interface PluginStorageSetRequest {
  /**
   * Plugin name.
   */
  pluginName: string

  /**
   * Storage key.
   */
  key: string

  /**
   * Value to store.
   */
  value: unknown
}

/**
 * Request to delete a plugin storage value.
 */
export interface PluginStorageDeleteRequest {
  /**
   * Plugin name.
   */
  pluginName: string

  /**
   * Storage key to delete.
   */
  key: string
}

/**
 * Storage subscription notification.
 */
export interface StorageUpdateNotification {
  /**
   * Storage key that was updated.
   */
  key: string

  /**
   * New value (undefined if deleted).
   */
  value?: unknown

  /**
   * Version number if available.
   */
  version?: number

  /**
   * Update timestamp.
   */
  timestamp: number

  /**
   * Source of the update.
   */
  source?: 'local' | 'remote' | 'sync'
}

export interface StorageLegacyUpdatePayload {
  /**
   * Legacy storage key name.
   */
  name: string

  /**
   * Version number if available.
   */
  version?: number
}

/**
 * Plugin storage update notification.
 */
export interface PluginStorageUpdateNotification extends StorageUpdateNotification {
  /**
   * Plugin name.
   */
  pluginName: string
}
