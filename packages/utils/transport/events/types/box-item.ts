/**
 * @fileoverview Type definitions for BoxItem domain events
 * @module @talex-touch/utils/transport/events/types/box-item
 */

import type { TuffAction, TuffIcon, TuffMeta } from './core-box'

// ============================================================================
// BoxItem Core Types
// ============================================================================

/**
 * BoxItem represents a searchable item in the CoreBox.
 */
export interface BoxItem {
  /**
   * Unique item ID (must be unique per source).
   */
  id: string

  /**
   * Display title.
   */
  title: string

  /**
   * Optional subtitle/description.
   */
  subtitle?: string

  /**
   * Item icon.
   */
  icon?: string | TuffIcon

  /**
   * Source identifier (usually plugin name).
   */
  source: string

  /**
   * Keywords for search matching.
   */
  keywords?: string[]

  /**
   * Relevance score hint (0-1).
   */
  score?: number

  /**
   * Item metadata.
   */
  meta?: TuffMeta

  /**
   * Available actions.
   */
  actions?: TuffAction[]

  /**
   * Custom data attached to this item.
   */
  data?: Record<string, unknown>

  /**
   * Creation timestamp.
   */
  createdAt?: number

  /**
   * Last update timestamp.
   */
  updatedAt?: number
}

// ============================================================================
// CRUD Types
// ============================================================================

/**
 * Request to create a BoxItem.
 */
export interface BoxItemCreateRequest {
  /**
   * Item to create (id may be auto-generated).
   */
  item: Omit<BoxItem, 'createdAt' | 'updatedAt'> & { id?: string }
}

/**
 * Request to update a BoxItem.
 */
export interface BoxItemUpdateRequest {
  /**
   * Item ID to update.
   */
  id: string

  /**
   * Fields to update.
   */
  updates: Partial<Omit<BoxItem, 'id' | 'source' | 'createdAt' | 'updatedAt'>>
}

/**
 * Request to upsert (create or update) a BoxItem.
 */
export interface BoxItemUpsertRequest {
  /**
   * Item to upsert.
   */
  item: BoxItem
}

/**
 * Request to delete a BoxItem.
 */
export interface BoxItemDeleteRequest {
  /**
   * Item ID to delete.
   */
  id: string
}

// ============================================================================
// Batch Types
// ============================================================================

/**
 * Request to batch upsert BoxItems.
 */
export interface BoxItemBatchUpsertRequest {
  /**
   * Items to upsert.
   */
  items: BoxItem[]
}

/**
 * Response from batch upsert.
 */
export interface BoxItemBatchUpsertResponse {
  /**
   * Successfully upserted items.
   */
  items: BoxItem[]

  /**
   * Number of items created.
   */
  created: number

  /**
   * Number of items updated.
   */
  updated: number
}

/**
 * Request to batch delete BoxItems.
 */
export interface BoxItemBatchDeleteRequest {
  /**
   * Item IDs to delete.
   */
  ids: string[]
}

/**
 * Response from batch delete.
 */
export interface BoxItemBatchDeleteResponse {
  /**
   * Number of items deleted.
   */
  deleted: number
}

/**
 * Request to clear BoxItems.
 */
export interface BoxItemClearRequest {
  /**
   * Source to clear (if not specified, clears all).
   */
  source?: string
}

/**
 * Response from clear operation.
 */
export interface BoxItemClearResponse {
  /**
   * Number of items cleared.
   */
  cleared: number
}

// ============================================================================
// Sync Types
// ============================================================================

/**
 * Response from sync request (stream of items).
 */
export interface BoxItemSyncResponse {
  /**
   * Items being synced.
   */
  items: BoxItem[]

  /**
   * Total count of items.
   */
  total: number

  /**
   * Whether this is the last batch.
   */
  done: boolean
}
