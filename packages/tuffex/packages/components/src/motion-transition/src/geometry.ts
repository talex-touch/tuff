// Adapted from Amicro. MIT License; Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { MotionTransitionPhase } from './types'

export const clampProgress = (value: number): number => Math.min(1, Math.max(0, value))

/** Stable per-instance staggering, replacing upstream's render-time Math.random. */
export function waveDelays(id: string, points: number): number[][] {
  let seed = 2166136261
  for (let i = 0; i < id.length; i++)
    seed = Math.imul(seed ^ id.charCodeAt(i), 16777619)
  return Array.from({ length: 3 }, (_, layer) => Array.from({ length: points }, (_, point) => {
    const noise = (Math.imul(seed ^ (point + 1), 1103515245) >>> 0) / 4294967295
    return layer * 0.08 + noise * 0.15
  }))
}

/** Cubic Bezier edges from the source's 12/14 independently delayed control points. */
export function wavePath(
  progress: number,
  phase: Exclude<MotionTransitionPhase, 'idle'>,
  delays: readonly number[],
  ease: (value: number) => number,
): string {
  const step = 100 / (delays.length - 1)
  const edge = (index: number): number => {
    const p = clampProgress(ease(clampProgress((progress - (delays[index] ?? 0)) / 0.69)))
    return 100 - p * 112
  }
  let path = phase === 'leave' ? `M 0 100 V ${edge(0)}` : `M 0 -12 V ${edge(0)}`
  for (let i = 0; i < delays.length - 1; i++) {
    const nextX = (i + 1) * step
    const controlX = i * step + step / 2
    path += ` C ${controlX} ${edge(i)} ${controlX} ${edge(i + 1)} ${nextX} ${edge(i + 1)}`
  }
  return `${path} V ${phase === 'leave' ? 100 : -12} H 0 Z`
}
