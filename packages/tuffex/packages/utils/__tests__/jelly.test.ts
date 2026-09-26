import { describe, expect, it } from 'vitest'
import { JELLY, JELLY_REFERENCE_MS, jellyScale, jellySpring } from '../animation/jelly'

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

  it('turns the travel stretch through 90° on a vertical track and leaves x untouched', () => {
    const moving = { ...atRest, speed: 300, moving: true }
    const x = jellyScale(moving)
    expect(jellyScale({ ...moving, travelAxis: 'x' })).toEqual(x)

    const y = jellyScale({ ...moving, travelAxis: 'y' })
    expect(y.scaleX).toBe(x.scaleY)
    expect(y.scaleY).toBe(x.scaleX)
  })
})

describe('jellySpring', () => {
  it('is the shipped spring at the reference duration', () => {
    expect(jellySpring()).toEqual({ stiffness: JELLY.stiffness, damping: JELLY.damping })
    expect(jellySpring(JELLY_REFERENCE_MS)).toEqual({ stiffness: JELLY.stiffness, damping: JELLY.damping })
  })

  it('plays the same spring faster or slower without changing how bouncy it is', () => {
    const half = jellySpring(JELLY_REFERENCE_MS / 2)
    expect(half.stiffness).toBeCloseTo(JELLY.stiffness * 4, 9)
    expect(half.damping).toBeCloseTo(JELLY.damping * 2, 9)

    const ratio = ({ stiffness, damping }: { stiffness: number, damping: number }) => damping / (2 * Math.sqrt(stiffness))
    expect(ratio(jellySpring(220))).toBeCloseTo(ratio(jellySpring()), 9)
  })

  it('falls back to the reference for a duration that is not a positive number', () => {
    for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY])
      expect(jellySpring(bad)).toEqual({ stiffness: JELLY.stiffness, damping: JELLY.damping })
  })

  it('never plays faster than one step per frame can integrate', () => {
    // Semi-implicit Euler holds while k·dt² + 2c·dt < 4; check the stiffest
    // spring the indicator runs (size, ×sizeStiffnessScale) at the frame cap.
    const dt = JELLY.maxFrameS
    for (const durationMs of [100, 60, 20, 1]) {
      const { stiffness, damping } = jellySpring(durationMs)
      expect(stiffness * JELLY.sizeStiffnessScale * dt * dt + 2 * damping * dt).toBeLessThan(4)
    }
    expect(jellySpring(20)).toEqual(jellySpring(100))
  })
})
