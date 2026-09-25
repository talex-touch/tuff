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
 * Why a storage save did not land, as reported by whoever detected it.
 *
 * The set is deliberately closed and specific: a single catch-all reason made "the request never
 * reached main because the event loop was busy" indistinguishable from "main looked at the write
 * and refused it", and the user-facing copy then blamed a storage service for a timeout.
 */
export type StorageSaveFailureReason =
  /** Main held a newer revision than the one this request carried. */
  | 'conflict'
  /** Main answered with an unsuccessful result and no more specific reason. */
  | 'rejected'
  /** The request never reached main; the send rejected or timed out. */
  | 'transport'
  /** Main rejected the request because its key was missing or not a string. */
  | 'invalid-key'
  /** Main's credential gate refused to persist a payload carrying a plaintext credential. */
  | 'credential-rejected'
  /** Main accepted the value but the durable backend write failed. */
  | 'persist-failed'

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
  reason?: StorageSaveFailureReason
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
