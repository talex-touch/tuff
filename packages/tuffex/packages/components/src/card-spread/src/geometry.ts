// Adapted from Amicro cards/*.tsx. MIT — Copyright (c) 2026 SYED  SUBHAN UDDIN
import type { CardSpreadVariant } from './types'

export interface SpreadGeometry {
  x: number
  y: number
  rotate: number
  scale: number
  z: number
  origin: string
}
const scatterX = [-75, -35, 0, 35, 75]
const scatterY = [15, -15, -30, -10, 20]
const scatterRotate = [-14, -6, 2, 8, 15]
export const SPREAD_DEFAULTS: Record<CardSpreadVariant, { angle: number, gap: number, yOffset: number }> = {
  'card-arc-5': { angle: 30, gap: 70, yOffset: 10 },
  'card-arc-7': { angle: 45, gap: 110, yOffset: 30 },
  'card-long-arc-5': { angle: 15, gap: 140, yOffset: 20 },
  'card-linear-spread': { angle: 0, gap: 90, yOffset: 0 },
  'card-corner-fan': { angle: 40, gap: 0, yOffset: 0 },
  'card-stamp-arc': { angle: 25, gap: 180, yOffset: 40 },
  'card-cascade-stagger': { angle: 6, gap: 14, yOffset: 28 },
  'card-scatter-spread': { angle: 15, gap: 75, yOffset: 30 },
  'card-wheel-fan': { angle: 36, gap: 0, yOffset: 28 },
  'focus-blur': { angle: 0, gap: 0, yOffset: 0 },
}

/** Five/seven source stops interpolate for arbitrary caller-owned item counts. */
function interpolate(stops: number[], progress: number): number {
  const position = progress * (stops.length - 1)
  const left = Math.floor(position)
  const a = stops[left] ?? 0
  return a + ((stops[Math.min(left + 1, stops.length - 1)] ?? a) - a) * (position - left)
}
export function spreadGeometry(
  variant: CardSpreadVariant, index: number, count: number, expanded: boolean,
  angle: number, gap: number, yOffset: number, intensity: number,
): SpreadGeometry {
  const center = (count - 1) / 2
  const dist = index - center
  const progress = count > 1 ? index / (count - 1) : 0.5
  const norm = center > 0 ? dist / center : 0
  const result: SpreadGeometry = {
    x: 0, y: 0, rotate: 0, scale: 1,
    z: Math.ceil(count - Math.abs(dist)), origin: '50% 100%',
  }
  if (variant === 'card-corner-fan') {
    result.origin = '0% 100%'
    result.z = count - index
  }
  if (variant === 'card-wheel-fan') result.origin = '50% 110%'
  if (variant === 'card-scatter-spread' || variant === 'card-cascade-stagger') result.origin = '50% 50%'
  if (!expanded) {
    if (variant === 'card-cascade-stagger') result.y = dist * 2
    return result
  }
  result.scale = Math.abs(dist) < 0.5 ? 1.05 : 1
  switch (variant) {
    case 'card-arc-5':
      result.x = norm * gap
      result.rotate = norm * angle
      result.y = interpolate([1, -0.2, -1, -0.2, 1], progress) * yOffset
      break
    case 'card-arc-7':
      result.x = norm * gap
      result.rotate = norm * angle
      result.y = interpolate([1, 0.33, -0.17, -0.5, -0.17, 0.33, 1], progress) * yOffset
      break
    case 'card-long-arc-5':
      result.x = norm * gap
      result.rotate = norm * angle
      result.y = interpolate([1, 0.25, -0.25, 0.25, 1], progress) * yOffset
      break
    case 'card-linear-spread':
      result.x = norm * gap
      break
    case 'card-corner-fan':
      result.rotate = -10 + progress * angle
      result.scale = Math.abs(dist) < 0.5 ? 1.03 : 1
      break
    case 'card-stamp-arc':
      result.x = norm * gap
      result.rotate = interpolate([-1, -0.48, 0, 0.48, 1], progress) * angle
      result.y = interpolate([1, 0.25, -0.25, 0.25, 1], progress) * yOffset
      break
    case 'card-cascade-stagger':
      result.x = dist * gap
      result.y = -dist * yOffset - yOffset / 2
      result.rotate = dist * angle
      result.scale = Math.abs(dist) < 0.5 ? 1.05 : 0.98
      break
    case 'card-scatter-spread':
      result.x = interpolate(scatterX, progress) * gap / 75
      result.y = interpolate(scatterY, progress) * yOffset / 30
      result.rotate = interpolate(scatterRotate, progress) * angle / 15
      result.scale = Math.abs(dist) < 0.5 ? 1.05 : 0.98
      break
    case 'card-wheel-fan':
      result.rotate = norm * angle
      result.y = interpolate([-8, -22, -28, -22, -8], progress) * yOffset / 28
      result.scale = Math.abs(dist) < 0.5 ? 1.05 : 0.98
      break
  }
  result.x *= intensity
  result.y *= intensity
  result.rotate *= intensity
  return result
}
