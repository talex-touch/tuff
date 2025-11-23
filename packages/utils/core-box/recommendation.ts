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
  foregroundApp?: {
    bundleId: string
    name: string
  }
  systemState?: {
    isOnline: boolean
    batteryLevel: number
    isDNDEnabled: boolean
  }
}

/**
 * Scored recommendation item from recommendation engine.
 */
export interface ScoredItem {
  sourceId: string
  itemId: string
  score: number
  source: 'frequent' | 'time-based' | 'recent' | 'trending' | 'context'
  reason?: string
}

/**
 * Recommendation badge display configuration for UI rendering.
 */
export interface RecommendationBadge {
  text: string
  icon: string
  variant: 'frequent' | 'intelligent' | 'recent' | 'trending'
}

/**
 * Enhanced item metadata for intelligent recommendations.
 * Attached to TuffItem.meta for rendering and filtering.
 */
export interface RecommendationMetadata {
  score: number
  source: ScoredItem['source']
  reason: string
  isIntelligent: boolean
  badge: RecommendationBadge
}
