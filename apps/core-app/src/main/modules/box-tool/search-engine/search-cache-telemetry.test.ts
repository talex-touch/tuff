import { describe, expect, it } from 'vitest'
import { classifySearchCacheLookup, SearchCacheTelemetry } from './search-cache-telemetry'

/**
 * #346 asks whether the query cache earns its complexity and says to remove it if not. The
 * counters here are what that decision will be made from, so the shape they report has to be
 * right before anyone reads a number off it.
 *
 * The case that matters most is the reason breakdown. A hit rate near zero reads as "nobody
 * repeats queries" unless the misses are separated by cause — and this cache is cleared by any
 * index commit, including from providers a query never reached.
 */
/**
 * The lookup classification, which decides which miss column a run lands in.
 *
 * It used to sit inline in `SearchCore.executeSearch` where nothing could assert it: a plant that
 * reported every revision mismatch as `expired` passed the whole search-engine suite.
 */
describe('classifySearchCacheLookup', () => {
  const base = { currentRevision: 7, now: 1_000, ttlMs: 5_000 }

  it('serves a fresh entry at the current revision', () => {
    expect(classifySearchCacheLookup({ ...base, entry: { revision: 7, timestamp: 900 } })).toBe(
      'hit'
    )
  })

  it('reports nothing under the key as absent', () => {
    expect(classifySearchCacheLookup({ ...base, entry: undefined })).toBe('absent')
  })

  it('reports an entry the index moved past as a revision mismatch, not a miss', () => {
    expect(classifySearchCacheLookup({ ...base, entry: { revision: 6, timestamp: 900 } })).toBe(
      'revision-mismatch'
    )
  })

  it('reports an entry older than the TTL as expired', () => {
    expect(
      classifySearchCacheLookup({ ...base, now: 7_000, entry: { revision: 7, timestamp: 900 } })
    ).toBe('expired')
  })

  /**
   * An entry can be both. Calling it expired would hide an invalidation behind the TTL and make
   * the policy look like it costs nothing — which is the reading this whole breakdown exists to
   * prevent.
   */
  it('attributes a stale-and-expired entry to the revision, not the clock', () => {
    expect(
      classifySearchCacheLookup({ ...base, now: 7_000, entry: { revision: 6, timestamp: 900 } })
    ).toBe('revision-mismatch')
  })

  it('treats an entry exactly at the TTL boundary as expired', () => {
    expect(
      classifySearchCacheLookup({ ...base, now: 5_900, entry: { revision: 7, timestamp: 900 } })
    ).toBe('expired')
    expect(
      classifySearchCacheLookup({ ...base, now: 5_899, entry: { revision: 7, timestamp: 900 } })
    ).toBe('hit')
  })
})

