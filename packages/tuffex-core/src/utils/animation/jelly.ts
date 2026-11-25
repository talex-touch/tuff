/**
 * The jelly: the elastic deformation of Radio's button-group indicator
 * (`useJellyIndicator` on its default `jelly` material) and the Slider thumb.
 * The tab-like family — Tabs, TabBar, FlatRadio, SidebarNav — rides the same
 * engine on its `glide` material (`GLIDE` below), which never scales.
 *
 * One pure function turns "how fast is it travelling, how hard did it just
 * land" into a non-uniform scale, so the controls squash and stretch as one
 * material. The numbers are the Radio indicator's — it shipped first and its
 * feel is the reference — and they live here so no component can drift from
 * the others by editing a literal.
 */

export type JellyAxis = 'x' | 'y'

export interface JellyScaleInput {
  /** Travel speed right now, px/s. */
  speed: number
  /**
   * Axis the shape travels along. The shipped numbers are the Radio indicator's,
   * which travels on x: it thins along the travel and swells across it. `'y'`
   * turns that same deformation through 90° for a vertical track. Defaults to
   * `'x'`, which is bit-for-bit the original.
   */
  travelAxis?: JellyAxis
  /** Landing energy, 0–1. Set on a reversal or a hard stop, decays every frame. */
  impact: number
  /** Axis the landing happened along: the shape spreads across it and thins along the other. */
  impactAxis: JellyAxis
  /** `false` switches stretch and squash both off; only `baseScale × phaseScale` remains. */
  elastic: boolean
  /** Whether the shape is travelling. Stretch needs motion; a landing squash does not. */
  moving: boolean
  /** Multiplies the stretch while the pointer holds the shape (`JELLY.heldStretchBoost`), 1 when free. */
  dragBoost: number
  /** Uniform scale under the deformation: held, emerging or idle. */
  baseScale: number
  /** Uniform scale of the motion phase: emerge pop, sink thud, or 1. */
  phaseScale: number
}

export interface JellyScale {
  scaleX: number
  scaleY: number
}

/**
 * Shared tuning. Every value is the Radio indicator's shipped number; the
 * slider maps its own events onto them rather than inventing a second set.
 */
export const JELLY = {
  /** Spring the shape rides while free — `TxRadioGroup`'s `stiffness` / `damping` defaults. */
  stiffness: 110,
  damping: 12,
  /** Uniform scale while the pointer holds the shape. */
  heldScale: 1.08,
  /** Extra stretch while held: a held body deforms more readily than a coasting one. */
  heldStretchBoost: 1.8,
  /** The grab pop and the landing thud, as uniform scales, with their lifetimes in ms. */
  emergeScale: 1.08,
  emergeMs: 110,
  sinkScale: 0.97,
  sinkMs: 32,
  /** Per-second exponential decay rates: pointer velocity while held; impact while held / while free. */
  velocityDecay: 6,
  impactDecayHeld: 7.4,
  impactDecayFree: 4,
  /** A reversal above `reversalSpeed` px/s lands with `speed / reversalImpactScale` of impact. */
  reversalSpeed: 30,
  reversalImpactScale: 300,
  /** Slamming into an end above `edgeSpeed` px/s lands with `edgeImpact`. */
  edgeSpeed: 520,
  edgeImpact: 0.92,
  /** Share of the release velocity carried into the settle spring. */
  releaseKick: 0.14,
  /** The spring is settled below this displacement (px) and speed (px/s). */
  settleDistance: 0.25,
  settleSpeed: 8,
  /**
   * Uniform scale while the indicator travels on its own: the pop for the first
   * `travelEmergeMs` of a trip, then the cruising scale until it settles.
   */
  travelEmergeScale: 1.06,
  travelScale: 1.03,
  travelEmergeMs: 170,
  /** The position spring runs this much softer while emerging, so the trip eases out of rest. */
  emergeStiffnessScale: 0.62,
  /** Width and height ride a slightly stiffer spring than position, so size lands first. */
  sizeStiffnessScale: 1.12,
  /** Size spring while the pointer holds the shape (position follows the pointer directly). */
  heldStiffness: 112,
  heldDamping: 9,
  /**
   * `elastic: false`: exponential follow at this rate per second, no overshoot,
   * settled inside `rigidSettleDistance` px, then a `rigidSinkMs` landing.
   */
  rigidFollow: 34,
  rigidSettleDistance: 0.35,
  rigidSinkMs: 18,
  /** Longest frame integrated in one step, s. A stalled tab would otherwise blow the spring up. */
  maxFrameS: 0.024,
} as const

