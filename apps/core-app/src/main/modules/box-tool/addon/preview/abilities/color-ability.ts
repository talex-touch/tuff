import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { BasePreviewAbility } from '../preview-ability'
import { performance } from 'perf_hooks'

type ParsedColor = {
  hex: string
  rgb: { r: number; g: number; b: number; a?: number }
  hsl: { h: number; s: number; l: number; a?: number }
  format: string
}

const NAMED_COLORS: Record<string, string> = {
  red: '#ff0000',
  blue: '#0000ff',
  green: '#008000',
  white: '#ffffff',
  black: '#000000',
  orange: '#ffa500',
  purple: '#800080',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  yellow: '#ffff00'
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function rgbToHex(r: number, g: number, b: number, a?: number): string {
  const base = `#${toHex(r)}${toHex(g)}${toHex(b)}`
  return typeof a === 'number' ? `${base}${toHex(Math.round(clamp01(a) * 255))}` : base
}

function hexToRgb(hex: string): { r: number; g: number; b: number; a?: number } | null {
  let normalized = hex.replace('#', '').trim()
  if (normalized.length === 3 || normalized.length === 4) {
    normalized = normalized
      .split('')
      .map((ch) => ch + ch)
      .join('')
  }

  if (![6, 8].includes(normalized.length)) {
    return null
  }

  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  const a = normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) / 255 : undefined
  return { r, g, b, a }
}

function rgbToHsl(r: number, g: number, b: number, a?: number): { h: number; s: number; l: number; a?: number } {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255
  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const delta = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1))

    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / delta) % 6
        break
      case gNorm:
        h = (bNorm - rNorm) / delta + 2
        break
      case bNorm:
        h = (rNorm - gNorm) / delta + 4
        break
    }

    h *= 60
  }

  if (h < 0) h += 360

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a
  }
}

function hslToRgb(h: number, s: number, l: number, a?: number): { r: number; g: number; b: number; a?: number } {
  const sNorm = s / 100
  const lNorm = l / 100
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lNorm - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a
  }
}

function parseColor(input: string): ParsedColor | null {
  const value = input.trim().toLowerCase()

  if (NAMED_COLORS[value]) {
    const rgb = hexToRgb(NAMED_COLORS[value])
    if (!rgb) return null
    return {
      hex: NAMED_COLORS[value],
      rgb,
      hsl: rgbToHsl(rgb.r, rgb.g, rgb.b, rgb.a),
      format: 'named'
    }
  }

  if (value.startsWith('#')) {
    const rgb = hexToRgb(value)
    if (!rgb) return null
    return {
      hex: rgbToHex(rgb.r, rgb.g, rgb.b, rgb.a),
      rgb,
      hsl: rgbToHsl(rgb.r, rgb.g, rgb.b, rgb.a),
      format: 'hex'
    }
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/)
  if (rgbMatch) {
    const [r, g, b, a] = rgbMatch[1]
      .split(',')
      .map((part) => part.trim())
      .map((part, index) => (index === 3 ? parseFloat(part) : parseInt(part, 10)))
    if ([r, g, b].some((num) => Number.isNaN(num))) return null

    const color = { r, g, b, a: typeof a === 'number' && !Number.isNaN(a) ? clamp01(a) : undefined }
    return {
      hex: rgbToHex(color.r, color.g, color.b, color.a),
      rgb: color,
      hsl: rgbToHsl(color.r, color.g, color.b, color.a),
      format: 'rgb'
    }
  }

  const hslMatch = value.match(/^hsla?\(([^)]+)\)$/)
  if (hslMatch) {
    const [h, s, l, a] = hslMatch[1]
      .split(',')
      .map((part) => part.replace('%', '').trim())
      .map((part, index) => (index === 3 ? parseFloat(part) : parseFloat(part)))
    if ([h, s, l].some((num) => Number.isNaN(num))) return null
    const rgb = hslToRgb(h, s, l, typeof a === 'number' && !Number.isNaN(a) ? clamp01(a) : undefined)
    return {
      hex: rgbToHex(rgb.r, rgb.g, rgb.b, rgb.a),
      rgb,
      hsl: { h: Math.round(h), s: Math.round(s), l: Math.round(l), a },
      format: 'hsl'
    }
  }

  return null
}

export class ColorPreviewAbility extends BasePreviewAbility {
  readonly id = 'preview.color'
  readonly priority = 20

  override canHandle(query: { text?: string }): boolean {
    if (!query.text) return false
    return parseColor(query.text) !== null
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const original = this.getNormalizedQuery(context.query)
    const parsed = parseColor(original)
    if (!parsed) return null
    this.throwIfAborted(context.signal)

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: original,
      subtitle: '颜色解析',
      primaryLabel: '颜色',
      primaryValue: parsed.hex.toUpperCase(),
      secondaryLabel: 'RGB',
      secondaryValue: `rgb(${parsed.rgb.r}, ${parsed.rgb.g}, ${parsed.rgb.b}${
        typeof parsed.rgb.a === 'number' ? `, ${parsed.rgb.a.toFixed(2)}` : ''
      })`,
      badges: [parsed.format.toUpperCase()],
      chips: [
        {
          label: 'HSL',
          value: `hsl(${parsed.hsl.h}, ${parsed.hsl.s}%, ${parsed.hsl.l}%${
            typeof parsed.hsl.a === 'number' ? `, ${parsed.hsl.a.toFixed(2)}` : ''
          })`
        },
        {
          label: 'RGB',
          value: `${parsed.rgb.r}, ${parsed.rgb.g}, ${parsed.rgb.b}`
        }
      ],
      sections: [
        {
          title: '生成建议',
          rows: [
            { label: '亮度', value: `${parsed.hsl.l}%` },
            { label: '饱和度', value: `${parsed.hsl.s}%` }
          ]
        }
      ],
      accentColor: parsed.hex
    }

    return {
      abilityId: this.id,
      confidence: 0.85,
      payload,
      durationMs: performance.now() - startedAt
    }
  }
}
