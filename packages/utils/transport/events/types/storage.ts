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
   * Persist the accepted value to the active storage backend before replying.
   * Use for lifecycle gates that must survive an immediate process exit.
   */
  persist?: boolean

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
  /**
   * Why the save failed, for callers that surface it to the user.
   *
   * `transport` means the request never reached main (send rejected). Without it a failed
   * lifecycle write — onboarding completion is the one that matters — is indistinguishable from a
   * version conflict at the call site, and the renderer's own logs do not reach the main log.
   */
  reason?: 'conflict' | 'rejected' | 'transport'
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

/**
 * Plugin storage update notification.
 */
export interface PluginStorageUpdateNotification extends StorageUpdateNotification {
  /**
   * Plugin name.
   */
  pluginName: string
}

/**
 * Options for clearing the file index.
 *
 * Mirrors `CleanupFileIndexOptions` in the main-process service; the storage view already sends
 * this shape, and typing it here is what lets the transport check the two agree (#527).
 */
export interface StorageCleanupFileIndexRequest {
  includeEmbeddings?: boolean
  clearSearchIndex?: boolean
  rebuild?: boolean
}

/** Options for clearing download bookkeeping. Omitting `beforeDays` clears everything. */
export interface StorageCleanupDownloadsRequest {
  beforeDays?: number
}

/**
 * What a cleanup reports back.
 *
 * `removedCount` is optional because not every domain can count what it deleted, and the view
 * renders the detail only when it is present.
 */
export interface StorageCleanupResponse {
  success: boolean
  removedCount?: number
  error?: string
}
