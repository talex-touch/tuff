/**
 * @fileoverview Type definitions for MetaOverlay domain events
 * @module @talex-touch/utils/transport/events/types/meta-overlay
 */

import type { TuffItem, TuffQuickAction, TuffQuickActionRender } from '../../../core-box/tuff/tuff-dsl'
import type { FlowTargetInfo } from '../../../types/flow'

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
 * The page the panel's card is showing.
 *
 * - `actions`: the action list, the page a ⌘K opens on.
 * - `flow`: the Flow targets for the item.
 * - `flow-confirm`: authorization and/or confirmation for the chosen Flow target.
 */
export type MetaPanelPage = 'actions' | 'flow' | 'flow-confirm'

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

  /**
   * The page the card opens on. Omitted means `actions`. `flow` opens straight on the Flow
   * targets, with no page to go back to: Esc closes the panel.
   */
  page?: 'actions' | 'flow'

  /**
   * The Flow targets for `page: 'flow'`, fetched by the sender beforehand so the panel opens sized
   * for them. Omitted means the overlay fetches them itself.
   */
  flowTargets?: FlowTargetInfo[]
}

/**
 * Sent by the overlay renderer to main when the card changes page, or when the page on screen
 * needs a different height (its targets arrived, a confirmation opened).
 */
export interface MetaPageChangeRequest {
  /** The page now on screen. */
  page: MetaPanelPage

  /**
   * Whether Esc goes back a page inside the card (`true`) or closes the panel (`false`). Main
   * leaves Esc to the overlay while it is `true`.
   */
  canGoBack: boolean

  /**
   * Height in CSS pixels the page needs, measured as `MetaShowRequest.desiredPanelHeight` is.
   * While the panel is open main only grows the window for it, never shrinks it. Omitted means
   * the window is left as it is.
   */
  desiredPanelHeight?: number
}

/**
 * The Flow target picked on the card's Flow page. It rides the transfer action back to the CoreBox
 * renderer, which builds the payload and dispatches it.
 *
 * The tokens are capabilities for this one dispatch: they are relayed in memory only and never
 * logged.
 */
export interface MetaFlowSelection {
  /** Full target ID (`pluginId.targetId`), as in `FlowTargetInfo.fullId`. */
  targetId: string

  /** Token `grantConsent` returned when the target needed authorization. */
  consentToken?: string

  /** Token `grantConsent` returned when the target confirms every dispatch. */
  confirmationToken?: string
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

  /**
   * The Flow target picked on the card's Flow page, sent with the transfer action
   * (`flow-transfer`). Main relays its known fields to the CoreBox renderer, and drops a malformed
   * one, or one sent with any other action.
   */
  flow?: MetaFlowSelection
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
