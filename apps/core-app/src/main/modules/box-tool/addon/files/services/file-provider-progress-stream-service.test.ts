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
  it('无 previous 时立即发送', () => {
    const next = createPayload()
    expect(
      shouldEmitProgressStreamImmediately({
        previous: null,
        next,
        now: 1_000,
        lastEmitAt: 0
      })
    ).toBe(true)
  })

  it('阶段变化时立即发送', () => {
    const previous = createPayload({ stage: 'scanning' })
    const next = createPayload({ stage: 'indexing' })
    expect(
      shouldEmitProgressStreamImmediately({
        previous,
        next,
        now: 1_000,
        lastEmitAt: 900
      })
    ).toBe(true)
  })

  it('completed/idle 阶段立即发送', () => {
    const previous = createPayload()
    const next = createPayload({ stage: 'completed' })
    expect(
      shouldEmitProgressStreamImmediately({
        previous,
        next,
        now: 1_000,
        lastEmitAt: 900
      })
    ).toBe(true)
  })

  it('达到静默上限时立即发送', () => {
    const previous = createPayload()
    const next = createPayload()
    expect(
      shouldEmitProgressStreamImmediately({
        previous,
        next,
        now: 3_000,
        lastEmitAt: 1_900
      })
    ).toBe(true)
  })

  it('最小间隔内且无关键变化时不发送', () => {
    const previous = createPayload({ current: 10, progress: 0.1, total: 100 })
    const next = createPayload({ current: 11, progress: 0.1, total: 100 })
    expect(
      shouldEmitProgressStreamImmediately({
        previous,
        next,
        now: 1_000,
        lastEmitAt: 910
      })
    ).toBe(false)
  })

  it('超过最小间隔且进度变化时发送', () => {
    const previous = createPayload({ progress: 0.1 })
    const next = createPayload({ progress: 0.2 })
    expect(
      shouldEmitProgressStreamImmediately({
        previous,
        next,
        now: 1_500,
        lastEmitAt: 1_200
      })
    ).toBe(true)
  })

  it('超过步进阈值时发送', () => {
    const previous = createPayload({ current: 10 })
    const next = createPayload({ current: 40 })
    expect(
      shouldEmitProgressStreamImmediately({
        previous,
        next,
        now: 1_500,
        lastEmitAt: 1_200
      })
    ).toBe(true)
  })

  it('flush delay 不会为负数', () => {
    expect(getProgressStreamFlushDelayMs(1_000, 900)).toBe(60)
    expect(getProgressStreamFlushDelayMs(1_000, 700)).toBe(0)
  })
})
