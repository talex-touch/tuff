/**
 * The library's timing curves, one implementation each, for two readers.
 *
 * GSAP parses its own vocabulary (`power2.out`, `back.out(2)`), but
 * `spring(omega, zeta)` and a CSS `cubic-bezier(...)` are unknown names to it,
 * and it falls back to its default ease without a warning. It does accept a
 * plain progress function, so `resolveGsapEase` turns those two into one and
 * passes GSAP's own names through.
 *
 * Motion a script drives on its own clock but that must follow a CSS curve —
 * a rAF loop standing in for a CSS transition — evaluates it with
 * `resolveCssEase`.
 *
 * The builders map progress `t` in 0..1 to a curve that starts at 0 and lands
 * on exactly 1 (a spring passes beyond 1 on the way); a CSS `linear(...)` list
 * returns whatever its stops say.
 */

function clamp01(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
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
 * returns null, so a caller that only takes a fixed CSS curve (the liquid
 * anchor motion) can reject the rest instead of silently accepting a spring.
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

/* ─── spring ─── */

const SPRING_PATTERN = new RegExp(
  `^spring\\(\\s*(${NUMBER_SOURCE})\\s*(?:,\\s*(${NUMBER_SOURCE})\\s*)?\\)$`,
  'i',
)

/**
 * Closed-form underdamped spring, normalised to the timeline: `omega` is the
 * undamped angular frequency in radians across the whole duration, `zeta` the
 * damping ratio. Starts from rest, crosses the target once, overshoots by
 * roughly `e^(-zeta·omega·π/ωd)` and settles on an exponential tail.
 *
 * This exists because a bounce assembled from power segments (`back.out`) has
 * corners in its velocity — the spring's derivative is smooth everywhere,
 * which is the difference between 弹 and 弹得丝滑.
 *
 * Normalised by its own end value so the curve lands on exactly 1 regardless
 * of the residual the exponential still carries at t = 1.
 *
 * Not `stepSpring`: that integrates a value frame by frame on wall-clock time
 * and keeps its velocity through a retarget. This is a fixed curve over a
 * timeline's own progress, which is what a tween's `ease` has to be.
 */
export function createSpringEase(omega = 10, zeta = 0.72): (t: number) => number {
  const w = Math.max(1, omega)
  const z = Math.min(0.999, Math.max(0.05, zeta))
  const wd = w * Math.sqrt(1 - z * z)
  const decay = z * w
  const raw = (x: number) =>
    1 - Math.exp(-decay * x) * (Math.cos(wd * x) + (decay / wd) * Math.sin(wd * x))
  const end = raw(1)
  return (t: number) => {
    const x = clamp01(t)
    if (x === 0 || x === 1)
      return x
    return raw(x) / end
  }
}

/**
 * Parse `spring` / `spring(omega)` / `spring(omega, zeta)` into a timing
 * function. Anything else returns null — notably gsap's own vocabulary, which
 * must keep passing through as strings.
 */
export function parseSpringEase(value: string | undefined | null): ((t: number) => number) | null {
  if (typeof value !== 'string')
    return null

  const raw = value.trim()
  if (raw.toLowerCase() === 'spring')
    return createSpringEase()

  const match = SPRING_PATTERN.exec(raw)
  if (!match)
    return null

  const omega = Number.parseFloat(match[1]!)
  if (!Number.isFinite(omega))
    return null
  const zeta = match[2] != null ? Number.parseFloat(match[2]) : undefined
  if (zeta != null && !Number.isFinite(zeta))
    return null
  return createSpringEase(omega, zeta)
}

/* ─── gsap ─── */

/**
 * Turn an ease string into something GSAP will run as written: a spring or a
 * CSS bezier becomes a progress function, and GSAP's own vocabulary passes
 * through untouched so `back.out(2)` keeps its exact native curve.
 */
export function resolveGsapEase(value: string): string | ((t: number) => number) {
  const spring = parseSpringEase(value)
  if (spring)
    return spring
  const points = parseCubicBezier(value)
  if (!points)
    return value
  return createCubicBezier(points[0], points[1], points[2], points[3])
}

/* ─── css ─── */

/** The CSS easing keywords, as the cubic-bezier curves the spec defines them by. */
const CSS_EASE_KEYWORDS = new Map<string, [number, number, number, number]>([
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-in', [0.42, 0, 1, 1]],
  ['ease-out', [0, 0, 0.58, 1]],
  ['ease-in-out', [0.42, 0, 0.58, 1]],
])

const LINEAR_STOPS_PATTERN = /^linear\(([^)]+)\)$/i

/**
 * Stops of a CSS `linear(...)` list, read as evenly spaced: the form the liquid
 * spring compiler (`resolveTransition`) emits. A stop that carries its own
 * percentage is not supported and fails the parse rather than being misread.
 */
function parseLinearStops(value: string): number[] | null {
  const match = LINEAR_STOPS_PATTERN.exec(value)
  if (!match)
    return null
  const stops = match[1]!.split(',').map(stop => Number(stop.trim()))
  if (stops.length < 2 || stops.some(stop => !Number.isFinite(stop)))
    return null
  return stops
}

function createLinearStopsEase(stops: number[]): (t: number) => number {
  const last = stops.length - 1
  return (t: number) => {
    if (!(t > 0))
      return stops[0]!
    if (t >= 1)
      return stops[last]!
    const f = t * last
    const i = Math.floor(f)
    return stops[i]! + (stops[i + 1]! - stops[i]!) * (f - i)
  }
}

const clampedLinear = (t: number) => clamp01(t)
const cssEaseCache = new Map<string, (t: number) => number>()

/**
 * Evaluate a CSS timing function in JS: a `cubic-bezier(...)`, a `linear(...)`
 * stop list, or a keyword (`linear`, `ease`, `ease-in`, `ease-out`,
 * `ease-in-out`). Never returns null — anything else, a non-string included,
 * degrades to a clamped linear ramp. Cached per spec, so a frame loop can call
 * it every frame.
 */
export function resolveCssEase(spec: string | undefined | null): (t: number) => number {
  if (typeof spec !== 'string')
    return clampedLinear
  let ease = cssEaseCache.get(spec)
  if (ease)
    return ease

  const raw = spec.trim()
  const points = CSS_EASE_KEYWORDS.get(raw.toLowerCase()) ?? parseCubicBezier(raw)
  const stops = points ? null : parseLinearStops(raw)
  ease = points
    ? createCubicBezier(points[0], points[1], points[2], points[3])
    : stops ? createLinearStopsEase(stops) : clampedLinear
  cssEaseCache.set(spec, ease)
  return ease
}
