export function clamp(x: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, x))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2
}

export function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2
}

/**
 * Periodic hold-morph envelope on phase `u` in `[0, 1)`:
 * holds at 0 -> eases to 1 -> holds at 1 -> eases back to 0.
 */
export function holdMorph(
  u: number,
  holdLow = 0.16,
  rise = 0.24,
  holdHigh = 0.24,
  fall = 0.22,
): number {
  const p = ((u % 1) + 1) % 1
  if (p < holdLow)
    return 0
  if (p < holdLow + rise)
    return easeInOutCubic((p - holdLow) / rise)
  if (p < holdLow + rise + holdHigh)
    return 1
  if (p < holdLow + rise + holdHigh + fall)
    return 1 - easeInOutCubic((p - holdLow - rise - holdHigh) / fall)
  return 0
}

/** Deterministic integer hash for smooth 2D gradient-style value noise. */
function hash2(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/** Smooth deterministic 2D value noise returning values in `[-1, 1]`. */
export function noise2(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1
}

/** Continuous halftone size ratio vs normalized horizontal coordinate `nx` in `[-1, 1]`. */
export function halftoneRatio(nx: number, taper: number): number {
  const s = clamp((nx + 0.82) / 1.64, 0, 1)
  const graded = 0.38 + 0.60 * Math.pow(s, 0.88)
  return lerp(0.76, graded, clamp(taper, 0, 1.5))
}

/** 2D spherical bulge / fisheye optical warp in normalized coordinates `[-1, 1]`. */
export function sphericalWarp(
  x: number,
  y: number,
  bulge: number,
  lensX: number,
  lensY: number,
  oxShift: number,
): [number, number] {
  const dx = (x - lensX) / 1.08
  const dy = (y - lensY) / 1.08
  const r2 = dx * dx + dy * dy
  const fac = 1.0 + bulge * 0.22 * (1.18 - r2)
  return [
    lensX + oxShift * bulge + dx * 1.08 * fac,
    lensY + dy * 1.08 * fac,
  ]
}

/** Normalize grid resolution to an odd integer within `[3, 9]`. */
export function normalizeGridSize(gridSize: number): number {
  const rounded = Math.round(Number.isFinite(gridSize) ? gridSize : 5)
  const clamped = clamp(rounded, 3, 9)
  return clamped % 2 === 0 ? Math.min(9, clamped + 1) : clamped
}

/** 4×4 Bayer ordered dithering threshold matrix normalized to `(0, 1)`. */
export const BAYER_4X4: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
].map(v => (v + 0.5) / 16)
