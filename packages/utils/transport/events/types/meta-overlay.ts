/**
 * @fileoverview Type definitions for MetaOverlay domain events
 * @module @talex-touch/utils/transport/events/types/meta-overlay
 */

import type { TuffItem } from '../../../core-box/tuff/tuff-dsl'
import type { ITuffIcon } from '../../../types/icon'

// ============================================================================
// MetaAction Types
// ============================================================================

/**
 * Simplified TuffRenderDSL for MetaOverlay actions.
 * Does not support widgets, only basic rendering.
 */
export interface MetaActionRender {
  /**
   * Basic information
   */
  basic: {
    /**
     * Action title
     */
    title: string

    /**
     * Optional subtitle/description
     */
    subtitle?: string

    /**
     * Optional icon
     */
    icon?: ITuffIcon
  }

  /**
   * Keyboard shortcut (optional)
   * e.g., '⌘C', '⌘⇧F', '⌘⇧D'
   */
  shortcut?: string

  /**
   * Group title (optional)
   * e.g., '列表', '操作'
   */
  group?: string

  /**
   * Whether action is disabled
   */
  disabled?: boolean

  /**
   * Whether this is a dangerous action (red color)
   */
  danger?: boolean
}

/**
 * Meta action definition
 */
export interface MetaAction {
  /**
   * Unique action ID
   */
  id: string

  /**
   * Render configuration
   */
  render: MetaActionRender

  /**
   * Handler identifier
   * - 'builtin': Built-in action (handled by main process)
   * - 'item': Item-specific action (from item.actions)
   * - plugin ID: Plugin-registered action
   */
  handler?: string

  /**
   * Priority for sorting (higher = top)
   * - Built-in actions: 0
   * - Item actions: 50
   * - Plugin actions: 100
   */
  priority?: number
}

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
