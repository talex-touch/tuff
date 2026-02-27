/**
 * @fileoverview Type definitions for MetaOverlay domain events
 * @module @talex-touch/utils/transport/events/types/meta-overlay
 */

import type { TuffItem, TuffQuickAction, TuffQuickActionRender } from '../../../core-box/tuff/tuff-dsl'

// ============================================================================
// MetaAction Types
// ============================================================================

export type MetaActionRender = TuffQuickActionRender
export type MetaAction = TuffQuickAction

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Request to show MetaOverlay
 */
export interface MetaShowRequest {
  /**
   * Current selected item
   */
  item: TuffItem

  /**
   * Built-in actions (fixed/copy/display/transfer)
   */
  builtinActions: MetaAction[]

  /**
   * Item-specific actions (from item.actions)
   */
  itemActions?: MetaAction[]

  /**
   * Plugin-registered global actions
   */
  pluginActions?: MetaAction[]
}

/**
 * Request to execute an action
 */
export interface MetaActionExecuteRequest {
  /**
   * Action ID to execute
   */
  actionId: string

  /**
   * Item ID context
   */
  itemId: string

  /**
   * Optional full item context payload.
   * CoreBox currently sends it to avoid item lookup races in main process.
   */
  item?: TuffItem
}

/**
 * Response from action execution
 */
export interface MetaActionExecuteResponse {
  /**
   * Whether execution succeeded
   */
  success: boolean

  /**
   * Error message if failed
   */
  error?: string
}

/**
 * Request to register a plugin action
 */
export interface MetaRegisterActionRequest {
  /**
   * Plugin ID
   */
  pluginId: string

  /**
   * Action to register
   */
  action: MetaAction
}

/**
 * Request to unregister plugin actions
 */
export interface MetaUnregisterActionsRequest {
  /**
   * Plugin ID
   */
  pluginId: string

  /**
   * Optional action ID.
   * If omitted, unregister all actions for the plugin.
   */
  actionId?: string
}

/**
 * Response from visibility check
 */
export interface MetaVisibilityResponse {
  /**
   * Whether MetaOverlay is visible
   */
  visible: boolean
}
