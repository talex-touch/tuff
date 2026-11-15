/** Must equal the Miko default body color in packages/tuffex/packages/components/src/miko/src/types.ts. */
export const PET_BASE_COLOR = '#9726D9'
export const PET_POISON_COLOR = { l: 0.72, c: 0.15, h: 140 }
export const PET_MOOD_HUE = 330

export interface Oklch {
  l: number
  c: number
  h: number
}

function srgbToLinear(channel: number): number {
  const v = channel / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(linear: number): number {
  const v = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

export function hexToOklch(hex: string): Oklch {
  const n = Number.parseInt(hex.replace('#', ''), 16)
  const r = srgbToLinear((n >> 16) & 255)
  const g = srgbToLinear((n >> 8) & 255)
  const b = srgbToLinear(n & 255)
  const l1 = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m1 = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s1 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const lab = 0.2104542553 * l1 + 0.793617785 * m1 - 0.0040720468 * s1
  const a = 1.9779984951 * l1 - 2.428592205 * m1 + 0.4505937099 * s1
  const bb = 0.0259040371 * l1 + 0.7827717662 * m1 - 0.808675766 * s1
  let h = (Math.atan2(bb, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l: lab, c: Math.hypot(a, bb), h }
}

export function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (h * Math.PI) / 180
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = linearToSrgb(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1)
  const g = linearToSrgb(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1)
  const bl = linearToSrgb(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1)
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export interface PetTint {
  lift?: number
  chroma?: number
  hue?: number
  hueMix?: number
}

export function tintColor(base: string, tint: PetTint): string {
  const from = hexToOklch(base)
  let hue = from.h
  if (tint.hue !== undefined) {
    const delta = ((tint.hue - from.h + 540) % 360) - 180
    hue = (from.h + delta * (tint.hueMix ?? 1) + 360) % 360
  }
  return oklchToHex({
    l: Math.min(1, Math.max(0, from.l + (tint.lift ?? 0))),
    c: from.c * (tint.chroma ?? 1),
    h: hue
  })
}

export function fixedColor(lightness: number, chroma: number, hue: number): string {
  return oklchToHex({ l: lightness, c: chroma, h: hue })
}

export function mixHex(from: string, to: string, t: number): string {
  const read = (hex: string) => [0, 2, 4].map((i) => Number.parseInt(hex.slice(1 + i, 3 + i), 16))
  const a = read(from)
  const b = read(to)
  const k = Math.min(1, Math.max(0, t))
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * k)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`
}
