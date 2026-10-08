import { describe, expect, it } from 'vitest'
import { createCubicBezier, createSpringEase, parseCubicBezier, parseSpringEase, resolveCssEase } from '../animation/easing'

describe('easing: cubic-bezier', () => {
  it('pins the endpoints and rises monotonically across the open curve', () => {
    const ease = createCubicBezier(0.23, 1, 0.32, 1)

    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)

    let previous = -1
    for (let i = 0; i <= 20; i += 1) {
      const value = ease(i / 20)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('front-loads the open curve and stays ease-out on the close curve', () => {
    const open = createCubicBezier(0.23, 1, 0.32, 1)
    const close = createCubicBezier(0.25, 0.46, 0.45, 0.94)

    // Both curves are ease-out: past the halfway point of their own progress by mid-time.
    expect(open(0.5)).toBeGreaterThan(0.5)
    expect(close(0.5)).toBeGreaterThan(0.5)

    // The close curve is the shorter, shallower one — it must not simply mirror the open curve.
    expect(open(0.25)).toBeGreaterThan(close(0.25))
  })

  it('parses cubic-bezier strings and rejects every spring formulation', () => {
    expect(parseCubicBezier('cubic-bezier(0.23, 1, 0.32, 1)')).toEqual([0.23, 1, 0.32, 1])
    expect(parseCubicBezier('cubic-bezier(0.25,0.46,0.45,0.94)')).toEqual([0.25, 0.46, 0.45, 0.94])

    expect(parseCubicBezier('back.out(2)')).toBeNull()
    expect(parseCubicBezier('elastic.out(1, 0.4)')).toBeNull()
    expect(parseCubicBezier('spring(1, 80, 10, 0)')).toBeNull()
    expect(parseCubicBezier('power3.in')).toBeNull()
    expect(parseCubicBezier('ease-in-out')).toBeNull()
    expect(parseCubicBezier(undefined)).toBeNull()
    // x controls outside [0, 1] are not a function of t
    expect(parseCubicBezier('cubic-bezier(1.5, 0, 0.5, 1)')).toBeNull()
  })
})

describe('easing: spring', () => {
  it('starts at rest, overshoots once, and lands on exactly 1', () => {
    const ease = createSpringEase(10, 0.72)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)

    const samples = Array.from({ length: 201 }, (_, i) => ease(i / 200))
    const peak = Math.max(...samples)
    const peakAt = samples.indexOf(peak) / 200

    // One clean bounce: a few percent past the target, mid-timeline...
    expect(peak).toBeGreaterThan(1.02)
    expect(peak).toBeLessThan(1.12)
    expect(peakAt).toBeGreaterThan(0.3)
    expect(peakAt).toBeLessThan(0.6)

    // ...then an exponential settle. The signal still oscillates through 1, so
    // the deviation itself is not monotone — its ENVELOPE is: from any point
    // past the peak, the worst deviation still to come never grows.
    const start = Math.ceil(peakAt * 200)
    const suffixMax: number[] = []
    let worst = 0
    for (let i = 200; i >= start; i -= 1) {
      worst = Math.max(worst, Math.abs(samples[i]! - 1))
      suffixMax[i] = worst
    }
    for (let i = start; i < 200; i += 1)
      expect(suffixMax[i]!).toBeGreaterThanOrEqual(suffixMax[i + 1]! - 1e-9)
    expect(Math.abs(ease(0.95) - 1)).toBeLessThan(0.01)
  })

  it('heavier damping trades bounce for glide', () => {
    const bouncy = createSpringEase(10, 0.6)
    const damped = createSpringEase(10, 0.95)
    const peakOf = (ease: (t: number) => number) =>
      Math.max(...Array.from({ length: 201 }, (_, i) => ease(i / 200)))
    expect(peakOf(bouncy)).toBeGreaterThan(peakOf(damped))
    expect(peakOf(damped)).toBeLessThan(1.01)
  })

  it('parses the spring vocabulary and nothing else', () => {
    expect(parseSpringEase('spring')).toBeTypeOf('function')
    expect(parseSpringEase('spring(10, 0.72)')).toBeTypeOf('function')
    expect(parseSpringEase('SPRING(8)')).toBeTypeOf('function')

    // Defaults flow in for the short forms.
    expect(parseSpringEase('spring')!(0.45)).toBeCloseTo(createSpringEase()(0.45), 12)
    expect(parseSpringEase('spring(10)')!(0.45)).toBeCloseTo(createSpringEase(10, 0.72)(0.45), 12)

    expect(parseSpringEase('back.out(2)')).toBeNull()
    expect(parseSpringEase('cubic-bezier(0.32, 0.72, 0, 1)')).toBeNull()
    expect(parseSpringEase('spring()')).toBeNull()
    expect(parseSpringEase(undefined)).toBeNull()
  })
})

describe('easing: css', () => {
  it('evaluates the keywords as the cubic-bezier curves CSS defines them by', () => {
    const definitions: Array<[string, [number, number, number, number]]> = [
      ['ease', [0.25, 0.1, 0.25, 1]],
      ['ease-in', [0.42, 0, 1, 1]],
      ['ease-out', [0, 0, 0.58, 1]],
      ['ease-in-out', [0.42, 0, 0.58, 1]],
    ]
    for (const [keyword, [x1, y1, x2, y2]] of definitions) {
      const ease = resolveCssEase(keyword)
      const reference = createCubicBezier(x1, y1, x2, y2)
      for (const t of [0, 0.2, 0.5, 0.8, 1])
        expect(ease(t), `${keyword} @ ${t}`).toBeCloseTo(reference(t), 12)
    }

    // ASCII case-insensitive, as in CSS.
    expect(resolveCssEase('Ease-In-Out')(0.3)).toBeCloseTo(createCubicBezier(0.42, 0, 0.58, 1)(0.3), 12)
    for (const t of [0, 0.25, 0.5, 1])
      expect(resolveCssEase('linear')(t)).toBe(t)
  })

  it('evaluates cubic-bezier strings with the shared solver, overshooting controls included', () => {
    const ease = resolveCssEase('cubic-bezier(0.3, 1.05, 0.4, 1)')
    const reference = createCubicBezier(0.3, 1.05, 0.4, 1)
    for (const t of [0.1, 0.5, 0.9])
      expect(ease(t)).toBeCloseTo(reference(t), 12)
  })

  it('reads a linear() list as evenly spaced stops and holds its end stops outside the domain', () => {
    const ease = resolveCssEase('linear(0, 0.25, 1)')
    expect(ease(0)).toBe(0)
    expect(ease(0.25)).toBeCloseTo(0.125, 12)
    expect(ease(0.5)).toBeCloseTo(0.25, 12)
    expect(ease(0.75)).toBeCloseTo(0.625, 12)
    expect(ease(1)).toBe(1)
    expect(ease(-1)).toBe(0)
    expect(ease(2)).toBe(1)
  })

  it('degrades anything else to a clamped linear ramp instead of returning null', () => {
    // A spring and a gsap name are not CSS; a stop with its own percentage,
    // a one-stop list and an x control outside [0, 1] are not supported or
    // not valid; a prototype key must not read as a keyword.
    const specs = ['spring(10, 0.6)', 'back.out(2)', 'linear(0.5 50%, 1)', 'linear(1)', 'cubic-bezier(1.5, 0, 0.5, 1)', 'constructor', undefined, null]
    for (const spec of specs) {
      const ease = resolveCssEase(spec)
      expect(ease(0.4), String(spec)).toBeCloseTo(0.4, 12)
      expect(ease(-1), String(spec)).toBe(0)
      expect(ease(2), String(spec)).toBe(1)
    }
  })

  it('hands back the same function for the same spec, so a frame loop can call it every frame', () => {
    expect(resolveCssEase('ease-out')).toBe(resolveCssEase('ease-out'))
    expect(resolveCssEase('linear(0, 1)')).toBe(resolveCssEase('linear(0, 1)'))
  })
})
