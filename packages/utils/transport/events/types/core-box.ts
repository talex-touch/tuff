/**
 * @fileoverview Type definitions for CoreBox domain events
 * @module @talex-touch/utils/transport/events/types/core-box
 */

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

// ============================================================================
// Search Types
// ============================================================================

/**
 * Input type for Tuff queries.
 */
export enum TuffInputType {
  Text = 0,
  Image = 1,
  Files = 2,
  Html = 3,
}

/**
 * Input item in a Tuff query.
 */
export interface TuffInput {
  /**
   * Type of input.
   */
  type: TuffInputType

  /**
   * Input content (format depends on type).
   */
  content: string
}

/**
 * Query object for CoreBox search.
 */
export interface TuffQuery {
  /**
   * Text query string.
   */
  text: string

  /**
   * Additional inputs (clipboard data, etc.).
   */
  inputs?: TuffInput[]
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
  type: 'url' | 'file' | 'emoji' | 'svg' | 'component'

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

/**
 * Complete search result from CoreBox.
 */
export interface TuffSearchResult {
  /**
   * Search result items.
   */
  items: TuffSearchResultItem[]

  /**
   * Active provider IDs.
   */
  providers: string[]

  /**
   * Container layout configuration.
   */
  containerLayout?: TuffContainerLayout

  /**
   * Search ID for cancellation.
   */
  searchId?: string

  /**
   * Whether more results are available.
   */
  hasMore?: boolean
}

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