describe('search cache telemetry', () => {
  it('reports nothing rather than dividing by zero before any lookup', () => {
    const snapshot = new SearchCacheTelemetry().snapshot()

    expect(snapshot.lookups).toBe(0)
    expect(snapshot.hitRate).toBe(0)
    expect(snapshot.hitAgeMs).toEqual({ p50: null, p95: null })
    expect(snapshot.savedLatencyMs).toEqual({ p50: null, p95: null, total: 0 })
    // Every reason present at zero, so a report can be read as a distribution from the first run.
    expect(Object.values(snapshot.misses)).toEqual([0, 0, 0])
    expect(Object.values(snapshot.invalidations)).toEqual([0, 0, 0, 0])
  })

  it('counts hits and misses against the same lookup total', () => {
    const telemetry = new SearchCacheTelemetry()

    telemetry.recordHit(100, 40)
    telemetry.recordMiss('absent')
    telemetry.recordMiss('revision-mismatch')
    const snapshot = telemetry.snapshot()

    expect(snapshot.lookups).toBe(3)
    expect(snapshot.hits).toBe(1)
    expect(snapshot.hitRate).toBeCloseTo(1 / 3)
    expect(snapshot.misses).toEqual({ absent: 1, 'revision-mismatch': 1, expired: 0 })
  })

  /**
   * The distinction this whole file exists for. Two runs with the same hit rate mean opposite
   * things depending on which column the misses land in, and a single `misses` counter would
   * make them indistinguishable.
   */
  it('separates a cache nobody used from a cache that was denied', () => {
    const unused = new SearchCacheTelemetry()
    for (let i = 0; i < 10; i += 1) unused.recordMiss('absent')

    const denied = new SearchCacheTelemetry()
    for (let i = 0; i < 10; i += 1) denied.recordMiss('revision-mismatch')

    expect(unused.snapshot().hitRate).toBe(denied.snapshot().hitRate)
    expect(unused.snapshot().misses.absent).toBe(10)
    expect(unused.snapshot().misses['revision-mismatch']).toBe(0)
    expect(denied.snapshot().misses['revision-mismatch']).toBe(10)
    expect(denied.snapshot().misses.absent).toBe(0)
  })

  it('counts invalidations by entries dropped, not by calls', () => {
    const telemetry = new SearchCacheTelemetry()

    telemetry.recordInvalidation('index-commit', 12)
    telemetry.recordInvalidation('index-commit', 3)
    telemetry.recordInvalidation('lru-evict', 1)
    const snapshot = telemetry.snapshot()

    expect(snapshot.invalidations['index-commit']).toBe(15)
    expect(snapshot.entriesDropped).toBe(16)
  })

  /**
   * `handleSearchIndexCommit` clears unconditionally, so it fires on an empty cache constantly
   * while the file watcher runs. Counting those would inflate `index-commit` with events that
   * dropped nothing and make it look like the dominant cause when it dropped no entries at all.
   */
  it('ignores a clear that dropped no entries', () => {
    const telemetry = new SearchCacheTelemetry()

    telemetry.recordInvalidation('index-commit', 0)
    telemetry.recordInvalidation('pin-toggle', -1)
    telemetry.recordInvalidation('privacy-cleanup', Number.NaN)

    expect(telemetry.snapshot().entriesDropped).toBe(0)
    expect(telemetry.snapshot().invalidations['index-commit']).toBe(0)
  })

  it('reports the age of served entries so the TTL can be judged', () => {
    const telemetry = new SearchCacheTelemetry()

    for (const age of [10, 20, 30, 40, 4900]) telemetry.recordHit(age, 5)
    const { hitAgeMs } = telemetry.snapshot()

    expect(hitAgeMs.p50).toBe(30)
    expect(hitAgeMs.p95).toBe(4900)
  })

  /**
   * Saved latency is the duration the served result originally took. A snapshot stored without
   * one contributes nothing rather than a zero — counting it as zero saved would pull the
   * percentiles toward a saving that did not happen.
   */
  it('leaves durations it does not have out of the percentiles', () => {
    const telemetry = new SearchCacheTelemetry()

    telemetry.recordHit(10, 200)
    telemetry.recordHit(10, null)
    telemetry.recordHit(10, 400)
    const { savedLatencyMs, hits } = telemetry.snapshot()

    expect(hits).toBe(3)
    expect(savedLatencyMs.total).toBe(600)
    expect(savedLatencyMs.p50).toBe(400)
  })

  it('refuses values that would corrupt the percentiles', () => {
    const telemetry = new SearchCacheTelemetry()

    telemetry.recordHit(Number.NaN, Number.POSITIVE_INFINITY)
    telemetry.recordHit(-5, 100)
    const snapshot = telemetry.snapshot()

    expect(snapshot.hits).toBe(2)
    expect(snapshot.hitAgeMs.p50).toBeNull()
    expect(snapshot.savedLatencyMs.total).toBe(100)
  })

  it('bounds its samples so a long session cannot grow it without limit', () => {
    const telemetry = new SearchCacheTelemetry()

    for (let i = 0; i < 1_500; i += 1) telemetry.recordHit(i, i)
    const snapshot = telemetry.snapshot()

    // Counts stay exact; only the percentile window slides to the most recent 1000, which after
    // 1500 pushes holds 500..1499 — so the median is 1000, not 750.
    expect(snapshot.hits).toBe(1_500)
    expect(snapshot.hitAgeMs.p50).toBe(1_000)
    expect(snapshot.hitAgeMs.p95).toBe(1_450)
  })

  it('clears every counter on reset', () => {
    const telemetry = new SearchCacheTelemetry()

    telemetry.recordHit(10, 10)
    telemetry.recordMiss('expired')
    telemetry.recordInvalidation('pin-toggle', 2)
    telemetry.reset()

    expect(telemetry.snapshot()).toEqual(new SearchCacheTelemetry().snapshot())
  })
})
