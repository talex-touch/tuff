import { describe, expect, it } from 'vitest'
import {
  normalizeScanProgressLastScanned,
  normalizeScanProgressPaths,
  normalizeScanProgressUpsert
} from './search-index-worker-scan-progress'

describe('search index worker scan progress normalization', () => {
  it('filters empty paths and keeps first occurrence order', () => {
    expect(normalizeScanProgressPaths(['/a', '', '   ', '/b', '/a', '/c'])).toEqual([
      '/a',
      '/b',
      '/c'
    ])
  })

  it('rejects malformed scan timestamps before they reach scan_progress', () => {
    expect(normalizeScanProgressLastScanned('not-a-date')).toBeNull()
    expect(normalizeScanProgressLastScanned(Number.NaN)).toBeNull()
  })

  it('normalizes valid upsert payloads for client and worker boundaries', () => {
    const normalized = normalizeScanProgressUpsert(
      ['/root-a', '/root-a', '/root-b'],
      '2026-06-20T10:00:00.000Z'
    )

    expect(normalized?.paths).toEqual(['/root-a', '/root-b'])
    expect(normalized?.lastScanned.toISOString()).toBe('2026-06-20T10:00:00.000Z')
  })

  it('returns null when no safe scan progress write should be attempted', () => {
    expect(normalizeScanProgressUpsert(['', '  '], '2026-06-20T10:00:00.000Z')).toBeNull()
    expect(normalizeScanProgressUpsert(['/root-a'], 'invalid-date')).toBeNull()
  })
})
