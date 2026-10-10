// TuffEx addition — not part of the voice-glow port (see voice-driver.ts).

/**
 * Organic motion: each part of the glow rising and falling on its own while a
 * voice is heard (the `organic` prop).
 *
 * A manual `level` tells the driver only how loud the voice is. Upstream gives
 * the lobes a little life from it (two out-of-phase wobbles on the synthesised
 * bands), but the mirrored lobes share a band, and the ceiling, the bend and
 * the band line all scale with the one level — so what reads is a symmetric
 * arch that grows and shrinks as a whole. These signals break that: every lobe
 * gets its own height and drift, the band line its own bumps, and the arch a
 * sway, a lean and a crest of its own.
 *
 * Every signal is a sine on a period of its own plus smoothed value noise. The
 * periods are primes in hundredths of a second, so no two ever line up and the
 * pattern does not visibly repeat; the noise draws a new value about twice a
 * second of organic time, so successive words land in different shapes without
 * the shape twitching inside one. All of them return −1 … 1: the driver scales
 * them by the voice level, so silence is still, and by its own px budgets.
 */

const TWO_PI = Math.PI * 2

/** Integer hash of (seed, n) to [0, 1): deterministic on every engine, no state. */
function hash01(seed: number, n: number): number {
  let h = Math.imul(n | 0, 0x27D4EB2D) ^ Math.imul((seed | 0) + 0x165667B1, 0x9E3779B1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85EBCA77)
  h ^= h >>> 13
  h = Math.imul(h, 0xC2B2AE3D)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * Value noise in −1 … 1: a random value at every integer, eased between with
 * the quintic fade, so neither the value nor its slope jumps at a lattice point.
 */
function valueNoise(seed: number, x: number): number {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * f * (f * (f * 6 - 15) + 10)
  const a = hash01(seed, i)
  const b = hash01(seed, i + 1)
  return (a + (b - a) * u) * 2 - 1
}

/**
 * Two octaves of value noise at an irrational ratio, −1 … 1. One octave eases
 * into every lattice point and the pause there shows as a beat; the second,
 * off the first's grid, fills it in.
 */
export function organicNoise(seed: number, x: number): number {
  return 0.7 * valueNoise(seed, x) + 0.3 * valueNoise(seed + 101, x * 2.17 + 0.37)
}

/** Each lobe's own period, s: primes in hundredths, one per lobe. */
const LOBE_PERIODS = [0.89, 1.07, 1.31, 0.97, 1.13, 1.39, 1.51] as const
/** How often each lobe draws a new random height, per s of organic time: about twice a second at full voice. */
const LOBE_RATES = [2.1, 2.3, 2.7, 1.9, 2.5, 2.9, 2.0] as const
/** Spreads the lobes' sine phases evenly round the circle (the golden angle). */
const GOLDEN_ANGLE = 2.39996

/** Lobe `index`'s height at organic time `t`, −1 … 1. */
export function organicLobeLift(index: number, t: number): number {
  const period = LOBE_PERIODS[index % LOBE_PERIODS.length]!
  const rate = LOBE_RATES[index % LOBE_RATES.length]!
  return 0.65 * organicNoise(17 + index, t * rate)
    + 0.35 * Math.sin((TWO_PI * t) / period + index * GOLDEN_ANGLE)
}

/** Lobe `index`'s sideways drift at organic time `t`, −1 … 1 — slower than its height. */
export function organicLobeShift(index: number, t: number): number {
  const period = LOBE_PERIODS[index % LOBE_PERIODS.length]! * 1.618
  const rate = LOBE_RATES[index % LOBE_RATES.length]! * 0.6
  return 0.6 * organicNoise(53 + index, t * rate)
    + 0.4 * Math.sin((TWO_PI * t) / period + index * GOLDEN_ANGLE * 1.3)
}

/** The whole arch's sway, −1 … 1: two periods (1.73 s, 2.89 s) that never line up. */
export function organicSway(t: number): number {
  return 0.62 * Math.sin((TWO_PI * t) / 1.73) + 0.38 * Math.sin((TWO_PI * t) / 2.89 + 1.1)
}

/** Which way the band's bell leans, −1 … 1: added to its skew, so one side runs long. */
export function organicLean(t: number): number {
  return 0.55 * Math.sin((TWO_PI * t) / 2.31 + 0.4) + 0.45 * organicNoise(211, t * 0.9)
}

/** How far the arch's crest rises past its share of the level, −1 … 1. */
export function organicCrest(t: number): number {
  return 0.6 * organicNoise(307, t * 1.9) + 0.4 * Math.sin((TWO_PI * t) / 1.19 + 2.2)
}

/**
 * The band line's bumps. Each wave sits on a wavelength that is no divisor of
 * the bell, drifts slowly on a period of its own, and has an amplitude that
 * wanders through zero on value noise — so its bumps rise, sink and change
 * sides in place rather than the whole line breathing or a pattern scrolling by.
 * The noise is lifted ×2.4 and clipped: raw, it rarely leaves the middle of
 * its range, and three of them summed barely moved the line (rms 0.17).
 */
const RIPPLE_WAVES = [
  { cycles: 0.85, drift: 3.7, rate: 1.3, phase: 0.3, weight: 0.5 },
  { cycles: 1.55, drift: 2.9, rate: 1.7, phase: 2.1, weight: 0.32 },
  { cycles: 2.6, drift: 2.3, rate: 2.3, phase: 4.0, weight: 0.18 },
] as const
const RIPPLE_LIFT = 2.4

/** One frame of the band line's bumps: each wave's amplitude and drift at one instant. */
export interface OrganicRippleFrame {
  amplitude: number[]
  shift: number[]
}

/**
 * The bumps' state at organic time `t`, written into `out`. Computed once per
 * frame: only where along the line each sample sits changes between samples.
 */
export function organicRippleFrame(t: number, out: OrganicRippleFrame): OrganicRippleFrame {
  for (let i = 0; i < RIPPLE_WAVES.length; i++) {
    const wave = RIPPLE_WAVES[i]!
    out.amplitude[i] = Math.max(-1, Math.min(1, RIPPLE_LIFT * organicNoise(401 + i, t * wave.rate)))
    out.shift[i] = TWO_PI * (t / wave.drift) + wave.phase
  }
  return out
}

/** The band line's displacement at `u` (−1 … 1 across the bell) for one frame, −1 … 1. */
export function organicRippleAt(u: number, frame: OrganicRippleFrame): number {
  let v = 0
  for (let i = 0; i < RIPPLE_WAVES.length; i++) {
    const wave = RIPPLE_WAVES[i]!
    v += wave.weight * frame.amplitude[i]! * Math.sin(TWO_PI * wave.cycles * u + frame.shift[i]!)
  }
  return v
}

/** The band line's displacement at `u` and organic time `t`, −1 … 1: both steps at once. */
export function organicRipple(u: number, t: number): number {
  return organicRippleAt(u, organicRippleFrame(t, { amplitude: [], shift: [] }))
}
