/**
 * The six cones of TxPrismGlow, left to right in the reduced-motion frame.
 *
 * Every timing is a multiple of the component's `duration`: `period` is how long one crossing
 * takes, `breath` one swell, `phase` the start offset. The phase is negative so the flow is
 * already running on the first frame. The periods differ pairwise, so the cones keep catching
 * each other up: merging on the way past, splitting again after.
 */
export interface PrismGlowCone {
  /** Hue angle in the spectrum palette (oklch degrees). */
  hue: number
  /** Hue offset from `--tx-color-primary` in the accent palette. */
  shift: number
  period: number
  phase: number
  breath: number
  /** Base scale of the beam. */
  size: number
}

export const PRISM_GLOW_CONES: readonly PrismGlowCone[] = [
  { hue: 350, shift: -40, period: 1.03, phase: -0.06, breath: 0.38, size: 1 },
  { hue: 95, shift: 60, period: 1.27, phase: -0.48, breath: 0.52, size: 0.9 },
  { hue: 205, shift: -20, period: 0.9, phase: -0.6, breath: 0.45, size: 1.05 },
  { hue: 300, shift: 40, period: 1.38, phase: -1.02, breath: 0.58, size: 0.85 },
  { hue: 150, shift: 20, period: 1.15, phase: -0.87, breath: 0.42, size: 0.95 },
  { hue: 258, shift: 0, period: 0.98, phase: -0.28, breath: 0.48, size: 1 },
]
