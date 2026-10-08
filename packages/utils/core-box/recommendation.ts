import type { IExecuteArgs } from './tuff/tuff-dsl'

/**
 * The single vocabulary for recommendation reasons. Display position is decided
 * by the unified ranking, not by the order of reasons in this array.
 */
export const RECOMMENDATION_SECTION_ORDER = [
  /** Explicitly pinned by the user */
  'pinned',
  /** Sustained, dated executions across distinct days */
  'frequent',
  /** Usually used around the current hour */
  'time-based',
  /** Executed recently */
  'recent',
  /** Installed within the novelty window and never executed yet */
  'newly-installed',
  /** A file that appeared on disk within the novelty window and has not been opened yet */
  'newly-added',
  /** Matched against the current context signal (currently clipboard URLs only) */
  'context',
  /** Supplied by a plugin recommend provider */
  'plugin',
  /** Rising usage across the recent window */
  'trending',
  /** Catalog ordering used when there is no usage history at all */
  'cold-start',
  /** Accepted executions around the same local time yesterday */
  'yesterday',
  /** Personal target preference when arriving from the current source app */
  'app-context'
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
  /** Accepted executions in yesterday's local-calendar +/- one-hour window. */
  yesterday?: {
    lastExecutedAt: number
    executeCount: number
  }
  /** Dated source-app choices; all counts share the same trailing 30-day window. */
  sourceApp?: {
    bundleId: string
    name: string
    executeCount: number
    activeDays: number
    totalExecutions: number
    baselineExecuteCount: number
    baselineTotalExecutions: number
    /** Joint source-app/time evidence, never assembled from separate marginal counts. */
    timeWindow?: {
      startHour: number
      endHour: number
      executeCount: number
      activeDays: number
    }
  }
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
  /** False when the host's time-context source is disabled; no dated time suggestion may use it. */
  timeAvailable?: boolean
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
  canProvide(context: ContextSignal): boolean | Promise<boolean>
  /** Return recommendation candidates */
  getCandidates(context: ContextSignal): PluginRecommendCandidate[] | Promise<PluginRecommendCandidate[]>
  /**
   * Execute one of this provider's own candidates.
   *
   * Required: a candidate the host can render but no one can run is a dead row. The host calls
   * this with the candidate it produced from `getCandidates` (never a value the renderer supplied)
   * plus the search-context args, so a provider only ever acts on its own `action`/`data`.
   *
   * `false` or a thrown error means the action failed and the host does not count it; `true` or a
   * resolved `undefined` means the major action was accepted and the host counts it once.
   */
  onExecute(
    candidate: PluginRecommendCandidate,
    args: IExecuteArgs
  ): boolean | void | Promise<boolean | void>
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
    | 'newly-added'
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
