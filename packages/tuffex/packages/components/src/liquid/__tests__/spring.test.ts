import type { TransitionPreset } from '../src/spring'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { easingFunction, resolveTransition, springSteps } from '../src/spring'

const PRESETS: TransitionPreset[] = ['snappy', 'smooth', 'bouncy']
const FRAME = 1 / 60

beforeAll(() => {
  // jsdom has no CSS.supports, so resolveTransition would fall back to a
  // cubic-bezier that is not the spring at all. The comparison below needs the
  // compiled `linear()` list; the support probe is memoised on first use, so
  // the stub has to be in place before anything in this file resolves a preset.
  vi.stubGlobal('CSS', { supports: () => true })
})

describe('springSteps', () => {
  it('positive control: the compiled curve is the linear() spring, not the fallback', () => {
    expect(resolveTransition('smooth').easing.startsWith('linear(')).toBe(true)
  })

  it('traces the curve resolveTransition compiles for the same preset, within 1%', () => {
    for (const preset of PRESETS) {
      const { duration, easing } = resolveTransition(preset)
      const curve = easingFunction(easing)
      const seconds = duration / 1000
      let position = 0
      let velocity = 0
      let worst = 0
      for (let t = FRAME; t <= seconds; t += FRAME) {
        ;[position, velocity] = springSteps(position, velocity, 1, preset, FRAME)
        worst = Math.max(worst, Math.abs(position - curve(t / seconds)))
      }
      expect(worst, preset).toBeLessThan(0.01)
      expect(position, preset).toBeCloseTo(1, 2)
    }
  })

  it('lands on the target after a 2 s frame instead of diverging', () => {
    for (const preset of PRESETS) {
      const [position, velocity] = springSteps(0, 0, 240, preset, 2)
      expect(Number.isFinite(position), preset).toBe(true)
      expect(position, preset).toBeCloseTo(240, 1)
      expect(Math.abs(velocity), preset).toBeLessThan(0.5)
    }
  })

  it('agrees with itself however the time is sliced', () => {
    // One 100 ms frame and six 16.7 ms frames cover the same wall time.
    const [whole] = springSteps(0, 0, 100, 'bouncy', 0.1)
    let position = 0
    let velocity = 0
    for (let i = 0; i < 6; i++)
      [position, velocity] = springSteps(position, velocity, 100, 'bouncy', 0.1 / 6)
    expect(Math.abs(position - whole)).toBeLessThan(0.5)
  })

  it('keeps its velocity when the target moves mid-flight', () => {
    let position = 0
    let velocity = 0
    for (let i = 0; i < 8; i++)
      [position, velocity] = springSteps(position, velocity, 100, 'smooth', FRAME)
    expect(velocity).toBeGreaterThan(100)

    // Retarget further out and look 1 ms later: the velocity can only have
    // bent by 1 ms of acceleration, so it is continuous across the retarget.
    const step = 0.001
    const [, carried] = springSteps(position, velocity, 160, 'smooth', step)
    const bound = (190 * Math.abs(160 - position) + 26 * Math.abs(velocity)) * step * 1.05
    expect(Math.abs(carried - velocity)).toBeLessThanOrEqual(bound)
    expect(bound).toBeLessThan(velocity * 0.2)

    // What a restarted curve does instead: from rest, the same 1 ms moves at
    // a fraction of the speed the value already had.
    const [, restarted] = springSteps(position, 0, 160, 'smooth', step)
    expect(restarted).toBeLessThan(velocity * 0.2)
  })

  it('accepts a raw spring config and ignores a non-positive dt', () => {
    const [position] = springSteps(0, 0, 10, { stiffness: 400, damping: 40 }, 1)
    expect(position).toBeCloseTo(10, 3)
    expect(springSteps(3, 7, 10, 'snappy', 0)).toEqual([3, 7])
    expect(springSteps(3, 7, 10, 'snappy', Number.NaN)).toEqual([3, 7])
  })

  it('never hands a frame loop NaN, whatever an untyped caller passes', () => {
    // A loop sleeps only once its springs are at rest, and NaN never is: before
    // this guard `{ stiffness: undefined }` spread over the default and made
    // every frame NaN, and an unknown preset name threw inside the rAF tick.
    const frame = 1 / 60
    expect(springSteps(0, 0, 10, 'nope' as never, frame)).toEqual(springSteps(0, 0, 10, 'smooth', frame))
    const defaults = springSteps(0, 0, 10, {}, frame)
    for (const config of [{ stiffness: undefined }, { damping: Number.NaN }, { mass: Number.POSITIVE_INFINITY }, null])
      expect(springSteps(0, 0, 10, config as never, frame), JSON.stringify(config)).toEqual(defaults)
    // Diverging on purpose (negative stiffness) still ends on the target, not
    // on Infinity or NaN.
    const [position, velocity] = springSteps(0, 0, 10, { stiffness: -1e6 }, 5)
    expect([position, velocity]).toEqual([10, 0])
  })
})
