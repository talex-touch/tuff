import { describe, expect, it } from 'vitest'
import {
  BEAD_VELOCITY_REF,
  beadPinchRatio,
  beadSpanAt,
  createCubicBezier,
  createLiquidMetrics,
  DETACH_AT,
  easeOutCubic,
  geometryAt,
  itemOpacityAt,
  LIQUID_DEFAULTS,
  normalizedVelocity,
  parseCubicBezier,
  resolveLiquidEase,
} from '../src/base-anchor-liquid'

/**
 * Reference geometry from the motion spec: a 200x40 trigger with offset 8 and a
 * 200x146 panel. In floating-layer local coordinates the trigger top sits at
 * -(40 + 8) = -48, so adding 48 to any local y recovers the spec's frame where
 * the trigger occupies y 0..40.
 */
const SPEC_FRAME_SHIFT = 48

function specMetrics() {
  return createLiquidMetrics({
    triggerTop: -SPEC_FRAME_SHIFT,
    triggerHeight: 40,
    panelHeight: 146,
    seedHeight: LIQUID_DEFAULTS.seedHeight,
  })
}

describe('baseAnchorLiquid: cubic-bezier', () => {
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

  it('falls back to the built-in curve when handed a gsap ease', () => {
    const resolved = resolveLiquidEase('back.out(2)', LIQUID_DEFAULTS.ease)
    const expected = createCubicBezier(0.23, 1, 0.32, 1)

    expect(resolved(0.5)).toBeCloseTo(expected(0.5), 6)
  })
})

describe('baseAnchorLiquid: geometry', () => {
  it('reproduces the spec geometry at both ends of p', () => {
    const metrics = specMetrics()

    const closed = geometryAt(0, metrics)
    expect(closed.top + SPEC_FRAME_SHIFT).toBeCloseTo(20, 5)
    expect(closed.height).toBeCloseTo(12, 5)

    const open = geometryAt(1, metrics)
    expect(open.top + SPEC_FRAME_SHIFT).toBeCloseTo(48, 5)
    expect(open.height).toBeCloseTo(146, 5)
  })

  it('starts the drop buried inside the trigger body', () => {
    const metrics = specMetrics()
    const closed = geometryAt(0, metrics)

    // Trigger spans 0..40 in the spec frame; the seed must sit entirely within it,
    // otherwise the panel reads as sliding out from behind rather than being torn off.
    expect(closed.top + SPEC_FRAME_SHIFT).toBeGreaterThanOrEqual(0)
    expect(closed.bottom + SPEC_FRAME_SHIFT).toBeLessThanOrEqual(40)
  })

  it('stops the top edge at the detach point while the height keeps filling', () => {
    const metrics = specMetrics()
    const atDetach = geometryAt(DETACH_AT, metrics)

    // The top edge has peeled all the way and stopped.
    expect(atDetach.top + SPEC_FRAME_SHIFT).toBeCloseTo(48, 5)

    // ...but the body is still filling: easeOutCubic(0.45) = 0.833625
    const expectedHeight = 12 + (146 - 12) * easeOutCubic(DETACH_AT)
    expect(expectedHeight).toBeCloseTo(123.71, 2)
    expect(atDetach.height).toBeCloseTo(expectedHeight, 5)

    // "already most of its body and still filling"
    expect(atDetach.height / 146).toBeGreaterThan(0.8)
    expect(atDetach.height).toBeLessThan(146)
  })

  it('keeps the top edge parked after the detach point', () => {
    const metrics = specMetrics()

    for (const p of [DETACH_AT, 0.6, 0.8, 1]) {
      expect(geometryAt(p, metrics).top).toBeCloseTo(metrics.topEnd, 5)
    }
  })

  it('defines height independently of the edges so the sheet can never collapse', () => {
    const base = specMetrics()
    // Two independent edges: drive topEnd far past where a bottom-minus-top model
    // would invert and clamp the panel to a thin line.
    const pathological = { ...base, topEnd: 5000 }

    for (const p of [0, 0.2, DETACH_AT, 0.75, 1]) {
      const sane = geometryAt(p, base)
      const broken = geometryAt(p, pathological)

      // Height is identical regardless of where the edges are — proof it is not bottom - top.
      expect(broken.height).toBeCloseTo(sane.height, 10)
      expect(broken.height).toBeGreaterThanOrEqual(base.seedHeight)
    }
  })

  it('grows the height monotonically and never overshoots the measured panel', () => {
    const metrics = specMetrics()
    let previous = -1

    for (let i = 0; i <= 40; i += 1) {
      const { height } = geometryAt(i / 40, metrics)
      expect(height).toBeGreaterThanOrEqual(previous)
      expect(height).toBeLessThanOrEqual(146)
      previous = height
    }
  })

  it('clamps the seed when the panel is shorter than it', () => {
    const metrics = createLiquidMetrics({
      triggerTop: -20,
      triggerHeight: 12,
      panelHeight: 6,
      seedHeight: 12,
    })

    expect(metrics.seedHeight).toBe(6)
    expect(geometryAt(0, metrics).height).toBeCloseTo(6, 5)
    expect(geometryAt(1, metrics).height).toBeCloseTo(6, 5)
  })
})

