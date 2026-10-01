import type { TuffSource, UsageBehaviorFacts } from '@talex-touch/utils/core-box'
import { calculateBehaviorScore, isFrequentEligible } from '@talex-touch/utils/core-box'
import type { UsageBehaviorRow } from '../../../db/utils'

export type { UsageBehaviorRow }

export { isFrequentEligible }

/** Generate composite key for usage stats tracking */
export function generateUsageKey(source: TuffSource, itemId: string): string {
  return `${source.id}:${itemId}`
}

/** Parse composite key into sourceId and itemId */
export function parseUsageKey(key: string): { sourceId: string; itemId: string } {
  const parts = key.split(':')
  if (parts.length < 2) {
    throw new Error(`Invalid usage key format: ${key}`)
  }

  const sourceId = parts[0]
  const itemId = parts.slice(1).join(':')

  return { sourceId, itemId }
}

/** Batch generate usage keys for multiple items */
export function generateUsageKeys(items: Array<{ source: TuffSource; id: string }>): string[] {
  return items.map((item) => generateUsageKey(item.source, item.id))
}

/**
 * Behaviour facts as they cross into the renderer/search meta (`meta.usageStats`).
 *
 * Only present when the host actually derived them from dated executions. A missing 30-day field
 * means "we do not know", not zero: the caller degrades to the lifetime count rather than
 * fabricating a recent one.
 */
export interface UsageBehaviorMeta {
  executeCount?: number
  executeCount30?: number
  executeCount7?: number
  activeDays30?: number
  lastExecuted?: string | number | null
  lastExecutedAt?: number | null
  decayedExecuteScore30?: number
  hourDistribution30?: number[]
  dayOfWeekDistribution30?: number[]
  timeSlotDistribution30?: UsageBehaviorFacts['timeSlotDistribution30']
}

/**
 * Project a storage behaviour row onto the shared scoring facts.
 *
 * `UsageBehaviorRow` is defined and produced by the storage layer (`DbUtils.getUsageBehaviorBatch`)
 * and re-exported here; every 30-day field comes from dated, ledger-accepted executions only and is
 * never backfilled from the lifetime count.
 */
export function usageBehaviorRowToFacts(row: UsageBehaviorRow): UsageBehaviorFacts {
  return {
    executeCount: row.executeCount,
    executeCount30: row.executeCount30,
    executeCount7: row.executeCount7,
    activeDays30: row.activeDays30,
    lastExecutedAt: row.lastExecutedAt,
    decayedExecuteScore30: row.decayedExecuteScore30,
    hourDistribution30: row.hourDistribution30,
    dayOfWeekDistribution30: row.dayOfWeekDistribution30,
    timeSlotDistribution30: row.timeSlotDistribution30
  }
}

/**
 * Whether a row fell back to a synthesized zero history.
 *
 * `getUsageBehaviorBatch` returns one row per requested key, filling zeros for a key it has no
 * evidence for (see UsageStorage). A row is "no evidence" when neither the lifetime count nor the
 * 30-day count is positive; an item executed once long ago has `executeCount > 0` with
 * `executeCount30 === 0`, and must still count as having a history.
 */
export function isSparseUsageBehaviorRow(row: UsageBehaviorRow | undefined): boolean {
  if (!row) return true
  return row.executeCount <= 0 && row.executeCount30 <= 0
}

/**
 * Rebuild full behaviour facts from transport meta, or null when the dated evidence is absent.
 *
 * The 30-day fields are all-or-nothing: a caller that has counts but no dated distributions cannot
 * support a time claim, and inventing one would violate R9. `lastExecutedAt` is read from the
 * ledger-backed field only — the legacy `lastExecuted` string is a display value and may predate a
 * success check, so it must never be promoted into recency evidence.
 */
export function toBehaviorFacts(meta: UsageBehaviorMeta | undefined): UsageBehaviorFacts | null {
  if (!meta) return null
  const { executeCount30, executeCount7, activeDays30, decayedExecuteScore30 } = meta
  if (
    typeof executeCount30 !== 'number' ||
    typeof executeCount7 !== 'number' ||
    typeof activeDays30 !== 'number' ||
    typeof decayedExecuteScore30 !== 'number' ||
    !Array.isArray(meta.hourDistribution30) ||
    !Array.isArray(meta.dayOfWeekDistribution30) ||
    !meta.timeSlotDistribution30
  ) {
    return null
  }

  const lastExecutedAt =
    typeof meta.lastExecutedAt === 'number' && Number.isFinite(meta.lastExecutedAt)
      ? meta.lastExecutedAt
      : null

  return {
    executeCount: typeof meta.executeCount === 'number' ? meta.executeCount : executeCount30,
    executeCount30,
    executeCount7,
    activeDays30,
    lastExecutedAt,
    decayedExecuteScore30,
    hourDistribution30: meta.hourDistribution30,
    dayOfWeekDistribution30: meta.dayOfWeekDistribution30,
    timeSlotDistribution30: meta.timeSlotDistribution30
  }
}

/**
 * Frequency term for the typed-search sorter, on the same 0..100 scale as the empty state.
 *
 * Search results must never be boosted by exposure or penalised by cancels (R3), and must never
 * claim a habit the evidence does not support (R9): score is taken from the dated behaviour facts
 * alone, and an item without them — a legacy row carrying only a lifetime count, or a plugin item —
 * scores 0. The lifetime count stays for display; it is not frequency evidence.
 */
export function calculateSearchBehaviorScore(meta: UsageBehaviorMeta | undefined): number {
  const facts = toBehaviorFacts(meta)
  return facts ? calculateBehaviorScore(facts) : 0
}
