import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  iterateWithIntelligenceStreamTimeout,
  resolveIntelligenceStreamTimeoutMs,
  withIntelligenceStreamTimeout,
} from './intelligenceStreamTimeout'

describe('intelligenceStreamTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clamps requested stream timeouts to the bounded Nexus range', () => {
    expect(resolveIntelligenceStreamTimeoutMs(1)).toBe(5_000)
    expect(resolveIntelligenceStreamTimeoutMs(4_999.9)).toBe(5_000)
    expect(resolveIntelligenceStreamTimeoutMs(120_001)).toBe(120_000)
    expect(resolveIntelligenceStreamTimeoutMs(240_000)).toBe(120_000)
  })

  it('rejects a stalled intelligence stream promise with typed timeout details', async () => {
    vi.useFakeTimers()

    const resultPromise = withIntelligenceStreamTimeout(
      new Promise<never>(() => {}),
      5_000,
      'chat.stream.open',
    )

    await vi.advanceTimersByTimeAsync(4_999)
    const unresolved = Symbol('unresolved')
    await expect(Promise.race([resultPromise, Promise.resolve(unresolved)]))
      .resolves.toBe(unresolved)

    const timeoutExpectation = expect(resultPromise).rejects.toMatchObject({
      code: 'INTELLIGENCE_STREAM_TIMEOUT',
      phase: 'chat.stream.open',
      timeoutMs: 5_000,
    })
    await vi.advanceTimersByTimeAsync(1)
    await timeoutExpectation
  })

  it('yields available chunks before rejecting when a later async iterator next call stalls', async () => {
    vi.useFakeTimers()

    async function* stalledAfterFirstChunk(): AsyncIterable<string> {
      yield 'first chunk'
      await new Promise<never>(() => {})
    }

    const iterator = iterateWithIntelligenceStreamTimeout(
      stalledAfterFirstChunk(),
      5_000,
      'chat.stream.delta',
    )[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: 'first chunk',
    })

    const secondChunkPromise = iterator.next()
    const timeoutExpectation = expect(secondChunkPromise).rejects.toMatchObject({
      code: 'INTELLIGENCE_STREAM_TIMEOUT',
      phase: 'chat.stream.delta',
      timeoutMs: 5_000,
    })
    await vi.advanceTimersByTimeAsync(5_000)

    await timeoutExpectation
  })
})
