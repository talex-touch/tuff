/**
 * 色值解析与格式转换。
 *
 * 图片主题色不能依赖 meta —— 主进程从未写过 dominant_color / palette / accent_color
 * （grep 于 apps/core-app/src/main/modules/clipboard/ 无命中），所以这里同时提供
 * 从缩略图像素量化调色板的纯函数，由组件侧的薄壳负责取像素。
 */

export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

export interface ContrastVerdict {
  ratio: number
  level: 'AAA' | 'AA' | 'AA Large' | '不达标'
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function expandShorthand(hex: string): string {
  return hex
    .split('')
    .map(char => `${char}${char}`)
    .join('')
}

export function parseColor(value: string | null | undefined): Rgb | null {
  const input = (value ?? '').trim()
  if (!input) {
    return null
  }

  const hexMatch = input.match(HEX_PATTERN)
  if (hexMatch) {
    const raw = hexMatch[1] as string
    const hex = raw.length <= 4 ? expandShorthand(raw) : raw
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    }
  }

  const fnMatch = input.match(/^rgba?\(([^)]+)\)$/i)
  if (!fnMatch) {
    return null
  }

  const parts = (fnMatch[1] as string).split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) {
    return null
  }

  const channels = parts.slice(0, 3).map(part => {
    const numeric = Number.parseFloat(part)
    return part.endsWith('%') ? (numeric / 100) * 255 : numeric
  })
  if (channels.some(channel => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
    return null
  }

  let alpha = 1
  if (parts[3] !== undefined) {
    const rawAlpha = Number.parseFloat(parts[3])
    alpha = parts[3].endsWith('%') ? rawAlpha / 100 : rawAlpha
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
      return null
    }
  }

  return {
    r: clampChannel(channels[0] as number),
    g: clampChannel(channels[1] as number),
    b: clampChannel(channels[2] as number),
    a: alpha,
  }
}

export function toHex({ r, g, b }: Rgb): string {
  const hex = (value: number): string => clampChannel(value).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase()
}

export function toRgbString({ r, g, b, a }: Rgb): string {
  return a >= 1
    ? `rgb(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)})`
    : `rgba(${clampChannel(r)}, ${clampChannel(g)}, ${clampChannel(b)}, ${Number(a.toFixed(3))})`
}

export function toHslString({ r, g, b, a }: Rgb): string {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  const lightness = (max + min) / 2

  let hue = 0
  if (delta !== 0) {
    if (max === rn) {
      hue = ((gn - bn) / delta) % 6
    } else if (max === gn) {
      hue = (bn - rn) / delta + 2
    } else {
      hue = (rn - gn) / delta + 4
    }
    hue *= 60
    if (hue < 0) {
      hue += 360
    }
  }

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  const body = `${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${Math.round(lightness * 100)}%`

  return a >= 1 ? `hsl(${body})` : `hsla(${body}, ${Number(a.toFixed(3))})`
}

function linearize(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** sRGB → 线性 → OKLab → OKLCH。定点校验：纯白 L≈1 C≈0，纯黑 L≈0。 */
export function toOklchString(rgb: Rgb): string {
  const r = linearize(rgb.r)
  const g = linearize(rgb.g)
  const b = linearize(rgb.b)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const aAxis = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const chroma = Math.sqrt(aAxis * aAxis + bAxis * bAxis)
  let hue = (Math.atan2(bAxis, aAxis) * 180) / Math.PI
  if (hue < 0) {
    hue += 360
  }

  const hueLabel = chroma < 0.0001 ? '0' : String(Math.round(hue))
  return `oklch(${lightness.toFixed(2)} ${chroma.toFixed(3)} ${hueLabel})`
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const luminanceA = relativeLuminance(a)
  const luminanceB = relativeLuminance(b)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}

function gradeContrast(ratio: number): ContrastVerdict['level'] {
  if (ratio >= 7) {
    return 'AAA'
  }
  if (ratio >= 4.5) {
    return 'AA'
  }
  if (ratio >= 3) {
    return 'AA Large'
  }
  return '不达标'
}

const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }
const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }

export function describeContrast(rgb: Rgb): { black: ContrastVerdict; white: ContrastVerdict } {
  const black = contrastRatio(rgb, BLACK)
  const white = contrastRatio(rgb, WHITE)

  return {
    black: { ratio: Number(black.toFixed(2)), level: gradeContrast(black) },
    white: { ratio: Number(white.toFixed(2)), level: gradeContrast(white) },
  }
}

/** 前景色选黑还是白，取对比度更高的一侧。 */
export function pickReadableForeground(rgb: Rgb): string {
  return contrastRatio(rgb, BLACK) >= contrastRatio(rgb, WHITE) ? '#111111' : '#FFFFFF'
}

export interface ClipboardColorFormats {
  hex: string
  rgb: string
  hsl: string
  oklch: string
}

export function toColorFormats(rgb: Rgb): ClipboardColorFormats {
  return {
    hex: toHex(rgb),
    rgb: toRgbString(rgb),
    hsl: toHslString(rgb),
    oklch: toOklchString(rgb),
  }
}

/**
 * 按 4 bit/通道分桶取频次前 N。纯函数，吃像素数组吐 HEX，便于在 jsdom 里直接测。
 * 近乎全透明的像素跳过——缩略图的留白区域不该参与主题色。
 */
export function quantizePalette(pixels: Uint8ClampedArray, max = 6): string[] {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3] as number
    if (alpha < 16) {
      continue
    }

    const r = pixels[index] as number
    const g = pixels[index + 1] as number
    const b = pixels[index + 2] as number
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)

    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count += 1
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
  }

  return Array.from(buckets.values())
    .sort((left, right) => right.count - left.count)
    .slice(0, max)
    .map(bucket =>
      toHex({
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count,
        a: 1,
      }),
    )
}

const PALETTE_SAMPLE_SIZE = 48
const IMAGE_LOAD_TIMEOUT_MS = 3000

/**
 * `<img>` + 离屏 `<canvas>` 的薄壳。canvas 不可用（jsdom / 取不到上下文）时返回空数组，
 * 由调用方决定整条不渲染，而不是留一条空色带。
 */
export async function extractPaletteFromImage(src: string, max = 6): Promise<string[]> {
  if (!src || typeof document === 'undefined') {
    return []
  }

  // 先等图片，再碰 canvas：顺序反了的话，在不加载图片的环境里（jsdom）Promise 会永远挂着。
  const image = await new Promise<HTMLImageElement | null>(resolve => {
    const element = new Image()
    const timer = setTimeout(() => resolve(null), IMAGE_LOAD_TIMEOUT_MS)
    const settle = (value: HTMLImageElement | null): void => {
      clearTimeout(timer)
      resolve(value)
    }

    element.crossOrigin = 'anonymous'
    element.onload = () => settle(element)
    element.onerror = () => settle(null)
    element.src = src
  })

  if (!image?.width || !image.height) {
    return []
  }

  const canvas = document.createElement('canvas')
  let context: CanvasRenderingContext2D | null = null
  try {
    context = canvas.getContext('2d')
  } catch {
    return []
  }
  if (!context) {
    return []
  }

  const scale = Math.min(1, PALETTE_SAMPLE_SIZE / Math.max(image.width, image.height))
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  try {
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return quantizePalette(context.getImageData(0, 0, canvas.width, canvas.height).data, max)
  } catch {
    // 跨源缩略图会污染画布；这时不给主题色，不是错误。
    return []
  }
}
