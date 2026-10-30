/**
 * The glass rim as geometry. A lens is flat in the middle and rises to its full thickness across the
 * bezel; how steeply it rises decides how hard a ray that crosses it bends. `createLensProfile` walks
 * the rise and reports, per step, how far that ray is carried sideways by the time it reaches the
 * backdrop: Snell's law at the surface, then a straight line through the glass.
 */

export type GlassLensProfile = 'squircle' | 'circle'

export interface LensProfileOptions {
  /** Width of the rising rim, px. */
  bezel: number
  /** Glass thickness under the flat middle, px. */
  thickness: number
  /** Index of refraction of the glass; the air outside is 1. */
  ior: number
  profile?: GlassLensProfile
  /** Steps from the rim to the bezel's inner edge, both included. */
  samples?: number
}

export interface LensProfile {
  /** Sideways carry in px, rim first. Positive carries the sample point towards the centre. */
  shifts: Float32Array
  /** The largest entry of `shifts`. */
  maximum: number
}

const DEFAULT_SAMPLES = 128
const MIN_IOR = 1
const MAX_IOR = 3

interface Surface {
  /** Height above the flat middle as a share of the bezel, `t` of the way in from the rim. */
  height: (t: number) => number
  /** Rise per unit of run at `t`, given its height `h`. Infinite at the rim, where the surface stands upright. */
  slope: (t: number, h: number) => number
}

const SURFACES: Record<GlassLensProfile, Surface> = {
  // A convex squircle: steep at the rim, then a long flat shoulder. Its slope is the exact derivative.
  squircle: {
    height: t => (1 - (1 - t) ** 4) ** 0.25,
    slope: (t, h) => (1 - t) ** 3 / h ** 3,
  },
  // A quarter circle: rounder shoulder, so the bend fades out sooner.
  circle: {
    height: t => Math.sqrt(1 - (1 - t) ** 2),
    slope: (t, h) => (1 - t) / h,
  },
}

export function createLensProfile(options: LensProfileOptions): LensProfile {
  const samples = Math.max(2, Math.round(options.samples ?? DEFAULT_SAMPLES))
  const bezel = Math.max(0, options.bezel)
  const thickness = Math.max(0, options.thickness)
  const ior = Math.min(MAX_IOR, Math.max(MIN_IOR, options.ior))
  const surface = SURFACES[options.profile ?? 'squircle']

  const shifts = new Float32Array(samples)
  let maximum = 0
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1)
    const h = surface.height(t)
    // A ray falling straight down meets a surface tilted by `incident` from the vertical.
    const incident = Math.atan(surface.slope(t, h))
    const refracted = Math.asin(Math.sin(incident) / ior)
    const shift = Math.tan(incident - refracted) * (thickness + h * bezel)
    shifts[i] = shift
    if (shift > maximum)
      maximum = shift
  }
  return { shifts, maximum }
}

/** The carry `distance` px inside the rim, interpolated; 0 from the bezel's inner edge on. */
export function lensShiftAt(profile: LensProfile, distance: number, bezel: number): number {
  if (!(bezel > 0) || !(distance < bezel))
    return 0
  const last = profile.shifts.length - 1
  const position = Math.max(0, distance) / bezel * last
  const index = Math.min(last - 1, Math.floor(position))
  const from = profile.shifts[index] ?? 0
  const to = profile.shifts[index + 1] ?? from
  return from + (to - from) * (position - index)
}
