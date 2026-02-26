import { hasDocument } from '@talex-touch/utils/env'

export interface NoiseWatermarkOptions {
  seed: number
  size?: number
  cell?: number
  amplitude?: number
  base?: number
}

export interface TextWatermarkOptions {
  text: string
  width?: number
  height?: number
  gap?: number
  rotate?: number
  color?: string
  font?: string
}

export function hashString(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function createSeededRng(seed: number): () => number {
  let state = seed || 0x12345678
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1000) / 1000
  }
}

export function buildNoiseWatermarkDataUrl(options: NoiseWatermarkOptions): string {
  if (!hasDocument())
    return ''

  const size = options.size ?? 256
  const cell = Math.max(1, Math.floor(options.cell ?? 1))
  const amplitude = options.amplitude ?? 8
  const base = options.base ?? 128
  const rng = createSeededRng(options.seed)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return ''

  const image = ctx.createImageData(size, size)
  const cells = Math.ceil(size / cell)
  const cellValues = new Array<number>(cells * cells)
  for (let i = 0; i < cellValues.length; i += 1) {
    const noise = (rng() - 0.5) * amplitude * 2
    cellValues[i] = Math.max(0, Math.min(255, base + noise))
  }
  for (let y = 0; y < size; y += 1) {
    const cy = Math.floor(y / cell)
    for (let x = 0; x < size; x += 1) {
      const cx = Math.floor(x / cell)
      const value = cellValues[cy * cells + cx] ?? base
      const idx = (y * size + x) * 4
      image.data[idx] = value
      image.data[idx + 1] = value
      image.data[idx + 2] = value
      image.data[idx + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

export function buildTextWatermarkDataUrl(options: TextWatermarkOptions): string {
  if (!hasDocument())
    return ''

  const width = options.width ?? 360
  const height = options.height ?? 240
  const gap = options.gap ?? 160
  const rotate = options.rotate ?? -24
  const color = options.color ?? 'rgba(0, 0, 0, 0.12)'
  const font = options.font ?? '600 16px "DM Sans", "PingFang SC", sans-serif'

  const canvas = document.createElement('canvas')
  canvas.width = width + gap
  canvas.height = height + gap
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return ''

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rotate * Math.PI) / 180)
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(options.text, 0, 0)
  return canvas.toDataURL('image/png')
}
