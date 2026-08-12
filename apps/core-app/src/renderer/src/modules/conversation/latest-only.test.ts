/**
 * The route watcher awaits history.load(target) and then assigns unconditionally, so two
 * overlapping navigations raced: a slower earlier load landed after a faster later one and left the
 * URL naming one thread while the view showed another (#826).
 *
 * The guard lives here rather than inline in HomePage.vue because that SFC has no mounting harness,
 * and an invariant nobody can exercise is one that quietly stops holding. The last test drives the
 * exact interleaving from the report.
 */
import { describe, expect, it } from 'vitest'

import { createLatestOnly } from './latest-only'

describe('createLatestOnly', () => {
  it('单独一次认领始终是最新的', () => {
    const isCurrent = createLatestOnly().claim()

    expect(isCurrent()).toBe(true)
  })

  it('后一次认领会让前一次失效', () => {
    const sequence = createLatestOnly()

    const first = sequence.claim()
    const second = sequence.claim()

    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })

  it('失效是永久的:更晚的认领结束后,旧的也不会复活', () => {
    const sequence = createLatestOnly()
    const first = sequence.claim()
    sequence.claim()

    expect(first()).toBe(false)
    expect(first()).toBe(false)
  })

  it('两个独立序列互不影响', () => {
    const one = createLatestOnly()
    const other = createLatestOnly()

    const claimed = one.claim()
    other.claim()

    expect(claimed()).toBe(true)
  })

  it('慢的旧请求先发后到时,不会覆盖快的新请求', async () => {
    const sequence = createLatestOnly()
    const applied: string[] = []

    /** Mirrors the watcher: claim, await a load, apply only if still current. */
    async function restore(target: string, delayMs: number): Promise<void> {
      const isCurrent = sequence.claim()
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      if (!isCurrent()) return
      applied.push(target)
    }

    // 'slow' is navigated to first and resolves last — the interleaving from the report.
    await Promise.all([restore('slow', 30), restore('fast', 5)])

    expect(applied).toEqual(['fast'])
  })
})
