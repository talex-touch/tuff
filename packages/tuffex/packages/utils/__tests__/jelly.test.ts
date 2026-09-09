import { describe, expect, it } from 'vitest'
import { JELLY, jellyScale } from '../animation/jelly'

/**
 * `jellyScale` is the Radio indicator's `getElasticScale` lifted out verbatim so
 * the slider thumb can deform as the same material. These pin the arithmetic to
 * the numbers the indicator shipped with (2026-09), so a retune has to be a
 * deliberate edit here rather than a drift in one consumer.
 */
describe('jellyScale', () => {
  const atRest = {
    speed: 0,
    impact: 0,
    impactAxis: 'x' as const,
    elastic: true,
    moving: false,
    dragBoost: 1,
    baseScale: 1,
    phaseScale: 1,
  }

  it('is the identity at rest', () => {
    expect(jellyScale(atRest)).toEqual({ scaleX: 1, scaleY: 1 })
  })

  it('thins across the travel and lengthens along the other axis while moving', () => {
    // 300 px/s saturates the 0.6 cap; held, the boost lifts it to 1.08.
    const held = jellyScale({ ...atRest, speed: 300, moving: true, dragBoost: JELLY.heldStretchBoost })
    expect(held.scaleX).toBeCloseTo(1 - 1.08 * 0.35, 6)
    expect(held.scaleY).toBeCloseTo(1 + 1.08 * 0.6, 6)

    // Coasting: same speed, no boost.
    const free = jellyScale({ ...atRest, speed: 300, moving: true })
    expect(free.scaleX).toBeCloseTo(1 - 0.6 * 0.35, 6)
    expect(free.scaleY).toBeCloseTo(1 + 0.6 * 0.6, 6)
  })

  it('ignores speed below the rest floor and speed without motion', () => {
    expect(jellyScale({ ...atRest, speed: 3, moving: true })).toEqual({ scaleX: 1, scaleY: 1 })
    expect(jellyScale({ ...atRest, speed: 400, moving: false })).toEqual({ scaleX: 1, scaleY: 1 })
  })

  it('squashes along the impact axis even when the shape is not travelling', () => {
    const squash = 1 * 0.7
    const x = jellyScale({ ...atRest, impact: 1, impactAxis: 'x' })
    expect(x.scaleX).toBeCloseTo(1 + squash * 0.5, 6)
    expect(x.scaleY).toBeCloseTo(1 - squash * 0.4, 6)

    const y = jellyScale({ ...atRest, impact: 1, impactAxis: 'y' })
    expect(y.scaleY).toBeCloseTo(1 + squash * 0.5, 6)
    expect(y.scaleX).toBeCloseTo(1 - squash * 0.4, 6)
  })

  it('multiplies base and phase into both axes, and drops the phase with elastic off', () => {
    const on = jellyScale({ ...atRest, baseScale: JELLY.heldScale, phaseScale: JELLY.emergeScale })
    expect(on.scaleX).toBeCloseTo(1.08 * 1.08, 6)
    expect(on.scaleY).toBeCloseTo(1.08 * 1.08, 6)

    // With elasticity off the shape is rigid: no stretch, no squash, no phase pop.
    const off = jellyScale({ ...atRest, elastic: false, speed: 300, moving: true, impact: 1, baseScale: 1.08, phaseScale: 1.08 })
    expect(off).toEqual({ scaleX: 1.08, scaleY: 1.08 })
  })

  it('clamps the result to [0, 2]', () => {
    const big = jellyScale({ ...atRest, speed: 300, moving: true, dragBoost: 10, baseScale: 2, phaseScale: 2 })
    expect(big.scaleY).toBe(2)
    expect(big.scaleX).toBe(0)
  })
})
