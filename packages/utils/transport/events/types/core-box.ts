/**
 * @fileoverview Type definitions for CoreBox domain events
 * @module @talex-touch/utils/transport/events/types/core-box
 */

import type { IProviderActivate, TuffItem, TuffQuery, TuffQueryInput } from '../../../core-box/tuff/tuff-dsl'

// ============================================================================
// UI Types
// ============================================================================

/**
 * Options for expanding CoreBox.
 */
export interface ExpandOptions {
  /**
   * Expansion mode.
   * - 'collapse' - Shrink to minimum size
   * - 'max' - Expand to maximum size
   */
  mode?: 'collapse' | 'max'

  /**
   * Target height/length in pixels.
   * Only used if mode is not specified.
   */
  length?: number
}

/**
 * Layout update payload from renderer to main process.
 *
 * @remarks
 * This is designed to be high-frequency (e.g. ResizeObserver). The main process
 * should coalesce updates and decide the final window bounds.
 */
export interface CoreBoxLayoutUpdateRequest {
  /**
   * Desired CoreBox window height (px).
   */
  height: number

  /**
   * Current rendered item count.
   */
  resultCount: number

  /**
   * Whether CoreBox is currently loading results.
   */
  loading: boolean

  /**
   * Whether recommendation query is pending (empty input state).
   */
  recommendationPending: boolean

  /**
   * Current provider activation count (plugin UI / activation mode).
   */
  activationCount: number

  /**
   * Optional debug source tag.
   */
  source?: string
}

/**
 * Response from focus window operation.
 */
export interface FocusWindowResponse {
  /**
   * Whether the window was successfully focused.
   */
  focused: boolean
}

/**
 * Request to set input visibility.
 */
export interface SetInputVisibilityRequest {
  /**
   * Whether input should be visible.
   */
  visible: boolean
}

/**
 * UI view state for CoreBox.
 */
export interface CoreBoxUIViewStateResponse {
  /**
   * Whether a UI view is currently attached.
   */
  isActive: boolean

  /**
   * Whether the UI view has focus.
   */
  isFocused: boolean

  /**
   * Whether CoreBox is in UI mode.
   */
  isUIMode: boolean
}

/**
 * Payload for CoreBox UI mode exit.
 */
export interface CoreBoxUIModeExitedPayload {
  /**
   * Whether renderer should reset input state.
   */
  resetInput?: boolean
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Input type for Tuff queries.
 */
export { TuffInputType } from '../../../core-box/tuff/tuff-dsl'

export type {
  IProviderActivate,
  TuffQueryInput as TuffInput,
  TuffQuery,
}

export interface CoreBoxSearchUpdatePayload {
  searchId: string
  items: TuffItem[]
}

export interface CoreBoxSearchEndPayload {
  searchId: string
  cancelled?: boolean
  activate?: unknown
  sources?: unknown[]
}

export interface CoreBoxNoResultsPayload {
  shouldShrink?: boolean
}

export interface CoreBoxClearItemsPayload {
  pluginName?: string
}

export interface CoreBoxExecuteRequest {
  item: unknown
  searchResult?: unknown
}

export interface CoreBoxTogglePinRequest {
  sourceId: string
  itemId: string
  sourceType: string
}

export interface CoreBoxTogglePinResponse {
  success: boolean
  isPinned?: boolean
  error?: string
}

/**
 * Single search result item.
 */
export interface TuffSearchResultItem {
  /**
   * Unique item ID.
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
   * Icon URL or data.
   */
  icon?: string | TuffIcon

  /**
   * Provider that generated this result.
   */
  provider: string

  /**
   * Relevance score (0-1).
   */
  score?: number

  /**
   * Additional metadata.
   */
  meta?: TuffMeta

  /**
   * Actions available for this item.
   */
  actions?: TuffAction[]
}

/**
 * Icon definition for search results.
 */
export interface TuffIcon {
  /**
   * Icon type.
   */
  type: 'url' | 'file' | 'emoji' | 'svg' | 'component' | 'class' | 'builtin'

  /**
   * Icon value (URL, path, emoji, etc.).
   */
  value: string

  /**
   * Background color.
   */
  background?: string
}

/**
 * Action definition for search results.
 */
export interface TuffAction {
  /**
   * Action ID.
   */
  id: string

  /**
   * Display label.
   */
  label: string

