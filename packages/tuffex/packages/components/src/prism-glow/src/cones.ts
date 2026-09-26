/**
 * The six cones of TxPrismGlow, left to right in the reduced-motion frame.
 *
 * Every timing is a multiple of the component's `duration`: `period` is how long one crossing
 * takes, `breath` one swell, `phase` the start offset. The phase is negative so the flow is
 * already running on the first frame. The periods differ pairwise, so the cones keep catching
 * each other up: merging on the way past, splitting again after.
 *
 * The phases also decide which cones set off together: 2 travels with 6 for the first
 * 0.4 × duration (the whole of a CoreBox search), and 3, 4 and 5 start out together near the
 * right edge and come back in together on the left. On a dark surface overlaps add up towards
 * white, so any two hues merge cleanly. On a light one they blend `normal`, and an overlap is
 * the average of the two colours: hues more than about 120° apart average to grey, which is how
 * blue over yellow read olive-grey. So a light surface trades cone 2's yellow for cone 4's
 * purple, and every group that sets off together stays within 120°. The accent palette spans
 * 100° in all, so it needs no light order.
 */
export interface PrismGlowCone {
  /** Hue angle in the spectrum palette on a dark surface (oklch degrees). */
  hue: number
  /** Hue angle in the spectrum palette on a light surface: the same six hues, cones 2 and 4 traded. */
  lightHue: number
  /** Hue offset from `--tx-color-primary` in the accent palette. */
  shift: number
  period: number
  phase: number
  breath: number
  /** Base scale of the beam. */
  size: number
}

export const PRISM_GLOW_CONES: readonly PrismGlowCone[] = [
  { hue: 350, lightHue: 350, shift: -40, period: 1.03, phase: -0.06, breath: 0.38, size: 1 },
  { hue: 95, lightHue: 300, shift: 60, period: 1.27, phase: -0.48, breath: 0.52, size: 0.9 },
  { hue: 205, lightHue: 205, shift: -20, period: 0.9, phase: -0.6, breath: 0.45, size: 1.05 },
  { hue: 300, lightHue: 95, shift: 40, period: 1.38, phase: -1.02, breath: 0.58, size: 0.85 },
  { hue: 150, lightHue: 150, shift: 20, period: 1.15, phase: -0.87, breath: 0.42, size: 0.95 },
  { hue: 258, lightHue: 258, shift: 0, period: 0.98, phase: -0.28, breath: 0.48, size: 1 },
]
