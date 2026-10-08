import { describe, expect, it } from 'vitest'
import {
  SEARCH_INDEX_COMPACTION_MIN_FREE_BYTES,
  resolveSearchIndexCompactionDecision
} from './search-index-compaction'

const GB = 1024 * 1024 * 1024

describe('resolveSearchIndexCompactionDecision', () => {
  it('runs when the freelist is a real share of the file and the disk has headroom', () => {
    expect(
      resolveSearchIndexCompactionDecision({
        fileBytes: 5 * GB,
        freelistBytes: 0.85 * GB,
        freeDiskBytes: 30 * GB
      })
    ).toEqual({ run: true })
  })

  it('skips a file with little to reclaim, in bytes or as a ratio', () => {
    expect(
      resolveSearchIndexCompactionDecision({
        fileBytes: 5 * GB,
        freelistBytes: SEARCH_INDEX_COMPACTION_MIN_FREE_BYTES - 1,
        freeDiskBytes: 30 * GB
      })
    ).toEqual({ run: false, reason: 'nothing-to-reclaim' })
    expect(
      resolveSearchIndexCompactionDecision({
        fileBytes: 50 * GB,
        freelistBytes: 1 * GB,
        freeDiskBytes: 500 * GB
      })
    ).toEqual({ run: false, reason: 'nothing-to-reclaim' })
  })

  it('refuses without disk headroom for the temp copy and the WAL', () => {
    expect(
      resolveSearchIndexCompactionDecision({
        fileBytes: 5 * GB,
        freelistBytes: 2 * GB,
        freeDiskBytes: 9 * GB
      })
    ).toEqual({ run: false, reason: 'insufficient-disk' })
    expect(
      resolveSearchIndexCompactionDecision({
        fileBytes: 5 * GB,
        freelistBytes: 2 * GB,
        freeDiskBytes: null
      })
    ).toEqual({ run: false, reason: 'disk-unknown' })
  })
})
