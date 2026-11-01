import type { LensShape } from './geometry'
import type { GlassLensProfile } from './profile'
import { normalizeLensShape } from './geometry'

export interface LensParamsInput {
  width: number
  height: number
  borderRadius: number
  bezel?: number
  thickness?: number
  ior?: number
  refraction?: number
  zoom?: number
  profile?: GlassLensProfile
  rimLight?: number
  rimSaturation?: number
  dispersion?: number
}

export interface LensParams {
  shape: LensShape
  thickness: number
  ior: number
  strength: number
  zoom: number
  profile: GlassLensProfile
  rimLight: number
  rimSaturation: number
  dispersion: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Fills in what the caller left out. The rim and the glass thickness default to shares of the short
 * side, so a small thumb gets a thin rim and a large pill a deep one instead of one fixed look.
 */
export function resolveLensParams(input: LensParamsInput): LensParams {
  const short = Math.max(1, Math.min(input.width, input.height))
  const bezel = Math.max(0, finite(input.bezel, clamp(short * 0.12, 4, 10)))
  return {
    shape: normalizeLensShape(input.width, input.height, finite(input.borderRadius, 20), bezel),
    thickness: Math.max(0, finite(input.thickness, clamp(short * 0.2, 8, 24))),
    ior: clamp(finite(input.ior, 1.5), 1, 3),
    strength: Math.max(0, finite(input.refraction, 1)),
    zoom: Math.max(1, finite(input.zoom, 1)),
    profile: input.profile ?? 'squircle',
    rimLight: Math.max(0, finite(input.rimLight, 1)),
    rimSaturation: Math.max(0, finite(input.rimSaturation, 1)),
    dispersion: clamp(finite(input.dispersion, 0), 0, 0.5),
  }
}
