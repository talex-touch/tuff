/**
 * Recommendation sources in the order their sections are rendered in the
 * CoreBox empty state.
 *
 * This array is the single source of truth for both the `RecommendationSource`
 * union and the section ordering: the main process groups by it, the renderer
 * renders in it. Three separate copies of this union used to drift apart (one
 * here, one in `TuffItem.meta.recommendation`, one on the engine's
 * `CandidateItem`), each missing a different member.
 *
 * Ordering rationale: the more certain the signal, the earlier it appears.
 * Explicit user intent (`pinned`) first, then observed behaviour
 * (`frequent` / `time-based` / `recent`), then inference (`trending` /
 * `cold-start`) last.
 */
export const RECOMMENDATION_SECTION_ORDER = [
  /** Explicitly pinned by the user */
  'pinned',
  /** High lifetime execute count */
  'frequent',
  /** Usually used around the current hour */
  'time-based',
  /** Executed recently */
  'recent',
  /** Installed within the novelty window and never executed yet */
  'newly-installed',
  /** Matched against the current context signal (currently clipboard URLs only) */
  'context',
  /** Supplied by a plugin recommend provider */
  'plugin',
  /** Rising usage across the recent window */
  'trending',
  /** Catalog ordering used when there is no usage history at all */
  'cold-start'
] as const

/** A recommendation source. Derived from {@link RECOMMENDATION_SECTION_ORDER}. */
export type RecommendationSource = (typeof RECOMMENDATION_SECTION_ORDER)[number]

/**
 * Items shown per reason section in the empty state.
 *
 * Deliberately small: the point of grouping is that a user can read the reasons
 * at a glance. Nine sections of ten items is just the old undifferentiated grid
 * with headers in it.
 */
export const RECOMMENDATION_SECTION_ITEM_LIMIT = 3

/**
 * Human-explainable evidence behind a recommendation, used to render a short
 * reason next to the item ("used 23 times this week", "usually around 09-11").
 *
 * Every field is optional and is only present when the backing data actually
 * exists. Neither producer nor consumer may substitute a default: an absent
 * field means "we don't know", and the UI must then render nothing rather than
 * a fabricated reason.
 */
export interface RecommendationEvidence {
  /** Lifetime execute count from `item_usage_stats.execute_count` */
  executeCount?: number
  /** Epoch ms of the last execution */
  lastExecutedAt?: number
  /** Epoch ms the item was installed */
  installedAt?: number
  /**
   * Hours of day this item clusters around, derived from
   * `item_time_stats.hour_distribution`. Both bounds inclusive, 0-23, and the
   * range may wrap past midnight (e.g. `{ startHour: 22, endHour: 0 }`).
   */
  peakHourRange?: { startHour: number; endHour: number }
}

/**
 * Time-based usage pattern context for recommendation matching.
 */
export interface TimePattern {
  /** Hour of day (0-23) */
  hourOfDay: number
  /** Day of week (0-6, 0=Sunday) */
  dayOfWeek: number
  /** Whether current time falls within working hours (9-18, weekdays) */
  isWorkingHours: boolean
  /** Broad time categorization */
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night'
}

/**
 * Complete contextual signal for recommendation matching.
 * Gathered from system state, clipboard, and active applications.
 */
export interface ContextSignal {
  time: TimePattern
  clipboard?: {
    type: string
    /** Hashed content for privacy (not original text) */
    content: string
    timestamp: number
    contentType?: 'url' | 'text' | 'code' | 'file'
    meta?: {
      isUrl?: boolean
      urlDomain?: string
      textLength?: number
      fileExtension?: string
      fileType?: 'code' | 'text' | 'image' | 'document' | 'other'
      language?: string
    }
  }
  /**
   * Latest captured text selection, same privacy tier as `clipboard`:
   * content is hashed, only shape metadata travels.
   */
  selection?: {
    /** Hashed content for privacy (not original text) */
    content: string
    timestamp: number
    contentType?: 'url' | 'text' | 'code' | 'file'
    meta?: {
      isUrl?: boolean
      urlDomain?: string
      textLength?: number
      fileExtension?: string
      fileType?: 'code' | 'text' | 'image' | 'document' | 'other'
      language?: string
    }
  }
  foregroundApp?: {
    bundleId: string
    name: string
  }
  systemState?: {
    isOnline: boolean
    networkType?: 'offline' | 'wired' | 'wifi' | 'cellular' | 'unknown'
    networkIdHash?: string
    batteryLevel?: number
    isCharging?: boolean
    isOnBattery?: boolean
    isDNDEnabled: boolean
    focusMode?: 'active' | 'inactive' | 'unknown'
    powerMode?: 'charging' | 'battery' | 'unknown'
    locationBucket?: string
    timezone?: string
    /** True within 48h of the system timezone changing (travel signal) */
    timezoneChanged?: boolean
    unavailableSignals?: string[]
  }
}

/**
 * Scored recommendation item from recommendation engine.
 */
export interface ScoredItem {
  sourceId: string
  itemId: string
  score: number
  source: RecommendationSource
  reason?: string
}

/**
 * Candidate item returned by a plugin recommend provider.
 * Unlike internal candidates, these do not require usageStats.
 */
export interface PluginRecommendCandidate {
  /** Provider ID (auto-filled from provider.id) */
  providerId?: string
  /** Unique item ID */
  id: string
  /** Display title */
  title: string
  /** Subtitle / description */
  subtitle?: string
  /** Icon configuration */
  icon?: { type: string; value: string }
  /** Priority 0-100, higher = more prominent */
  priority?: number
  /** Action key passed back to the plugin */
  action: string
  /** Additional data */
  data?: Record<string, unknown>
}

/**
 * Provider interface for plugins to supply custom recommendations.
 */
export interface RecommendProvider {
  /** Unique provider ID */
  id: string
  /** Display name */
  name: string
  /** Whether this provider can supply recommendations for the given context */
  canProvide(context: ContextSignal): boolean
  /** Return recommendation candidates */
  getCandidates(context: ContextSignal): PluginRecommendCandidate[] | Promise<PluginRecommendCandidate[]>
}

/**
 * Recommendation badge display configuration for UI rendering.
 */
export interface RecommendationBadge {
  text: string
  icon: string
  /**
   * Styling bucket, deliberately coarser than {@link RecommendationSource}:
   * several inferred sources share the `intelligent` look.
   */
  variant:
    | 'frequent'
    | 'intelligent'
    | 'recent'
    | 'trending'
    | 'newly-installed'
    | 'plugin'
    | 'pinned'
}

/**
 * Enhanced item metadata for intelligent recommendations.
 * Attached to TuffItem.meta for rendering and filtering.
 */
export interface RecommendationMetadata {
  score: number
  source: RecommendationSource
  reason: string
  isIntelligent: boolean
  badge: RecommendationBadge
  evidence?: RecommendationEvidence
}