describe('baseAnchorLiquid: item reveal', () => {
  it('hides an item until the panel has grown to hold it', () => {
    // Hold point at 90px (the item's bottom edge); the panel has only filled to 40px.
    expect(itemOpacityAt(40, 90)).toBe(0)
    expect(itemOpacityAt(90, 90)).toBe(0)
    expect(itemOpacityAt(99, 90)).toBeCloseTo(0.5, 5)
    expect(itemOpacityAt(108, 90)).toBe(1)
    expect(itemOpacityAt(400, 90)).toBe(1)
  })

  it('keys every item off panel growth rather than the clock', () => {
    const metrics = specMetrics()
    const items = [20, 60, 100, 140].map(hold => hold)

    // Early in the animation only the items the panel has already grown past are visible.
    const early = geometryAt(0.1, metrics)
    const visibleEarly = items.filter(hold => itemOpacityAt(early.bottom, hold) > 0).length

    const late = geometryAt(1, metrics)
    const visibleLate = items.filter(hold => itemOpacityAt(late.bottom, hold) > 0).length

    expect(visibleEarly).toBeLessThan(visibleLate)
    expect(visibleLate).toBe(items.length)
  })
})

describe('baseAnchorLiquid: defaults', () => {
  it('opens in 260ms and closes markedly faster on a different curve', () => {
    expect(LIQUID_DEFAULTS.duration).toBe(260)
    expect(LIQUID_DEFAULTS.closeDuration).toBe(150)
    expect(LIQUID_DEFAULTS.closeDuration / LIQUID_DEFAULTS.duration).toBeLessThan(0.85)

    expect(LIQUID_DEFAULTS.ease).toBe('cubic-bezier(0.23, 1, 0.32, 1)')
    expect(LIQUID_DEFAULTS.closeEase).toBe('cubic-bezier(0.25, 0.46, 0.45, 0.94)')
    expect(LIQUID_DEFAULTS.closeEase).not.toBe(LIQUID_DEFAULTS.ease)
  })

  it('carries the goo filter constants from the motion spec', () => {
    expect(LIQUID_DEFAULTS.gooBlur).toBe(4.5)
    expect(LIQUID_DEFAULTS.gooThreshold).toBe(20)
    expect(LIQUID_DEFAULTS.gooThresholdOffset).toBe(-9)
  })
})

describe('baseAnchorLiquid: bead pinch', () => {
  it('reads a linear ramp as exactly average speed', () => {
    // A linear ramp covers dp == dt, so its normalised velocity is 1.0 at any duration.
    expect(normalizedVelocity(0.1, 0.1)).toBeCloseTo(1, 10)
    expect(normalizedVelocity(0.02, 0.02)).toBeCloseTo(1, 10)
    // Direction does not matter: closing pinches the same way opening does.
    expect(normalizedVelocity(-0.4, 0.1)).toBeCloseTo(4, 10)
    // Degenerate frames cannot produce a pinch.
    expect(normalizedVelocity(0.5, 0)).toBe(0)
    expect(normalizedVelocity(Number.NaN, 0.1)).toBe(0)
  })

  it('peaks the pinch at speed and decays it to nothing at rest', () => {
    expect(beadPinchRatio(0)).toBe(0)
    expect(beadPinchRatio(BEAD_VELOCITY_REF)).toBe(1)
    expect(beadPinchRatio(BEAD_VELOCITY_REF * 3)).toBe(1)
    expect(beadPinchRatio(BEAD_VELOCITY_REF / 2)).toBeCloseTo(0.5, 10)
  })

  it('draws the sheet in symmetrically about its own centre', () => {
    const full = beadSpanAt(200, 14, 0)
    expect(full).toEqual({ x: 0, width: 200 })

    const pinched = beadSpanAt(200, 14, 1)
    expect(pinched.x).toBe(14)
    expect(pinched.width).toBe(172)
    // Centre line is preserved, so the bead necks instead of sliding sideways.
    expect(pinched.x + pinched.width / 2).toBeCloseTo(100, 10)
  })

  it('never lets the pinch close the sheet', () => {
    // A zero-width rect would drop out of the goo field and snap the neck early.
    const crushed = beadSpanAt(20, 999, 1)
    expect(crushed.width).toBeGreaterThanOrEqual(1)
    expect(beadSpanAt(0, 14, 1).width).toBeGreaterThanOrEqual(1)
  })

  it('drives the pinch off the drop\'s own velocity profile', () => {
    const ease = createCubicBezier(0.23, 1, 0.32, 1)
    const step = 1 / 16
    const ratios: number[] = []
    let previous = 0
    for (let i = 1; i <= 16; i += 1) {
      const p = ease(i * step)
      ratios.push(beadPinchRatio(normalizedVelocity(p - previous, step)))
      previous = p
    }

    // Fastest at the very start, and fully relaxed by the time it settles.
    expect(ratios[0]).toBe(1)
    expect(ratios.at(-1)).toBeLessThan(0.05)
    // Monotonic decay: the pinch reports speed, and this curve only decelerates.
    for (let i = 1; i < ratios.length; i += 1)
      expect(ratios[i]!).toBeLessThanOrEqual(ratios[i - 1]! + 1e-9)
  })
})
