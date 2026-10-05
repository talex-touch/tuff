/**
 * Global usage not yet flushed to the database (audit rebuild parent design §1.2).
 *
 * The audit logger buffers entries for up to ~30 s before one transaction writes them. Totals and
 * limit checks read `database + pending`, so a call shows up the moment it is logged.
 *
 * Accounting is per entry object, not per summed period: the flush writes exactly the entries it
 * settles, an entry requeued after a failed flush simply stays tracked, and an entry dropped from
 * the buffer is discarded. Cost is read from the entry when a snapshot is taken, so the price the
 * flush assigns just before its transaction shows up here too.
 *
 * Consistent reads: `settle()` runs in the same synchronous continuation that observes the commit
 * and bumps `version`. A reader records `version`, reads the database, and merges a snapshot only
 * if `version` is unchanged; otherwise a commit landed during its read and it reads again.
 *
 * Leaf module: imported statically by the audit logger.
 */
import type { IntelligenceAuditLogEntry } from '../intelligence-audit-logger'
import { isOuterGovernanceCapability } from './constants'
import { dayPeriod, localDayKey, localMonthKey, monthPeriod } from './local-period'

export interface GlobalUsageContribution {
  /** `day:YYYY-MM-DD` in local time, fixed when the entry was logged. */
  dayPeriod: string
  /** `month:YYYY-MM` in local time, fixed when the entry was logged. */
  monthPeriod: string
}

export interface UsageDelta {
  requestCount: number
  successCount: number
  failureCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  totalCost: number
  /** Sum of latencies, so averages can be merged by weight. */
  latencySum: number
}

export function emptyUsageDelta(): UsageDelta {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    latencySum: 0
  }
}

function finite(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** What one entry adds to its global day and month buckets. */
export function entryUsageDelta(entry: IntelligenceAuditLogEntry): UsageDelta {
  return {
    requestCount: 1,
    successCount: entry.success ? 1 : 0,
    failureCount: entry.success ? 0 : 1,
    promptTokens: finite(entry.usage?.promptTokens),
    completionTokens: finite(entry.usage?.completionTokens),
    totalTokens: finite(entry.usage?.totalTokens),
    // The flush prices an entry before writing it; until then only an explicit or reported cost is known.
    totalCost: finite(entry.estimatedCost ?? entry.usage?.cost),
    latencySum: finite(entry.latency)
  }
}

export function addUsageDelta(target: UsageDelta, delta: UsageDelta): void {
  target.requestCount += delta.requestCount
  target.successCount += delta.successCount
  target.failureCount += delta.failureCount
  target.promptTokens += delta.promptTokens
  target.completionTokens += delta.completionTokens
  target.totalTokens += delta.totalTokens
  target.totalCost += delta.totalCost
  target.latencySum += delta.latencySum
}

/**
 * The global periods an entry counts toward, or null for an outer `agent.run` /
 * `workflow.execute` row, whose tokens are already counted through its inner model calls.
 */
export function globalContributionFor(
  entry: Pick<IntelligenceAuditLogEntry, 'capabilityId' | 'timestamp'>
): GlobalUsageContribution | null {
  if (isOuterGovernanceCapability(entry.capabilityId)) return null
  return {
    dayPeriod: dayPeriod(localDayKey(entry.timestamp)),
    monthPeriod: monthPeriod(localMonthKey(entry.timestamp))
  }
}

export class GlobalUsageDeltas {
  private readonly tracked = new Map<IntelligenceAuditLogEntry, GlobalUsageContribution>()
  private settledVersion = 0

  /** Starts tracking a logged entry; outer governance rows are ignored. */
  add(entry: IntelligenceAuditLogEntry): void {
    const contribution = globalContributionFor(entry)
    if (contribution) this.tracked.set(entry, contribution)
  }

  /**
   * The periods the flush must increment for this entry: the ones fixed at `add()`, so the
   * database moves by exactly what `settle()` removes. Untracked entries are keyed now.
   */
  contributionOf(entry: IntelligenceAuditLogEntry): GlobalUsageContribution | null {
    return this.tracked.get(entry) ?? globalContributionFor(entry)
  }

  /** The entries' transaction committed: the database now holds them. */
  settle(entries: Iterable<IntelligenceAuditLogEntry>): void {
    this.forget(entries)
  }

  /** The entries left the buffer without being written (overflow): stop counting them. */
  discard(entries: Iterable<IntelligenceAuditLogEntry>): void {
    this.forget(entries)
  }

  /** Bumped whenever tracked usage leaves this buffer. */
  get version(): number {
    return this.settledVersion
  }

  get size(): number {
    return this.tracked.size
  }

  /** Pending usage per requested period (`day:…` / `month:…`); unrequested periods are omitted. */
  snapshot(periods: Iterable<string>): Map<string, UsageDelta> {
    const result = new Map<string, UsageDelta>()
    for (const period of periods) result.set(period, emptyUsageDelta())
    if (result.size === 0 || this.tracked.size === 0) return result
    for (const [entry, contribution] of this.tracked) {
      const day = result.get(contribution.dayPeriod)
      const month = result.get(contribution.monthPeriod)
      if (!day && !month) continue
      const delta = entryUsageDelta(entry)
      if (day) addUsageDelta(day, delta)
      if (month) addUsageDelta(month, delta)
    }
    return result
  }

  private forget(entries: Iterable<IntelligenceAuditLogEntry>): void {
    let changed = false
    for (const entry of entries) {
      if (this.tracked.delete(entry)) changed = true
    }
    if (changed) this.settledVersion += 1
  }
}
