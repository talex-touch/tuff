import type { Thresholds } from '../eval-types'

export const DEFAULT_THRESHOLDS: Thresholds = {
  mainLoopBlockMs: { warn: 100, fail: 250 },
  mainLoopP99Ms: { warn: 30, fail: 50 },
  rendererBlockMs: { warn: 100, fail: 250 },
  frameOver20msRatio: { warn: 0.02, fail: 0.05 },
  frameOver50msRatio: { warn: 0.01, fail: 0.03 },
  frameWorstMs: { warn: 150, fail: 400 },
  cpuPct: { warn: 150, fail: 300 },
  rssMb: { warn: 2560, fail: 4096 },
  sampleOnBlockMs: 300
}

export interface Level {
  warn: number
  fail: number
}

type LevelKey = Exclude<keyof Thresholds, 'sampleOnBlockMs'>

/** Every `{ warn, fail }` threshold; an override for a key missing here is silently ignored. */
export const LEVEL_KEYS: readonly LevelKey[] = [
  'mainLoopBlockMs',
  'mainLoopP99Ms',
  'rendererBlockMs',
  'frameOver20msRatio',
  'frameOver50msRatio',
  'frameWorstMs',
  'cpuPct',
  'rssMb'
]

/** Each level may override only `warn` or only `fail`. */
export type ThresholdOverrides = { [K in LevelKey]?: Partial<Level> } & { sampleOnBlockMs?: number }

/** Not part of `Thresholds`: how long a probe may stay unreadable before it is reported. */
export const BLIND_SPAN_MS: Level = { warn: 5_000, fail: 20_000 }

/** `pressure()` stays raised this long after the last observation over a limit. */
export const PRESSURE_HOLD_MS = 5_000

/** `pressure()` reports `elevated` once app-wide CPU passes this share of its fail limit. */
export const CPU_ELEVATED_SHARE = 0.7

function checkLevel(key: string, level: Level): void {
  const valid = Number.isFinite(level.warn) && Number.isFinite(level.fail)
  if (!valid || level.warn <= 0 || level.fail <= 0 || level.warn > level.fail) {
    throw new Error(`invalid threshold ${key}: warn=${level.warn} fail=${level.fail}`)
  }
}

export function resolveThresholds(overrides: ThresholdOverrides = {}): Thresholds {
  const resolved: Thresholds = structuredClone(DEFAULT_THRESHOLDS)
  for (const key of LEVEL_KEYS) {
    const override = overrides[key]
    if (override === undefined) continue
    resolved[key] = { ...resolved[key], ...override }
    checkLevel(key, resolved[key])
  }
  if (overrides.sampleOnBlockMs !== undefined) {
    if (!Number.isFinite(overrides.sampleOnBlockMs) || overrides.sampleOnBlockMs <= 0) {
      throw new Error(`invalid threshold sampleOnBlockMs: ${overrides.sampleOnBlockMs}`)
    }
    resolved.sampleOnBlockMs = overrides.sampleOnBlockMs
  }
  return resolved
}
