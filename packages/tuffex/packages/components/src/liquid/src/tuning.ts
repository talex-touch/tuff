// Ported from liquid-gooey/src/LiquidItem.tsx (knob → raw physics mapping)
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.

import type { DissolveOptions, MorphTuning, MoveTuning } from './types'
import { EVOLVE_DEFAULTS, MOVE_DEFAULTS, type EvolveOptions, type MoveOptions } from './observer'

/** Damping ratio from a 0..1 bounciness knob. 0.5 lands exactly on the tuned
 *  defaults' ratio (≈0.45); 0 is critically damped; 1 is very springy. */
function zeta(bounce: number): number {
  return Math.max(0.12, 1 - 1.1 * Math.min(1, Math.max(0, bounce)))
}

export function mapMorphSprings(t: MorphTuning | undefined): EvolveOptions {
  const s = Math.max(0.25, t?.speed ?? 1)
  // Damping scales with ζ(bounce)/ζ(0.5) so (speed 1, bounce 0.5) reproduces
  // EVOLVE_DEFAULTS exactly; stiffness × s² + damping × s keeps the ratio, so
  // `speed` changes tempo without changing character.
  const k = zeta(t?.bounce ?? 0.5) / zeta(0.5)
  return {
    massStiffness: EVOLVE_DEFAULTS.massStiffness * s * s,
    massDamping: EVOLVE_DEFAULTS.massDamping * s * k,
    sizeStiffness: EVOLVE_DEFAULTS.sizeStiffness * s * s,
    sizeDamping: EVOLVE_DEFAULTS.sizeDamping * s * k,
    // The radius spring stays critically damped at every bounce setting — the
    // roundness envelope supplies the liquid look; a bouncing radius reads as
    // flicker, not jelly.
    radiusStiffness: EVOLVE_DEFAULTS.radiusStiffness * s * s,
    radiusDamping: EVOLVE_DEFAULTS.radiusDamping * s,
    cornerDuration: EVOLVE_DEFAULTS.cornerDuration / s,
    contentBlur: t?.contentBlur ?? EVOLVE_DEFAULTS.contentBlur,
  }
}

export function mapDissolve(d: boolean | number): DissolveOptions {
  const k = typeof d === 'number' ? Math.min(1, Math.max(0, d)) : 1
  // `strength` is the engine's own ceiling: it scales warp/blur/gravity/mix
  // AND the hole that erases the image's edge together, so a weak dissolve
  // reads as a shallower liquid rather than an erased edge with nothing
  // there to justify it. Geometry (zone/range) and motion character (taper/
  // churn) stay at the tuned values regardless of strength.
  return {
    warp: 26,
    blur: 8,
    mix: 0.7,
    gravity: 60,
    taper: 1,
    warpFreq: 1.7,
    flowSpeed: 22,
    detail: 2,
    zone: 18,
    range: 49,
    releaseMs: 110,
    strength: k,
  }
}

export function mapMove(t: MoveTuning | undefined): MoveOptions {
  const p = Math.min(1, Math.max(0, t?.springiness ?? 0.5))
  // Exponential feel curve centred on the default: 0 → ~120, 0.5 → 380,
  // 1 → ~1200. Damping rescales with √stiffness and ζ(wobble) so the default
  // knob positions reproduce MOVE_DEFAULTS exactly.
  const stiffness = MOVE_DEFAULTS.stiffness * 10 ** (p - 0.5)
  const damping
    = MOVE_DEFAULTS.damping
      * Math.sqrt(stiffness / MOVE_DEFAULTS.stiffness)
      * (zeta(t?.wobble ?? 0.5) / zeta(0.5))
  return {
    stiffness,
    damping,
    stretch: 0.5 * Math.min(1, Math.max(0, t?.stretch ?? 0.36)),
    tail: 0.8 * Math.min(1, Math.max(0, t?.trail ?? 0.575)),
    ...t?.advanced,
  }
}
