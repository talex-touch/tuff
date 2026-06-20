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
      lastScannedAt: 100
    })
  })

  it('ignores completed scan rows outside watched paths when resolving latest scan time', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/a'],
        completedScans: [
          { path: '/a', lastScanned: 100 },
          { path: '/external', lastScanned: 900 }
        ],
        intervalMs: 500,
        now: 1000
      })
    ).toEqual({
      newPaths: [],
      stalePaths: ['/a'],
      lastScannedAt: 100
    })
  })

  it('matches completed scan rows through an optional normalizer', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/Users/me/Documents', '/Users/me/Downloads'],
        completedScans: [
          { path: '/users/me/documents', lastScanned: 100 },
          { path: '/external', lastScanned: 200 }
        ],
        intervalMs: 0,
        now: 1000,
        normalizePath: (value) => value.toLowerCase()
      })
    ).toEqual({
      newPaths: ['/Users/me/Downloads'],
      stalePaths: ['/Users/me/Documents'],
      lastScannedAt: 100
    })
  })

  it('deduplicates watched paths through the optional normalizer', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/Users/me/Documents', '/users/me/documents', '/Users/me/Downloads'],
        completedScans: [
          { path: '/users/me/documents', lastScanned: 100 },
          { path: '/users/me/downloads', lastScanned: 100 }
        ],
        intervalMs: 50,
        now: 200,
        normalizePath: (value) => value.toLowerCase()
      })
    ).toEqual({
      newPaths: [],
      stalePaths: ['/Users/me/Documents', '/Users/me/Downloads'],
      lastScannedAt: 100
    })
  })

  it('ignores empty normalized watch paths and completed rows', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/a', '   ', '/empty'],
        completedScans: [
          { path: '/a', lastScanned: 0 },
          { path: '/empty', lastScanned: 100 },
          { path: '   ', lastScanned: 900 }
        ],
        intervalMs: 50,
        now: 100,
        normalizePath: (value) => value.trim()
      })
    ).toEqual({
      newPaths: [],
      stalePaths: ['/a'],
      lastScannedAt: 100
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

  it('ignores rows with negative timestamps', () => {
    expect(
      resolveIndexedScanEligibility({
        watchPaths: ['/a'],
        completedScans: [{ path: '/a', lastScanned: -1 }],
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
    expect(toIndexedScanTimestamp(-1)).toBeNull()
  })
})
