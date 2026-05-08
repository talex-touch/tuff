const THEME_COLOR_PATTERN = /\b(?:currentColor|context-fill|context-stroke|var\(--)/i
const COLOR_ATTR_PATTERN =
  /\b(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*["']([^"']+)["']/gi
const STYLE_COLOR_PATTERN =
  /\b(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*([^;"']+)/gi

const COLORLESS_VALUES = new Set(['none', 'transparent', 'inherit', 'initial', 'unset'])
const NEUTRAL_COLOR_NAMES = new Set([
  'black',
  'white',
  'gray',
  'grey',
  'silver',
  'darkgray',
  'darkgrey',
  'dimgray',
  'dimgrey',
  'gainsboro',
  'lightgray',
  'lightgrey',
  'slategray',
  'slategrey'
])

function collectPaintValues(svgContent: string): string[] {
  const values: string[] = []

  for (const match of svgContent.matchAll(COLOR_ATTR_PATTERN)) {
    if (match[1]) values.push(match[1])
  }

  for (const match of svgContent.matchAll(STYLE_COLOR_PATTERN)) {
    if (match[1]) values.push(match[1])
  }

  return values
}

function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.replace('#', '')
  if (![3, 4, 6, 8].includes(hex.length) || !/^[\da-f]+$/i.test(hex)) {
    return null
  }

  if (hex.length === 3 || hex.length === 4) {
    return [
      Number.parseInt(hex[0]! + hex[0]!, 16),
      Number.parseInt(hex[1]! + hex[1]!, 16),
      Number.parseInt(hex[2]! + hex[2]!, 16)
    ]
  }

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16)
  ]
}

function parseRgbColor(value: string): [number, number, number] | null {
  const match = /^rgba?\((.+)\)$/i.exec(value)
  if (!match?.[1] || match[1].includes('var(')) return null

  const parts = match[1]
    .split(/[\s,\/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3)

  if (parts.length < 3) return null

  const channels = parts.map((part) => {
    if (part.endsWith('%')) {
      const percent = Number.parseFloat(part)
      return Number.isFinite(percent) ? Math.round((percent / 100) * 255) : NaN
    }
    return Number.parseFloat(part)
  })

  if (channels.some((channel) => !Number.isFinite(channel))) return null
  return channels as [number, number, number]
}

function isNeutralRgb(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8
}

function isNeutralColor(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized || COLORLESS_VALUES.has(normalized)) return true
  if (THEME_COLOR_PATTERN.test(normalized)) return true
  if (normalized.startsWith('url(')) return true
  if (NEUTRAL_COLOR_NAMES.has(normalized)) return true

  const hex = normalized.startsWith('#') ? parseHexColor(normalized) : null
  if (hex) return isNeutralRgb(hex)

  const rgb = normalized.startsWith('rgb') ? parseRgbColor(normalized) : null
  if (rgb) return isNeutralRgb(rgb)

  const hsl = /^hsla?\((.+)\)$/i.exec(normalized)
  if (hsl?.[1]) {
    const parts = hsl[1].split(/[\s,\/]+/).filter(Boolean)
    const saturation = Number.parseFloat(parts[1] ?? '')
    return Number.isFinite(saturation) && saturation === 0
  }

  return false
}

export function shouldRenderSvgAsMask(svgContent: string | null | undefined): boolean {
  const content = svgContent?.trim()
  if (!content) return false

  const paintValues = collectPaintValues(content)
    .map((value) => value.trim())
    .filter(Boolean)

  if (paintValues.length === 0) return true

  return paintValues.every(isNeutralColor)
}
