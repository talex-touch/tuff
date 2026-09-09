/**
 * The jelly: the elastic deformation shared by the Radio button-group indicator
 * and the Slider thumb.
 *
 * One pure function turns "how fast is it travelling, how hard did it just
 * land" into a non-uniform scale, so the two controls squash and stretch as one
 * material. The numbers are the Radio indicator's — it shipped first and its
 * feel is the reference — and they live here so neither component can drift
 * from the other by editing a literal.
 */

export type JellyAxis = 'x' | 'y'

export interface JellyScaleInput {
  /** Travel speed right now, px/s. */
  speed: number
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
    // A body being pulled: thins across the travel, lengthens along the other axis.
    const stretch = Math.min(input.speed / 100, 0.6) * input.dragBoost
    stretchX = 1 - stretch * 0.35
    stretchY = 1 + stretch * 0.6
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
