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
 * Where the action panel sits inside the overlay.
 *
 * - `footer`: bottom-right, just above the CoreBox footer and its ⌘K hint.
 * - `corner`: the window's bottom-right corner, for plugin UI mode or when no footer is shown.
 */
export type MetaPanelAnchor = 'footer' | 'corner'

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

  /**
   * Where the panel is anchored. Omitted means `corner`.
   */
  anchor?: MetaPanelAnchor

  /**
   * Height in CSS pixels the panel needs for its actions, already capped at the panel's own
   * maximum. Main grows the CoreBox window only when its current height cannot fit the panel,
   * and restores it when the panel closes. Omitted means the window is left as it is.
   */
  desiredPanelHeight?: number
}

/**
 * Acknowledges that a show request was accepted by its next hop.
 *
 * The same event is used from CoreBox to main and from main to the overlay renderer; both legs
 * must answer so request-style transport calls do not remain pending until their timeout.
 */
export interface MetaShowResponse {
  accepted: boolean
}

/**
 * Acknowledges whether main accepted a renderer-ready signal for the current MetaOverlay view.
 */
export interface MetaRendererReadyResponse {
  accepted: boolean
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
