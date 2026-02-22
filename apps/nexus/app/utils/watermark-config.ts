export interface WatermarkBandConfig {
  size: number
  tile: number
  cell: number
  amplitude: number
  base: number
  weight: number
}

export const WATERMARK_BANDS: WatermarkBandConfig[] = [
  {
    size: 256,
    tile: 256,
    cell: 4,
    amplitude: 14,
    base: 128,
    weight: 0.5,
  },
  {
    size: 128,
    tile: 128,
    cell: 4,
    amplitude: 12,
    base: 128,
    weight: 0.3,
  },
  {
    size: 512,
    tile: 512,
    cell: 8,
    amplitude: 10,
    base: 128,
    weight: 0.2,
  },
]

const SEED_FALLBACK = 0x12345678

export function deriveWatermarkSeeds(seed: number, count = WATERMARK_BANDS.length) {
  const seeds: number[] = []
  let current = (seed || SEED_FALLBACK) >>> 0
  for (let i = 0; i < count; i += 1) {
    if (i > 0)
      current = (Math.imul(current, 1664525) + 1013904223) >>> 0
    seeds.push(current)
  }
  return seeds
}
