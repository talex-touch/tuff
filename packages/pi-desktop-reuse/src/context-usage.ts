// SPDX-License-Identifier: LGPL-3.0-only
//
// Copyright (C) vastsa and PI-Desktop contributors.
// Derived from vastsa/PI-Desktop @ 3b036cc7810e18b3ef7689a2b93385125a8d0a3f,
//   apps/desktop/src/lib/context-usage.ts
//
// Tuff adaptation (LGPL-3.0-only derivative): only the provider-usage reading
// is kept — `positiveTokenCount`, `usageTokenTotal` and
// `contextOccupancyTokens`, logic unchanged. Upstream's
// `DEFAULT_CONTEXT_WINDOW` fallback and the remaining-capacity math built on it
// are deliberately not carried: Tuff never presents a catalog or default window
// as the context a request actually occupies, so an unknown window stays
// unknown. The Home context panel calls these on the usage a provider reported
// for one request.

import type { MessageUsage } from './types/message-stream'

export type { MessageUsage } from './types/message-stream'

/** A finite, positive, rounded token count; anything else is `0`. */
export function positiveTokenCount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0
}

export function usageTokenTotal(usage: MessageUsage): number {
  const reportedTotal = positiveTokenCount(usage.totalTokens)
  if (reportedTotal > 0)
    return reportedTotal
  return positiveTokenCount(usage.inputTokens) + positiveTokenCount(usage.outputTokens)
}

/**
 * Occupancy of one model request, matching OpenCode's context widget:
 * `input + output + reasoning + cache.read + cache.write` on that request.
 * Cache reads from earlier tool-loop calls are not occupancy.
 */
export function contextOccupancyTokens(usage: MessageUsage): number {
  const occupancy
    = positiveTokenCount(usage.inputTokens)
      + positiveTokenCount(usage.outputTokens)
      + positiveTokenCount(usage.reasoningTokens)
      + positiveTokenCount(usage.cacheReadTokens)
      + positiveTokenCount(usage.cacheWriteTokens)
  return occupancy > 0 ? occupancy : usageTokenTotal(usage)
}
