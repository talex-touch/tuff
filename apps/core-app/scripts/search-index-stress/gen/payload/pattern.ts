import { xorshift } from './bytes'

export interface Dimensions {
  width: number
  height: number
}

/** Pixels of a decodable raster that would need about `bytes` when stored uncompressed (3 bytes/pixel). */
export function dimensionsForBytes(bytes: number, aspect = 4 / 3, bytesPerPixel = 3): Dimensions {
  const pixels = Math.max(64, Math.floor(bytes / bytesPerPixel))
  const width = Math.max(8, Math.round(Math.sqrt(pixels * aspect)))
  const height = Math.max(8, Math.round(pixels / width))
  return { width, height }
}

/** RGB raster: a diagonal gradient plus `noise` (0..1) strength; noise 1 is near-incompressible, so large files reach their size honestly. */
export function renderRgb(width: number, height: number, seed: number, noise: number): Uint8Array {
  const out = new Uint8Array(width * height * 3)
  const next = xorshift(seed ^ 0x5bd1e995)
  const amplitude = Math.round(noise * 255)
  const phase = seed & 0xff
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const r = (x * 255) / Math.max(1, width - 1)
      const g = (y * 255) / Math.max(1, height - 1)
      const b = ((x + y + phase) * 3) & 0xff
      if (amplitude > 0) {
        const n = next()
        out[offset] = (r + ((n & 0xff) * amplitude) / 255) & 0xff
        out[offset + 1] = (g + (((n >>> 8) & 0xff) * amplitude) / 255) & 0xff
        out[offset + 2] = (b + (((n >>> 16) & 0xff) * amplitude) / 255) & 0xff
      } else {
        out[offset] = r
        out[offset + 1] = g
        out[offset + 2] = b
      }
      offset += 3
    }
  }
  return out
}

/** Colour of the 8x8 block at (bx, by); used by encoders that only store one value per block. */
export function blockColor(
  bx: number,
  by: number,
  blocksX: number,
  blocksY: number,
  seed: number
): [number, number, number] {
  const next = xorshift(seed ^ Math.imul(bx + 1, 73856093) ^ Math.imul(by + 1, 19349663))
  const jitter = next()
  return [
    ((bx * 255) / Math.max(1, blocksX - 1) + (jitter & 0x3f)) & 0xff,
    ((by * 255) / Math.max(1, blocksY - 1) + ((jitter >>> 6) & 0x3f)) & 0xff,
    ((bx + by) * 9 + ((jitter >>> 12) & 0x7f) + (seed & 0xff)) & 0xff
  ]
}
