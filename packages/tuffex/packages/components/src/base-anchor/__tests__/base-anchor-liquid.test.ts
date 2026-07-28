import { describe, expect, it } from 'vitest'
import {
  BEAD_VELOCITY_REF,
  beadPinchRatio,
  beadSpanAt,
  createCubicBezier,
  createLiquidMetrics,
  DETACH_AT,
  easeOutCubic,
  easeSlopeAt,
  fillSlopeAt,
  geometryAt,
  itemOpacityAt,
  LIQUID_DEFAULTS,
  liquidVelocityAt,
  NECK_CLIP_MIN,
  neckClipAt,
  parseCubicBezier,
  peelAt,
  peelSlopeAt,
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

  it('treats linear as a first-class value, not a fallback', () => {
    // p is meant to advance linearly: the two per-edge easings are the only
    // shaping, and a master curve on top of them compounds into ~8th-order
    // ease-out that collapses the whole drop into about two frames at 60Hz.
    const linear = resolveLiquidEase('linear', LIQUID_DEFAULTS.ease)
    for (const t of [0, 0.25, 0.5, 0.75, 1])
      expect(linear(t)).toBeCloseTo(t, 10)

    // A gsap ease is rejected and falls back to the default, which is linear.
    expect(resolveLiquidEase('back.out(2)', LIQUID_DEFAULTS.ease)(0.5)).toBeCloseTo(0.5, 10)
    // An explicit curve is still honoured.
    const curved = resolveLiquidEase('cubic-bezier(0.23, 1, 0.32, 1)', LIQUID_DEFAULTS.ease)
    expect(curved(0.5)).toBeCloseTo(createCubicBezier(0.23, 1, 0.32, 1)(0.5), 10)
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

    expect(LIQUID_DEFAULTS.ease).toBe('linear')
    expect(LIQUID_DEFAULTS.closeEase).toBe('cubic-bezier(0.25, 0.46, 0.45, 0.94)')
    expect(LIQUID_DEFAULTS.closeEase).not.toBe(LIQUID_DEFAULTS.ease)
  })

  it('carries the goo filter constants from the motion spec', () => {
    expect(LIQUID_DEFAULTS.gooBlur).toBe(4.5)
    expect(LIQUID_DEFAULTS.gooThreshold).toBe(20)
    expect(LIQUID_DEFAULTS.gooThresholdOffset).toBe(-9)
  })
})

/** The frame sequence `runLiquid` writes for an open run, as pinch ratios. */
function openPinchRatios(frameMs: number, durationMs = LIQUID_DEFAULTS.duration) {
  const ease = resolveLiquidEase(LIQUID_DEFAULTS.ease, LIQUID_DEFAULTS.ease)
  const ratios: number[] = []
  for (let frame = 0; ; frame += 1) {
    const t = Math.min(1, (frame * frameMs) / durationMs)
    const p = ease(t)
    ratios.push(beadPinchRatio(liquidVelocityAt(p, t, ease)))
    if (t >= 1)
      return ratios
  }
}