  /**
   * Keyboard shortcut.
   */
  shortcut?: string

  /**
   * Whether this is the default action.
   */
  isDefault?: boolean
}

/**
 * Metadata for search results.
 */
export interface TuffMeta {
  /**
   * Whether item is pinned.
   */
  pinned?: {
    isPinned: boolean
    pinnedAt?: number
    order?: number
  }

  /**
   * Recommendation source.
   */
  recommendation?: {
    source: 'frequent' | 'recent' | 'time-based' | 'trending' | 'pinned' | 'context'
    score?: number
  }

  /**
   * Additional metadata.
   */
  [key: string]: unknown
}

/**
 * Container layout configuration.
 */
export interface TuffContainerLayout {
  /**
   * Layout mode.
   */
  mode: 'list' | 'grid'

  /**
   * Grid configuration (only for grid mode).
   */
  grid?: {
    columns: number
    gap?: number
    itemSize?: 'small' | 'medium' | 'large'
  }

  /**
   * Section grouping.
   */
  sections?: TuffSection[]
}

/**
 * Section definition for grouped results.
 */
export interface TuffSection {
  /**
   * Section ID.
   */
  id: string

  /**
   * Section title.
   */
  title: string

  /**
   * Whether section is collapsed.
   */
  collapsed?: boolean
}

export type { TuffSearchResult } from '../../../core-box/tuff/tuff-dsl'

/**
 * Request to cancel a search.
 */
export interface CancelSearchRequest {
  /**
   * ID of the search to cancel.
   */
  searchId: string
}

/**
 * Response from cancel search.
 */
export interface CancelSearchResponse {
  /**
   * Whether cancellation succeeded.
   */
  cancelled: boolean
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * Response from get input operation.
 */
export interface GetInputResponse {
  /**
   * Current input value.
   */
  input: string
}

/**
 * Request to set input value.
 */
export interface SetInputRequest {
  /**
   * Value to set.
   */
  value: string
}

/**
 * Response from set input operation.
 */
export interface SetInputResponse {
  /**
   * Value that was set.
   */
  value: string
}

/**
 * Response from clear input operation.
 */
export interface ClearInputResponse {
  /**
   * Whether input was cleared.
   */
  cleared: boolean
}

/**
 * Input change payload from renderer.
 */
export interface CoreBoxInputChangeRequest {
  input?: string
  query?: TuffQuery
  source?: 'renderer' | 'initial' | 'ui-monitor'
}

/**
 * Serialized keyboard event data for IPC transport.
 */
export interface CoreBoxForwardKeyEvent {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
}

// ============================================================================
// Provider Types
// ============================================================================

/**
 * Request to deactivate a provider.
 */
export interface DeactivateProviderRequest {
  /**
   * Provider ID to deactivate.
   */
  id: string
}

/**
 * Activation state of providers.
 */
export interface ActivationState {
  /**
   * List of active provider IDs.
   */
  activeProviders: string[]
}

/**
 * Request to get provider details.
 */
export interface GetProviderDetailsRequest {
  /**
   * Provider IDs to query.
   */
  providerIds: string[]
}

/**
 * Provider detail information.
 */
export interface ProviderDetail {
  /**
   * Provider ID.
   */
  id: string

  /**
   * Provider display name.
   */
  name: string

  /**
   * Provider icon.
   */
  icon?: string | TuffIcon
}

// ============================================================================
// UI Mode Types
// ============================================================================

/**
 * Request to enter UI mode.
 */
export interface EnterUIModeRequest {
  /**
   * URL to load in UI mode.
   */
  url: string
}

// ============================================================================
// Clipboard Types
// ============================================================================

/**
 * Request to allow clipboard monitoring.
 */
export interface AllowClipboardRequest {
  /**
   * Bitmask of allowed clipboard types.
   */
  types: number
}

/**
 * Response from allow clipboard operation.
 */
export interface AllowClipboardResponse {
  /**
   * Whether clipboard monitoring is enabled.
   */
  enabled: boolean

  /**
   * Types that are now allowed.
   */
  types: number
}

// ============================================================================
// Input Monitoring Types
// ============================================================================

/**
 * Response from allow input monitoring operation.
 */
export interface AllowInputMonitoringResponse {
  /**
   * Whether input monitoring is enabled.
   */
  enabled: boolean
}
