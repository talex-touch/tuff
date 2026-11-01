import { describe, expect, it } from 'vitest'
import type { Pressure } from '../eval-types'
import { createPacedLimiter, createPacer } from './pacing'
import { createRateLimiter } from './rate-limiter'
import { createVirtualClock } from './test-support/virtual-clock'

function rig(base = 6) {
  const clock = createVirtualClock()
  const state: { level: Pressure; reason?: string } = { level: 'ok' }
  const marks: string[] = []
  const pacer = createPacer({
    clock,
    base,
    pressure: () => ({ ...state }),
    mark: (label) => marks.push(label)
  })
  const at = async (ms: number, level: Pressure, reason?: string) => {
    await clock.advance(ms)
    state.level = level
    state.reason = reason
    pacer.update()
  }
  return { clock, state, marks, pacer, at }
}

describe('createPacer', () => {
  it('lets the full concurrency through while pressure is ok', async () => {
    const { pacer, clock } = rig()
    await clock.advance(10_000)
    pacer.update()
    expect(pacer.limit()).toBe(6)
    expect(pacer.stats()).toMatchObject({
      throttledSeconds: 0,
      criticalHolds: 0,
      degradedEpisodes: 0
    })
  })

  it('halves the concurrency while pressure is elevated and counts the throttled seconds and episodes', async () => {
    const { pacer, at, marks } = rig(7)
    await at(1_000, 'elevated', 'cpu 180%')
    expect(pacer.limit()).toBe(3)
    await at(4_000, 'ok')
    expect(pacer.limit()).toBe(7)
    await at(2_000, 'elevated')
    await at(1_000, 'ok')

    expect(pacer.stats()).toMatchObject({ throttledSeconds: 5, degradedEpisodes: 2 })
    expect(marks[0]).toBe('pacing:elevated (cpu 180%)')
  })

  it('never goes below one scenario', async () => {
    const { pacer, at } = rig(1)
    await at(0, 'elevated')
    expect(pacer.limit()).toBe(1)
  })

  it('holds new work while critical and releases it only after three quiet seconds', async () => {
    const { pacer, at, marks, state } = rig()
    await at(0, 'critical', 'loop block 900 ms')
    expect(pacer.limit()).toBe(0)
    expect(pacer.mode()).toBe('holding')

    await at(1_000, 'elevated')
    expect(pacer.limit()).toBe(0)
    await at(1_000, 'ok')
    await at(2_000, 'ok')
    expect(pacer.limit()).toBe(0)
    await at(1_000, 'ok')
    expect(pacer.mode()).toBe('normal')
    expect(pacer.limit()).toBe(6)

    expect(pacer.stats()).toMatchObject({
      criticalHolds: 1,
      criticalHoldSeconds: 5,
      criticalTimeouts: 0
    })
    expect(marks).toContain('pacing:hold')
    expect(marks).toContain('pacing:resume')
    expect(state.level).toBe('ok')
  })

  it('starts the three seconds over when pressure comes back', async () => {
    const { pacer, at } = rig()
    await at(0, 'critical')
    await at(1_000, 'ok')
    await at(2_000, 'critical')
    await at(1_000, 'ok')
    await at(2_900, 'ok')
    expect(pacer.limit()).toBe(0)
    await at(200, 'ok')
    expect(pacer.limit()).toBe(6)
    expect(pacer.stats().criticalHolds).toBe(1)
  })

  it('gives up waiting after a minute, goes on at one scenario and says so', async () => {
    const { pacer, at, marks } = rig()
    await at(0, 'critical')
    for (let second = 0; second < 59; second += 1) await at(1_000, 'critical')
    expect(pacer.mode()).toBe('holding')
    await at(1_000, 'critical')

    expect(pacer.mode()).toBe('limp')
    expect(pacer.limit()).toBe(1)
    expect(pacer.stats()).toMatchObject({ criticalTimeouts: 1, criticalHolds: 1 })
    expect(marks.some((label) => label.startsWith('pacing:hold-timeout'))).toBe(true)

    await at(500, 'elevated')
    expect(pacer.mode()).toBe('normal')
    expect(pacer.limit()).toBe(3)
  })

  it('follows a new base when the phase changes', async () => {
    const { pacer } = rig(6)
    pacer.setBase(24)
    expect(pacer.limit()).toBe(24)
  })
})

describe('createPacedLimiter', () => {
  it('takes slots from the slow limiter while pressure is above ok', async () => {
    const clock = createVirtualClock()
    const fast = createRateLimiter(10, clock)
    const slow = createRateLimiter(5, clock)
    let level: Pressure = 'ok'
    const limiter = createPacedLimiter(fast, slow, () => level)

    await clock.runUntil(
      (async () => {
        await limiter.acquire()
        level = 'elevated'
        await limiter.acquire()
        level = 'critical'
        await limiter.acquire()
      })()
    )

    expect(fast.issued).toBe(1)
    expect(slow.issued).toBe(2)
    expect(limiter.issued).toBe(3)
  })
})
