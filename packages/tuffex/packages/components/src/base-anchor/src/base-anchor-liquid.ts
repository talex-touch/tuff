/**
 * Geometry and timing kernel shared by the two liquid anchor animations:
 * `drip` (constant-width sheet) and `bead` (width driven by p's velocity).
 *
 * Everything here is a pure function of one progress scalar `p` (0 closed,
 * 1 open) so the visual can be reasoned about — and unit tested — without a
 * layout engine. jsdom reports every offset as 0, so the component tests feed
 * metrics in directly rather than measuring.
 */

/** Progress at which the neck between trigger and panel has finished pinching. */
export const DETACH_AT = 0.45

/** How many pixels of panel growth an item fades across. */
export const ITEM_FADE_SPAN = 18

/**
 * Speed at which the bead pinch saturates, expressed in `p` per unit of
 * normalised time. A linear ramp travels at exactly 1.0, so 4 reads as
 * "four times the average pace squeezes the sheet as thin as it goes".
 */
export const BEAD_VELOCITY_REF = 4

export interface LiquidMetrics {
  /** Panel top edge at p=0, in floating-layer local coordinates (trigger centre). */
  topStart: number
  /** Panel top edge at p=1 — always 0, i.e. where floating-ui placed the panel. */
  topEnd: number
  /** Panel height at p=0. The drop has to start with *some* body to be torn off. */
  seedHeight: number
  /** Measured panel height at p=1. */
  panelHeight: number
}

export interface LiquidGeometry {
  top: number
  height: number
  /** Derived from top + height. Never fed back into height. */
  bottom: number
}

export const LIQUID_DEFAULTS = {
  duration: 260,
  closeDuration: 150,
  ease: 'cubic-bezier(0.23, 1, 0.32, 1)',
  closeEase: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  gooBlur: 4.5,
  gooThreshold: 20,
  gooThresholdOffset: -9,
  seedHeight: 12,
  itemSelector: '[data-liquid-item]',
  outlineColor: '#dcdfe6',
  /** `bead` only: how far each side may be drawn in at peak speed (px). */
  beadPinch: 14,
  beadVelocityRef: BEAD_VELOCITY_REF,
} as const

export function clamp01(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export function easeOutQuad(t: number): number {
  const x = clamp01(t)
  return x * (2 - x)
}

export function easeOutCubic(t: number): number {
  const x = clamp01(t)
  const inv = 1 - x
  return 1 - inv * inv * inv
}

/* ─── cubic-bezier ─── */

const NEWTON_ITERATIONS = 8
const NEWTON_MIN_SLOPE = 0.001
const SUBDIVISION_PRECISION = 1e-7
const SUBDIVISION_MAX_ITERATIONS = 12

function coeffA(a1: number, a2: number): number {
  return 1 - 3 * a2 + 3 * a1
}

function coeffB(a1: number, a2: number): number {
  return 3 * a2 - 6 * a1
}

function coeffC(a1: number): number {
  return 3 * a1
}

function bezierAt(t: number, a1: number, a2: number): number {
  return ((coeffA(a1, a2) * t + coeffB(a1, a2)) * t + coeffC(a1)) * t
}

function bezierSlopeAt(t: number, a1: number, a2: number): number {
  return 3 * coeffA(a1, a2) * t * t + 2 * coeffB(a1, a2) * t + coeffC(a1)
}

function solveForU(x: number, x1: number, x2: number): number {
  let u = x

  for (let i = 0; i < NEWTON_ITERATIONS; i += 1) {
    const slope = bezierSlopeAt(u, x1, x2)
    if (Math.abs(slope) < NEWTON_MIN_SLOPE)
      break
    u -= (bezierAt(u, x1, x2) - x) / slope
  }

  // Newton can walk out of range on flat segments; bisect back into it.
  if (u >= 0 && u <= 1 && Math.abs(bezierAt(u, x1, x2) - x) < SUBDIVISION_PRECISION)
    return u

  let low = 0
  let high = 1
  u = x
  for (let i = 0; i < SUBDIVISION_MAX_ITERATIONS; i += 1) {
    const current = bezierAt(u, x1, x2)
    if (Math.abs(current - x) < SUBDIVISION_PRECISION)
      return u
    if (current > x)
      high = u
    else
      low = u
    u = (high + low) / 2
  }

  return u
}

/**
 * Build a CSS-equivalent `cubic-bezier(x1, y1, x2, y2)` timing function.
 * Returns a pure `(t: 0..1) => 0..1` mapping.
 */
export function createCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const isLinear = x1 === y1 && x2 === y2
  return (t: number) => {
    const x = clamp01(t)
    if (isLinear || x === 0 || x === 1)
      return x
    return bezierAt(solveForU(x, x1, x2), y1, y2)
  }
}

const NUMBER_SOURCE = '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)'
const CUBIC_BEZIER_PATTERN = new RegExp(
  `^cubic-bezier\\(\\s*(${NUMBER_SOURCE})\\s*,\\s*(${NUMBER_SOURCE})\\s*,\\s*(${NUMBER_SOURCE})\\s*,\\s*(${NUMBER_SOURCE})\\s*\\)$`,
  'i',
)

