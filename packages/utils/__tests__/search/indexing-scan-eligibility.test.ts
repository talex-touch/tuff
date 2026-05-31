import { describe, expect, it } from 'vitest'
import { resolveIndexedScanEligibility, toIndexedScanTimestamp } from '../../search'

describe('indexing scan eligibility', () => {
  it('returns new paths and latest scan timestamp', () => {
    const scannedAt = new Date('2026-05-31T00:00:00.000Z')

    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/a', '/b'],
        completedScans: [{ path: '/a', lastScanned: scannedAt }],
        intervalMs: 24 * 60 * 60 * 1000,
        now: scannedAt.getTime()
      })
    ).toEqual({
      newPaths: ['/b'],
      stalePaths: [],
      lastScannedAt: scannedAt.getTime()
    })
  })

  it('marks stale watched paths when interval elapsed', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/a', '/b'],
        completedScans: [
          { path: '/a', lastScanned: 100 },
          { path: '/b', lastScanned: 900 }
        ],
        intervalMs: 500,
        now: 1000
      })
    ).toEqual({
      newPaths: [],
      stalePaths: ['/a'],
      lastScannedAt: 900
    })
  })

  it('treats non-positive interval as all completed watched paths stale', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/a', '/b'],
        completedScans: [
          { path: '/a', lastScanned: 100 },
          { path: '/external', lastScanned: 200 }
        ],
        intervalMs: 0,
        now: 1000
      })
    ).toEqual({
      newPaths: ['/b'],
      stalePaths: ['/a'],
      lastScannedAt: 200
    })
  })

  it('ignores rows with invalid timestamps', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/a'],
        completedScans: [{ path: '/a', lastScanned: 'not-a-date' }],
        intervalMs: 500,
        now: 1000
      })
    ).toEqual({
      newPaths: ['/a'],
      stalePaths: [],
      lastScannedAt: null
    })
  })

  it('converts supported timestamp inputs', () => {
    expect(toIndexedScanTimestamp(new Date('2026-05-31T00:00:00.000Z'))).toBe(
      Date.parse('2026-05-31T00:00:00.000Z')
    )
    expect(toIndexedScanTimestamp(42)).toBe(42)
    expect(toIndexedScanTimestamp('2026-05-31T00:00:00.000Z')).toBe(
      Date.parse('2026-05-31T00:00:00.000Z')
    )
    expect(toIndexedScanTimestamp(Number.NaN)).toBeNull()
  })
})