describe('baseAnchorLiquid: bead pinch', () => {
  it('differentiates the peel analytically', () => {
    // easeOutQuad(x) = 2x - x² over x = p / DETACH_AT, so the slope leaves at
    // 2 / DETACH_AT and falls linearly to nothing at the detach.
    expect(peelSlopeAt(0)).toBeCloseTo(2 / DETACH_AT, 10)
    expect(peelSlopeAt(DETACH_AT / 2)).toBeCloseTo(1 / DETACH_AT, 10)
    expect(peelSlopeAt(DETACH_AT)).toBe(0)
    // Past the detach the top edge is parked, so there is nothing left to report.
    expect(peelSlopeAt(0.9)).toBe(0)
  })

  it('differentiates the fill analytically, and never saturates it', () => {
    // easeOutCubic(x) = 1 - (1-x)³, so the slope is 3(1-x)².
    expect(fillSlopeAt(0)).toBeCloseTo(3, 10)
    expect(fillSlopeAt(0.5)).toBeCloseTo(0.75, 10)
    expect(fillSlopeAt(1)).toBe(0)

    // The point of mixing it in: unlike the peel it is still alive past the detach.
    expect(peelSlopeAt(DETACH_AT)).toBe(0)
    expect(fillSlopeAt(DETACH_AT)).toBeGreaterThan(0.9)
  })

  it('differentiates an ease without consulting the frame clock', () => {
    const linear = resolveLiquidEase('linear', LIQUID_DEFAULTS.ease)
    // A linear ramp travels at exactly 1.0 per unit of timeline, endpoints included.
    expect(easeSlopeAt(linear, 0)).toBeCloseTo(1, 6)
    expect(easeSlopeAt(linear, 0.5)).toBeCloseTo(1, 6)
    expect(easeSlopeAt(linear, 1)).toBeCloseTo(1, 6)

    // A cubic-bezier ends on the slope of its trailing handle, (1 - y2) / (1 - x2).
    const closing = resolveLiquidEase(LIQUID_DEFAULTS.closeEase, LIQUID_DEFAULTS.closeEase)
    expect(easeSlopeAt(closing, 1)).toBeCloseTo((1 - 0.94) / (1 - 0.45), 1)
  })

  it('reports the speed the drop actually leaves at, not a standing start', () => {
    const ease = resolveLiquidEase(LIQUID_DEFAULTS.ease, LIQUID_DEFAULTS.ease)
    // Backward differencing had no sample before t=0 and fell back to zero, so the
    // seed frame drew the sheet at full width and the next one snapped it to full
    // pinch. The closed form has a value at t=0 like it has one anywhere else.
    expect(liquidVelocityAt(0, 0, ease)).toBeCloseTo(2 / DETACH_AT, 6)
    expect(beadPinchRatio(liquidVelocityAt(0, 0, ease))).toBe(1)

    // Direction does not matter: closing pinches the same way opening does.
    const closeVelocity = liquidVelocityAt(0.1, 0.9, resolveLiquidEase('linear', LIQUID_DEFAULTS.ease))
    expect(closeVelocity).toBeGreaterThan(0)
  })

  it('peaks the pinch at speed and decays it to nothing at rest', () => {
    expect(beadPinchRatio(0)).toBe(0)
    expect(beadPinchRatio(BEAD_VELOCITY_REF)).toBe(1)
    expect(beadPinchRatio(BEAD_VELOCITY_REF * 3)).toBe(1)
    expect(beadPinchRatio(BEAD_VELOCITY_REF / 2)).toBeCloseTo(0.5, 10)
  })

  it('draws the sheet in symmetrically about its own centre', () => {
    const full = beadSpanAt(200, 60, 0)
    expect(full).toEqual({ x: 0, width: 200 })

    const pinched = beadSpanAt(200, 60, 1)
    expect(pinched.x).toBe(60)
    expect(pinched.width).toBe(80)
    // Centre line is preserved, so the bead necks instead of sliding sideways.
    expect(pinched.x + pinched.width / 2).toBeCloseTo(100, 10)
  })

  it('necks well inside the trigger it is torn from', () => {
    // The whole point of the default: the sheet has to read as visibly narrower
    // than the 200px trigger, not as a barely-inset copy of it.
    const narrowest = beadSpanAt(200, LIQUID_DEFAULTS.beadPinch, 1).width
    expect(narrowest / 200).toBeLessThan(0.45)

    // ...but still far too wide for the goo field to dissolve. A 4.5px blur needs
    // the sheet down around single digits before the threshold stops seeing it.
    expect(narrowest).toBeGreaterThan(LIQUID_DEFAULTS.gooBlur * 8)
  })

  it('never lets the pinch close the sheet', () => {
    // A zero-width rect would drop out of the goo field and snap the neck early.
    const crushed = beadSpanAt(20, 999, 1)
    expect(crushed.width).toBeGreaterThanOrEqual(1)
    expect(beadSpanAt(0, 14, 1).width).toBeGreaterThanOrEqual(1)
  })

  it('rides the moving edges rather than p, which is linear and carries no speed', () => {
    const ratios = openPinchRatios(1000 / 60)

    // Fastest as the drop breaks away, dead still only once everything has stopped.
    expect(ratios[0]).toBe(1)
    expect(ratios.at(-1)).toBe(0)
    // Monotonic decay: both slopes only ever decelerate, so their max does too.
    for (let i = 1; i < ratios.length; i += 1)
      expect(ratios[i]!).toBeLessThanOrEqual(ratios[i - 1]! + 1e-9)

    // Reading p directly would pin the pinch open forever: a linear ramp has a
    // constant derivative, so it never decays.
    const linear = resolveLiquidEase('linear', LIQUID_DEFAULTS.ease)
    expect(easeSlopeAt(linear, 0.1)).toBeCloseTo(easeSlopeAt(linear, 0.9), 6)
  })

  it('opens without a width pop on the first animated frame', () => {
    const width = LIQUID_DEFAULTS.beadPinch * 2
    const widths = openPinchRatios(1000 / 60)
      .map(ratio => beadSpanAt(200, LIQUID_DEFAULTS.beadPinch, ratio).width)

    // The seed frame is already necked. Differencing reported 0 there, so the
    // sheet stood at full width for one frame and then jumped the entire pinch
    // — the whole travel, in a single frame, at every refresh rate.
    expect(widths[0]).toBe(200 - width)

    let largestJump = 0
    for (let i = 1; i < widths.length; i += 1)
      largestJump = Math.max(largestJump, Math.abs(widths[i]! - widths[i - 1]!))
    // One frame's share of a ramp that spans DETACH_AT, not the whole travel at once.
    expect(largestJump).toBeLessThan(width / 4)
  })

  it('derives the same pinch at any refresh rate', () => {
    const at60 = openPinchRatios(1000 / 60)
    const at120 = openPinchRatios(1000 / 120)

    // Same point in the timeline, same pinch: a 120Hz display samples the ramp
    // twice as often, it does not squeeze the sheet differently.
    expect(at120[0]).toBeCloseTo(at60[0]!, 10)
    expect(at120[2]).toBeCloseTo(at60[1]!, 10)
    expect(at120[4]).toBeCloseTo(at60[2]!, 10)
  })

  it('bounds the content by the necked sheet', () => {
    // Symmetric, so the rows are cropped about the same centre line the sheet necks about.
    expect(neckClipAt(60)).toBe('inset(0 60px 0 60px)')
    // No pinch, no crop: `drip` and a settled `bead` leave the panel alone.
    expect(neckClipAt(0)).toBe('none')
    expect(neckClipAt(-3)).toBe('none')
  })

  it('never lets a row extend past the sheet drawing it', () => {
    const configured = LIQUID_DEFAULTS.beadPinch
    const ease = resolveLiquidEase(LIQUID_DEFAULTS.ease, LIQUID_DEFAULTS.ease)

    for (let frame = 0; ; frame += 1) {
      const t = Math.min(1, (frame * (1000 / 60)) / LIQUID_DEFAULTS.duration)
      const p = ease(t)
      const ratio = beadPinchRatio(t >= 1 ? 0 : liquidVelocityAt(p, t, ease))
      const span = beadSpanAt(200, configured, ratio)

      // The crop is the pinch, so the visible content box is the sheet — there is
      // no depth of pinch that can leave a row hanging outside it. The only slack
      // is the sub-pixel floor that releases the clip once it stops cropping.
      const clip = neckClipAt(span.x)
      const cropped = clip === 'none' ? 200 : 200 - span.x * 2
      expect(cropped).toBeLessThanOrEqual(span.width + NECK_CLIP_MIN * 2)

      if (t >= 1)
        break
    }
  })

  it('keeps reporting speed after the neck has snapped', () => {
    const ease = resolveLiquidEase(LIQUID_DEFAULTS.ease, LIQUID_DEFAULTS.ease)

    // The top edge is parked at the detach...
    expect(peelAt(DETACH_AT)).toBe(1)
    expect(peelSlopeAt(DETACH_AT)).toBe(0)
    // ...but the body is only 83% filled, so the sheet is still under tension.
    // Keyed to the peel alone this was 0 and the sheet slammed back to full width
    // with more than half the animation still to run.
    expect(liquidVelocityAt(DETACH_AT, DETACH_AT, ease)).toBeGreaterThan(0.9)
    expect(liquidVelocityAt(0.9, 0.9, ease)).toBeGreaterThan(0)

    // It reaches nothing only when the panel does.
    expect(liquidVelocityAt(1, 1, ease)).toBe(0)
  })

  it('spreads the pinch across the whole drop, not just the peel', () => {
    const ratios = openPinchRatios(1000 / 60)
    const alive = ratios.filter(ratio => ratio > 0).length

    // DETACH_AT of a 260ms open is about 7 frames at 60Hz. The pinch has to
    // outlast that by a wide margin or it is back to being cut off mid-drop.
    expect(alive).toBeGreaterThan(12)

    // Still a decay, not a plateau: past the detach it is a thin residual tension,
    // not the tear.
    const atDetach = ratios[Math.round(DETACH_AT * ratios.length)]!
    expect(atDetach).toBeLessThan(0.3)
    expect(atDetach).toBeGreaterThan(0)
  })
})