/**
 * Parse a `cubic-bezier(...)` string into its four control values.
 *
 * Anything else — GSAP ease strings, keywords, and every spring formulation —
 * returns null. The liquid motion is specified as two fixed CSS curves and
 * must not silently accept a spring.
 */
export function parseCubicBezier(value: string | undefined | null): [number, number, number, number] | null {
  if (typeof value !== 'string')
    return null

  const match = CUBIC_BEZIER_PATTERN.exec(value.trim())
  if (!match)
    return null

  const points = [
    Number.parseFloat(match[1]!),
    Number.parseFloat(match[2]!),
    Number.parseFloat(match[3]!),
    Number.parseFloat(match[4]!),
  ] as [number, number, number, number]

  if (points.some(point => !Number.isFinite(point)))
    return null
  // CSS constrains the x controls to [0, 1]; outside that the curve is not a function of t.
  if (points[0] < 0 || points[0] > 1 || points[2] < 0 || points[2] > 1)
    return null

  return points
}

/** Resolve an ease string to a timing function, falling back to a known-good curve. */
export function resolveLiquidEase(value: string | undefined, fallback: string): (t: number) => number {
  const points = parseCubicBezier(value) ?? parseCubicBezier(fallback)
  if (!points)
    return (t: number) => clamp01(t)
  return createCubicBezier(points[0], points[1], points[2], points[3])
}

/* ─── geometry ─── */

/**
 * Normalise raw measurements into the metrics the geometry runs on.
 * Clamping the seed here keeps `geometryAt` a plain interpolation.
 */
export function createLiquidMetrics(input: {
  triggerTop: number
  triggerHeight: number
  panelHeight: number
  seedHeight: number
}): LiquidMetrics {
  const panelHeight = Math.max(0, input.panelHeight)
  return {
    // The drop starts buried in the middle of the trigger body.
    topStart: input.triggerTop + input.triggerHeight / 2,
    // floating-ui already solved where the panel belongs; local y 0 *is* that spot,
    // so flip/shift relocations need no compensation here.
    topEnd: 0,
    seedHeight: Math.max(0, Math.min(input.seedHeight, panelHeight)),
    panelHeight,
  }
}

/**
 * The panel is described by two falling edges, not by a box that grows.
 *
 * The top edge peels fast and stops at DETACH_AT; the height keeps filling
 * through the detach and past it. At the moment the neck snaps the panel is
 * already easeOutCubic(0.45) = 83.4% of its body and still filling.
 */
export function geometryAt(p: number, metrics: LiquidMetrics): LiquidGeometry {
  const progress = clamp01(p)
  const peel = easeOutQuad(clamp01(progress / DETACH_AT))
  const fill = easeOutCubic(progress)

  const top = metrics.topStart + (metrics.topEnd - metrics.topStart) * peel

  // Height is its own interpolation. Deriving it as bottom - top would let two
  // independent edges cross and clamp the sheet to a thin line.
  const height = Math.max(
    0,
    metrics.seedHeight + (metrics.panelHeight - metrics.seedHeight) * fill,
  )

  return { top, height, bottom: top + height }
}

/* ─── bead ─── */

/**
 * Speed of `p`, normalised so a linear ramp reads exactly 1.0.
 *
 * `dtNormalised` is the fraction of the whole timeline consumed by this frame,
 * which makes the result independent of both duration and refresh rate.
 */
export function normalizedVelocity(dp: number, dtNormalised: number): number {
  if (!Number.isFinite(dp) || !Number.isFinite(dtNormalised) || dtNormalised <= 0)
    return 0
  return Math.abs(dp) / dtNormalised
}

/**
 * How hard the sheet is squeezed right now, 0..1.
 *
 * This is the whole point of `bead`: the width reports the drop's own *speed*
 * rather than its progress, so the pinch peaks the instant the drop is falling
 * fastest and decays to nothing as the motion settles.
 */
export function beadPinchRatio(velocity: number, velocityRef: number = BEAD_VELOCITY_REF): number {
  const ref = velocityRef > 0 ? velocityRef : BEAD_VELOCITY_REF
  return clamp01(velocity / ref)
}

/**
 * Horizontal span of the sheet, drawn in symmetrically about its own centre so
 * the bead necks rather than sliding sideways.
 */
export function beadSpanAt(
  panelWidth: number,
  maxPinch: number,
  pinchRatio: number,
): { x: number, width: number } {
  const width = Math.max(0, panelWidth)
  // Never let the pinch close the sheet: a zero-width rect drops out of the goo
  // field entirely and the neck would snap early.
  const cap = Math.max(0, width / 2 - 1)
  const pinch = Math.min(Math.max(0, maxPinch), cap) * clamp01(pinchRatio)
  return { x: pinch, width: Math.max(1, width - pinch * 2) }
}

/**
 * Opacity for one item, keyed to the panel's own growth rather than the clock.
 *
 * `hold` is the item's bottom edge in panel-local coordinates; because the
 * panel's own bottom rises monotonically, an item cannot start appearing until
 * the panel has fully grown to hold it.
 */
export function itemOpacityAt(bottom: number, hold: number, span: number = ITEM_FADE_SPAN): number {
  const range = span > 0 ? span : ITEM_FADE_SPAN
  return clamp01((bottom - hold) / range)
}
