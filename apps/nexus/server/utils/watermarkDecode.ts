import { WATERMARK_BANDS, deriveWatermarkSeeds, type WatermarkBandConfig } from '../../shared/watermark/config'

function createSeededRng(seed: number): () => number {
  let state = seed || 0x12345678
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1000) / 1000
  }
}

interface PatternData {
  data: Float32Array
  size: number
  scale: number
  weight: number
}

interface TransformConfig {
  angle: number
  scale: number
  cos: number
  sin: number
  offsetX: number
  offsetY: number
}

const SCALE_CANDIDATES = [1, 1.5, 2, 2.5]
const ANGLE_CANDIDATES = [0, -3.5, 3.5]
const PHASE_CANDIDATES = [0, 0.33, 0.67]
const transformCache = new Map<number, TransformConfig[]>()

function buildTransforms(patternSize: number) {
  const cached = transformCache.get(patternSize)
  if (cached)
    return cached
  const transforms: TransformConfig[] = []
  for (const scale of SCALE_CANDIDATES) {
    for (const angle of ANGLE_CANDIDATES) {
      const rad = (angle * Math.PI) / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      for (const phaseX of PHASE_CANDIDATES) {
        for (const phaseY of PHASE_CANDIDATES) {
          transforms.push({
            angle,
            scale,
            cos,
            sin,
            offsetX: patternSize * phaseX,
            offsetY: patternSize * phaseY,
          })
        }
      }
    }
  }
  transformCache.set(patternSize, transforms)
  return transforms
}

function buildPattern(seed: number, config: WatermarkBandConfig): PatternData {
  const rng = createSeededRng(seed)
  const size = config.size
  const cell = Math.max(1, Math.floor(config.cell ?? 1))
  const cells = Math.ceil(size / cell)
  const cellValues = new Float32Array(cells * cells)
  for (let i = 0; i < cellValues.length; i += 1) {
    const noise = (rng() - 0.5) * config.amplitude * 2
    cellValues[i] = (config.base + noise - 128) / 128
  }
  const data = new Float32Array(size * size)
  for (let y = 0; y < size; y += 1) {
    const cy = Math.floor(y / cell)
    for (let x = 0; x < size; x += 1) {
      const cx = Math.floor(x / cell)
      data[y * size + x] = cellValues[cy * cells + cx] ?? 0
    }
  }
  return {
    data,
    size,
    scale: size / config.tile,
    weight: config.weight,
  }
}

function normalizeLuma(value: number) {
  return (value - 128) / 128
}

function computeStep(width: number, height: number) {
  const target = 256 * 256
  const total = width * height
  if (total <= target)
    return 1
  return Math.max(1, Math.floor(Math.sqrt(total / target)))
}

function wrapIndex(value: number, size: number) {
  const mod = value % size
  return mod < 0 ? mod + size : mod
}

function computeCorrelation(luma: number[], width: number, height: number, pattern: PatternData, transform: TransformConfig) {
  const { data, size, scale } = pattern
  const step = computeStep(width, height)
  const cx = width / 2
  const cy = height / 2
  const invScale = 1 / transform.scale

  let sum = 0
  let sumValue = 0
  let sumPattern = 0
  let samples = 0

  for (let y = 0; y < height; y += step) {
    const row = y * width
    const dy = y - cy
    for (let x = 0; x < width; x += step) {
      const dx = x - cx
      const ux = (dx * transform.cos - dy * transform.sin) * invScale + cx
      const uy = (dx * transform.sin + dy * transform.cos) * invScale + cy
      if (ux < 0 || uy < 0 || ux >= width || uy >= height)
        continue
      const idx = row + x
      const lumaValue = luma[idx]
      if (typeof lumaValue !== 'number')
        continue
      const value = normalizeLuma(lumaValue)
      const px = wrapIndex(Math.floor(ux * scale + transform.offsetX), size)
      const py = wrapIndex(Math.floor(uy * scale + transform.offsetY), size)
      const patternValue = data[py * size + px]
      if (typeof patternValue !== 'number')
        continue
      sum += value * patternValue
      sumValue += value * value
      sumPattern += patternValue * patternValue
      samples += 1
    }
  }

  if (!samples)
    return 0
  const denom = Math.sqrt(sumValue * sumPattern)
  if (!denom)
    return 0
  return sum / denom
}

function computeBandScore(luma: number[], width: number, height: number, seed: number, band: WatermarkBandConfig) {
  const pattern = buildPattern(seed, band)
  const transforms = buildTransforms(pattern.size)
  let best = -1
  for (const transform of transforms) {
    const score = computeCorrelation(luma, width, height, pattern, transform)
    if (score > best)
      best = score
  }
  return { score: best, weight: pattern.weight }
}

export function computeFastScore(luma: number[], width: number, height: number, seed: number) {
  const primaryBand = WATERMARK_BANDS[0]
  if (!primaryBand)
    return -1
  const pattern = buildPattern(seed, primaryBand)
  const fastScales = [1, 1.5, 2]
  let best = -1
  for (const scale of fastScales) {
    const transform = {
      angle: 0,
      scale,
      cos: 1,
      sin: 0,
      offsetX: 0,
      offsetY: 0,
    }
    const score = computeCorrelation(luma, width, height, pattern, transform)
    if (score > best)
      best = score
  }
  return best
}

export function computeWatermarkScore(luma: number[], width: number, height: number, seed: number) {
  const seeds = deriveWatermarkSeeds(seed, WATERMARK_BANDS.length)
  const bandScores = WATERMARK_BANDS.map((band, index) =>
    computeBandScore(luma, width, height, seeds[index] ?? seed, band),
  )

  const maxScore = Math.max(...bandScores.map(item => item.score))
  const weightSum = bandScores.reduce((sum, item) => sum + item.weight, 0) || 1
  const weightedScore = bandScores.reduce((sum, item) => sum + item.score * item.weight, 0) / weightSum
  const score = maxScore * 0.7 + weightedScore * 0.3

  return {
    score,
    bandScores: bandScores.map(item => item.score),
  }
}

export function scoreToConfidence(score: number, bandScores: number[] = []) {
  const normalized = Math.max(0, Math.min(1, (score - 0.03) / 0.12))
  if (!bandScores.length)
    return normalized
  const hitCount = bandScores.filter(value => value >= 0.05).length
  const hitRatio = hitCount / bandScores.length
  const blended = normalized * 0.85 + hitRatio * 0.15
  return Math.max(0, Math.min(1, blended))
}
