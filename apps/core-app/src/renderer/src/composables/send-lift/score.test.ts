import { describe, expect, it } from 'vitest'
import {
  fillAt,
  LIFT_SCORE,
  liftOrigin,
  predictLanding,
  rampedSpring,
  rectGap,
  sampleSpringCurve,
  travelProgress
} from './score'

describe('liftOrigin', () => {
  it("puts the bubble's first line on the draft's: padding off, the taller line box centred", () => {
    expect(
      liftOrigin({
        line: { left: 57, top: 717 },
        inset: { left: 14, top: 10 },
        inputLineHeight: 21,
        bubbleLineHeight: 22.4
      })
    ).toEqual({ left: 43, top: 717 - 10 - 0.7 })
  })

  it('centres a multi-line block, splitting the taller line boxes above and below', () => {
    const origin = liftOrigin({
      line: { left: 57, top: 717 },
      inset: { left: 14, top: 10 },
      inputLineHeight: 21,
      bubbleLineHeight: 22.4,
      lines: 4
    })
    expect(origin.top).toBeCloseTo(717 - 10 - 2.8, 6)
  })
})

describe('fillAt', () => {
  it('shows no fill on the composer, all of it well before the landing, and never goes back', () => {
    expect(fillAt(0)).toBe(0)
    expect(fillAt(LIFT_SCORE.fillFrom)).toBe(0)
    expect(fillAt(LIFT_SCORE.fillTo)).toBe(1)
    expect(fillAt(1)).toBe(1)
    let last = 0
    for (let p = 0; p <= 1; p += 0.02) {
      expect(fillAt(p)).toBeGreaterThanOrEqual(last)
      last = fillAt(p)
    }
  })
})

describe('the spring', () => {
  it('is iOS-like: about a 0.40s response, damping ratio about 0.84', () => {
    const { stiffness, damping, mass } = LIFT_SCORE.spring
    const response = (2 * Math.PI) / Math.sqrt(stiffness / mass)
    const ratio = damping / (2 * Math.sqrt(stiffness * mass))
    expect(response).toBeCloseTo(0.4, 2)
    expect(ratio).toBeCloseTo(0.84, 2)
  })

  it("gives the conversation's first message a slower, softer spring and dock", () => {
    const { stiffness, damping, mass } = LIFT_SCORE.openingSpring
    const response = (2 * Math.PI) / Math.sqrt(stiffness / mass)
    const ratio = damping / (2 * Math.sqrt(stiffness * mass))
    expect(response).toBeCloseTo(0.62, 2)
    expect(ratio).toBeCloseTo(0.86, 2)
  })

  it('eases the pull in without changing the damping ratio', () => {
    const base = LIFT_SCORE.openingSpring
    const start = rampedSpring(base, 0, 320, 0.06)
    expect(start.stiffness).toBeCloseTo(base.stiffness * 0.06, 5)
    const ratio = (s: { stiffness: number; damping: number }) =>
      s.damping / (2 * Math.sqrt(s.stiffness))
    expect(ratio(start)).toBeCloseTo(ratio(base), 6)
    expect(rampedSpring(base, 320, 320, 0.06)).toEqual(base)
    expect(rampedSpring(base, 0, 0, 0.06)).toBe(base)
  })

  it('peels the first message off slowly: ~5% of the way by 100ms, half by ~300ms, at rest in ~1s', () => {
    const { duration, frames } = sampleSpringCurve(
      LIFT_SCORE.openingSpring,
      LIFT_SCORE.openingRampMs,
      LIFT_SCORE.openingRampFloor
    )
    const at = (ms: number) =>
      frames.reduce((b, f) =>
        Math.abs(f.o * duration - ms) < Math.abs(b.o * duration - ms) ? f : b
      ).x
    expect(at(100)).toBeLessThan(0.08)
    expect(at(300)).toBeGreaterThan(0.4)
    expect(at(300)).toBeLessThan(0.7)
    expect(duration).toBeGreaterThan(850)
    expect(duration).toBeLessThan(1300)
    expect(frames.at(-1)).toEqual({ o: 1, x: 1, v: 0 })
    // Monotonic enough to be a dock: never backs off by more than a hair.
    for (let i = 1; i < frames.length; i++)
      expect(frames[i].x).toBeGreaterThan(frames[i - 1].x - 0.02)
  })
})

describe('predictLanding / travelProgress / rectGap', () => {
  it('adds the glide the stream still owes, and nothing for a thread that fits', () => {
    const rect = { left: 620, top: 500, width: 140, height: 42.4 }
    expect(
      predictLanding(rect, { scrollTop: 100, scrollHeight: 1400, clientHeight: 900 }).top
    ).toBe(100)
    expect(predictLanding(rect, { scrollTop: 0, scrollHeight: 700, clientHeight: 900 }).top).toBe(
      500
    )
    expect(predictLanding(rect, null)).toEqual(rect)
  })

  it('measures travel and gaps', () => {
    expect(travelProgress(700, 300, 500)).toBe(0.5)
    expect(travelProgress(300, 300, 300)).toBe(1)
    expect(
      rectGap(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 0.2, top: -0.4, width: 10, height: 10.1 }
      )
    ).toBeCloseTo(0.4)
  })
})
