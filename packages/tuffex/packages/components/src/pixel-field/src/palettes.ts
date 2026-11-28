import type { PixelFieldPalette, PixelFieldPaletteName } from './types'

type RgbTuple = [number, number, number]

export const PIXEL_FIELD_DARK_PALETTES: Readonly<Record<PixelFieldPaletteName, PixelFieldPalette>> = Object.freeze({
  emerald: {
    shadow: '#114226',
    mid: '#2fc96d',
    bright: '#8df5c0',
    highlight: '#effef7',
    backdrop: '#040506',
  },
  violet: {
    shadow: '#2b1a5e',
    mid: '#8b5cf6',
    bright: '#c4b5fd',
    highlight: '#f5f3ff',
    backdrop: '#050408',
  },
  cyan: {
    shadow: '#0c3a4f',
    mid: '#22d3ee',
    bright: '#a5f3fc',
    highlight: '#f0fdff',
    backdrop: '#040608',
  },
  amber: {
    shadow: '#4a2809',
    mid: '#f59e0b',
    bright: '#fde68a',
    highlight: '#fffbeb',
    backdrop: '#070503',
  },
  mono: {
    shadow: '#30343d',
    mid: '#8e96a6',
    bright: '#d8dde8',
    highlight: '#ffffff',
    backdrop: '#050506',
  },
})

export const PIXEL_FIELD_LIGHT_PALETTES: Readonly<Record<PixelFieldPaletteName, PixelFieldPalette>> = Object.freeze({
  emerald: {
    shadow: '#a7e3c0',
    mid: '#1f9d55',
    bright: '#0f6a39',
    highlight: '#063d20',
  },
  violet: {
    shadow: '#d8ccfb',
    mid: '#7c3aed',
    bright: '#5b21b6',
    highlight: '#2e1065',
  },
  cyan: {
    shadow: '#b3e9f5',
    mid: '#0891b2',
    bright: '#0e627a',
    highlight: '#083344',
  },
  amber: {
    shadow: '#f8dca3',
    mid: '#d97706',
    bright: '#9a4f04',
    highlight: '#451a03',
  },
  mono: {
    shadow: '#cbd1dc',
    mid: '#646d7d',
    bright: '#2d333f',
    highlight: '#111419',
  },
})

function parseCssColor(input: string, fallback: RgbTuple): RgbTuple {
  const s = input.trim()
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    let raw = hex[1]!
    if (raw.length === 3) raw = raw.replace(/./g, c => c + c)
    const n = Number.parseInt(raw, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i)
  if (rgb) {
    return [
      Math.max(0, Math.min(255, Math.round(Number(rgb[1])))),
      Math.max(0, Math.min(255, Math.round(Number(rgb[2])))),
      Math.max(0, Math.min(255, Math.round(Number(rgb[3])))),
    ]
  }
  return fallback
}

function lerpRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

export function resolvePixelFieldPalette(
  palette: PixelFieldPaletteName | PixelFieldPalette,
  dark: boolean,
): PixelFieldPalette {
  if (typeof palette === 'string') {
    const table = dark ? PIXEL_FIELD_DARK_PALETTES : PIXEL_FIELD_LIGHT_PALETTES
    return table[palette] ?? table.emerald
  }
  return palette
}

/**
 * Pre-bake a 64-step CSS `rgb(r,g,b)` lookup table so the 60fps canvas loop
 * performs zero string allocations per particle.
 */
export function buildPaletteLut(palette: PixelFieldPalette, dark: boolean): string[] {
  const stops: RgbTuple[] = [
    parseCssColor(palette.shadow, dark ? [17, 66, 38] : [167, 227, 192]),
    parseCssColor(palette.mid, dark ? [47, 201, 109] : [31, 157, 85]),
    parseCssColor(palette.bright, dark ? [141, 245, 192] : [15, 106, 57]),
    parseCssColor(palette.highlight, dark ? [239, 254, 247] : [6, 61, 32]),
  ]

  const size = 64
  const lut: string[] = Array.from({ length: size })
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1)
    // Non-linear curve preserves rich emerald midtones and saves highlight bloom for the brightest 18%.
    const scaled = t < 0.48
      ? (t / 0.48)
      : t < 0.82
        ? 1 + (t - 0.48) / 0.34
        : 2 + (t - 0.82) / 0.18
    const idx = Math.min(2, Math.floor(scaled))
    const local = Math.max(0, Math.min(1, scaled - idx))
    const [r, g, b] = lerpRgb(stops[idx]!, stops[idx + 1]!, local)
    lut[i] = `rgb(${r},${g},${b})`
  }
  return lut
}