/**
 * The duration the shipped spring corresponds to: TxTabs' default
 * `animation.indicator.durationMs`, which is where a duration first met the
 * spring.
 */
export const JELLY_REFERENCE_MS = 350

/**
 * The shortest duration `jellySpring` plays. The indicator integrates once per
 * frame, at most `JELLY.maxFrameS`, and a spring much quicker than the
 * reference outruns that step: at the frame cap it diverges below about 78ms.
 */
const JELLY_MIN_MS = 100

/**
 * The shared spring, played faster or slower as a whole. Time-scaling a spring
 * multiplies its natural frequency by `f` and its damping coefficient by `f`,
 * so the damping ratio — how bouncy it is — stays put: the same jelly, only
 * quicker. Lets a duration-shaped prop (`indicatorDuration`,
 * `animation.indicator.durationMs`) keep meaning something on a spring.
 * Durations under `JELLY_MIN_MS` play as that minimum.
 */
export function jellySpring(durationMs: number = JELLY_REFERENCE_MS): { stiffness: number, damping: number } {
  return timeScaleSpring(JELLY, durationMs, JELLY_REFERENCE_MS)
}

/**
 * Any spring played `referenceMs / durationMs` times faster (or slower), its
 * damping ratio kept — the same motion on a different clock. Durations under
 * `JELLY_MIN_MS` play as that minimum; a non-positive or non-finite one plays
 * the reference.
 */
export function timeScaleSpring(
  spring: { stiffness: number, damping: number },
  durationMs: number,
  referenceMs: number,
): { stiffness: number, damping: number } {
  const valid = Number.isFinite(durationMs) && durationMs > 0
  const f = referenceMs / (valid ? Math.max(durationMs, JELLY_MIN_MS) : referenceMs)
  return {
    stiffness: spring.stiffness * f * f,
    damping: spring.damping * f,
  }
}

/**
 * The glide material (`useJellyIndicator({ material: 'glide' })`): the tabs
 * family's indicator. No squash and no stretch — the shape only ever changes
 * position and size. Its two ends ride separate springs: the leading one
 * (this spring, a hair under critical damping, so it arrives without a visible
 * overshoot in about 250ms) and a trailing one played `1 − lag / 2` as fast, so
 * the indicator lengthens a little on the way and gathers as it arrives.
 */
export const GLIDE = {
  stiffness: 420,
  damping: 38,
  /** 0 slides rigidly; above 0.85 the trailing end would barely follow. */
  lag: 0.45,
} as const

/** Stretch only starts above this speed; under it the shape reads as at rest. */
const STRETCH_SPEED_FLOOR = 3

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function jellyScale(input: JellyScaleInput): JellyScale {
  let stretchX = 1
  let stretchY = 1

  if (input.elastic && input.moving && input.speed > STRETCH_SPEED_FLOOR) {
    // A body being pulled: thins along the travel and swells across it.
    const stretch = Math.min(input.speed / 100, 0.6) * input.dragBoost
    const along = 1 - stretch * 0.35
    const across = 1 + stretch * 0.6
    if (input.travelAxis === 'y') {
      stretchX = across
      stretchY = along
    }
    else {
      stretchX = along
      stretchY = across
    }
  }

  if (input.elastic && input.impact > 0.01) {
    // The landing: spread along the impact axis, thinned along the other.
    const squash = input.impact * 0.7
    if (input.impactAxis === 'x') {
      stretchX *= 1 + squash * 0.5
      stretchY *= 1 - squash * 0.4
    }
    else {
      stretchY *= 1 + squash * 0.5
      stretchX *= 1 - squash * 0.4
    }
  }

  const uniform = input.baseScale * (input.elastic ? input.phaseScale : 1)
  return {
    scaleX: clamp(uniform * stretchX, 0, 2),
    scaleY: clamp(uniform * stretchY, 0, 2),
  }
}
