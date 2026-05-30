import type { FileIndexProgress as FileIndexProgressPayload } from '@talex-touch/utils/transport/events/types'
import { describe, expect, it } from 'vitest'
import {
  getProgressStreamFlushDelayMs,
  shouldEmitProgressStreamImmediately
} from './file-provider-progress-stream-service'

function createPayload(
  overrides: Partial<FileIndexProgressPayload> = {}
): FileIndexProgressPayload {
  const merged = {
    stage: 'indexing',
    current: 10,
    total: 100,
    progress: 0.1,
    startTime: null,
    estimatedRemainingMs: null,
    averageItemsPerSecond: 0,
    ...overrides
  }
  return {
    ...merged,
    startTime: merged.startTime ?? null,
    estimatedRemainingMs: merged.estimatedRemainingMs ?? null,
    averageItemsPerSecond: merged.averageItemsPerSecond ?? 0
  }
}

describe('file-provider-progress-stream-service', () => {
  it('adapts shared progress stream throttling to FileIndexProgress payloads', () => {
    expect(
      shouldEmitProgressStreamImmediately({
        previous: null,
        next: createPayload(),
        now: 1_000,
        lastEmitAt: 0
      })
    ).toBe(true)

    expect(
      shouldEmitProgressStreamImmediately({
        previous: createPayload({ stage: 'indexing' }),
        next: createPayload({ stage: 'completed' }),
        now: 1_000,
        lastEmitAt: 990
      })
    ).toBe(true)

    expect(
      shouldEmitProgressStreamImmediately({
        previous: createPayload({ current: 10, progress: 0.1, total: 100 }),
        next: createPayload({ current: 11, progress: 0.1, total: 100 }),
        now: 1_000,
        lastEmitAt: 910
      })
    ).toBe(false)
  })

  it('adapts shared flush delay calculation without negative delays', () => {
    expect(getProgressStreamFlushDelayMs(1_000, 900)).toBe(60)
    expect(getProgressStreamFlushDelayMs(1_000, 700)).toBe(0)
  })
})
