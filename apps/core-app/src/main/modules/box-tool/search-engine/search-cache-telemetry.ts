/**
 * Counters for the SearchCore query cache (#346).
 *
 * That issue asks whether the cache earns its complexity, and says to remove it if not. The
 * number that would answer it does not exist: nothing counts a lookup. This records the lookups
 * and, more importantly, *why* the misses happened.
 *
 * The reason breakdown is the decisive part rather than one column among several. A cache whose
 * entries are thrown away by unrelated indexing has a low hit rate for a reason that has nothing
 * to do with users repeating queries, and removing it on that number would be acting on an
 * artefact of the invalidation policy. `search-core.contracts.test.ts:822` already encodes that
 * policy as the contract: a commit from a provider the query never reached still evicts.
 *
 * No query text, no key, no item content -- only counts and durations. The cache key is a hash
 * already, and even that is not recorded, so nothing here can reconstruct what was searched.
 */

/** Why a lookup did not produce a usable entry. */
export type SearchCacheMissReason =
  /** Nothing under this key — a first-time query, or the entry was already dropped. */
  | 'absent'
  /** The entry was there but the index moved on. This one is the cache being denied, not unused. */
  | 'revision-mismatch'
  | 'expired'

/** Why entries were dropped, counted per entry rather than per call. */
export type SearchCacheInvalidationReason =
  /** A `searchCache.clear()` from any index commit, whatever source it came from. */
  'index-commit' | 'privacy-cleanup' | 'pin-toggle' | 'lru-evict'

export interface SearchCacheTelemetrySnapshot {
  lookups: number
  hits: number
  misses: Record<SearchCacheMissReason, number>
  invalidations: Record<SearchCacheInvalidationReason, number>
  /** Entries dropped in total, so `invalidations` can be read as a distribution. */
  entriesDropped: number
  hitRate: number
  /** Age of the entries that were served, in ms. Says whether the 5s TTL is the binding limit. */
  hitAgeMs: { p50: number | null; p95: number | null }
  /**
   * Wall time the served result originally took to produce, in ms.
   *
   * This is what a hit saved, and it is the only defensible reading of "saved latency" here: the
   * alternative would be timing the work that a hit did not do.
   */
  savedLatencyMs: { p50: number | null; p95: number | null; total: number }
}

const MISS_REASONS: SearchCacheMissReason[] = ['absent', 'revision-mismatch', 'expired']
const INVALIDATION_REASONS: SearchCacheInvalidationReason[] = [
  'index-commit',
  'privacy-cleanup',
  'pin-toggle',
  'lru-evict'
]

/**
 * Samples are capped so a long-running session cannot grow this without bound.
 *
 * Dropping the oldest keeps the percentiles describing recent behaviour, which is what a
 * measurement session wants; the counts above stay exact regardless.
 */
const MAX_SAMPLES = 1_000

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))
  return sorted[index] ?? null
}

export type SearchCacheLookupOutcome = 'hit' | SearchCacheMissReason

/**
 * Decides what a lookup was, from the entry and the state it is checked against.
 *
 * Extracted from `SearchCore.executeSearch` because the branch that matters -- telling
 * `revision-mismatch` from `expired` -- had no way to be asserted while it sat inline in a
 * 2200-line method. Those two are the whole point of the breakdown: one says an index commit
 * denied the entry, the other says the user waited longer than the TTL.
 */
export function classifySearchCacheLookup(input: {
  entry: { revision: number; timestamp: number } | undefined
  currentRevision: number
  now: number
  ttlMs: number
}): SearchCacheLookupOutcome {
  const { entry, currentRevision, now, ttlMs } = input
  if (!entry) return 'absent'
  // Revision first: an entry can be both stale and expired, and reporting it as expired would
  // hide the invalidation policy behind the TTL.
  if (entry.revision !== currentRevision) return 'revision-mismatch'
  if (now - entry.timestamp >= ttlMs) return 'expired'
  return 'hit'
}

export class SearchCacheTelemetry {
  private lookups = 0
  private hits = 0
  private readonly misses = new Map<SearchCacheMissReason, number>()
  private readonly invalidations = new Map<SearchCacheInvalidationReason, number>()
  private hitAges: number[] = []
  private savedLatencies: number[] = []

  recordHit(ageMs: number, originalDurationMs: number | null | undefined): void {
    this.lookups += 1
    this.hits += 1
    push(this.hitAges, ageMs)
    // A snapshot stored before durations were recorded has nothing to contribute; counting it as
    // zero saved would drag the percentiles toward a saving that did not happen. `push` rejects
    // the null on its own, so there is no second guard here -- an unreachable branch would look
    // load-bearing to the next reader and no test could hold it.
    push(this.savedLatencies, originalDurationMs)
  }

  recordMiss(reason: SearchCacheMissReason): void {
    this.lookups += 1
    this.misses.set(reason, (this.misses.get(reason) ?? 0) + 1)
  }

  /** `count` is entries dropped, so a `clear()` of an empty cache contributes nothing. */
  recordInvalidation(reason: SearchCacheInvalidationReason, count: number): void {
    if (!Number.isFinite(count) || count <= 0) return
    this.invalidations.set(reason, (this.invalidations.get(reason) ?? 0) + count)
  }

  snapshot(): SearchCacheTelemetrySnapshot {
    const ages = [...this.hitAges].sort((a, b) => a - b)
    const saved = [...this.savedLatencies].sort((a, b) => a - b)
    return {
      lookups: this.lookups,
      hits: this.hits,
      misses: Object.fromEntries(
        MISS_REASONS.map((reason) => [reason, this.misses.get(reason) ?? 0])
      ) as Record<SearchCacheMissReason, number>,
      invalidations: Object.fromEntries(
        INVALIDATION_REASONS.map((reason) => [reason, this.invalidations.get(reason) ?? 0])
      ) as Record<SearchCacheInvalidationReason, number>,
      entriesDropped: [...this.invalidations.values()].reduce((total, value) => total + value, 0),
      hitRate: this.lookups === 0 ? 0 : this.hits / this.lookups,
      hitAgeMs: { p50: percentile(ages, 0.5), p95: percentile(ages, 0.95) },
      savedLatencyMs: {
        p50: percentile(saved, 0.5),
        p95: percentile(saved, 0.95),
        total: saved.reduce((sum, value) => sum + value, 0)
      }
    }
  }

  reset(): void {
    this.lookups = 0
    this.hits = 0
    this.misses.clear()
    this.invalidations.clear()
    this.hitAges = []
    this.savedLatencies = []
  }
}

function push(samples: number[], value: number | null | undefined): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return
  samples.push(value)
  if (samples.length > MAX_SAMPLES) samples.shift()
}
