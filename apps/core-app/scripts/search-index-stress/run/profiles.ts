import type { ScenarioClass } from '../types'

export type ProfileName = 'smoke' | 'full' | 'burst'

export interface ProfileSpec {
  name: ProfileName
  count: number
  mix?: Partial<Record<ScenarioClass, number>>
  /** Scenarios in flight during the steady phase. */
  steadyConcurrency: number
  /** Scenarios in flight during the burst phase. */
  burstConcurrency: number
  /** Share of the plan (by release order) run in the steady phase; the rest is the burst. */
  steadyShare: number
}

/** The generator owns smoke/full; its `PROFILE_COUNTS` wins when the CLI passes it in. */
export const DEFAULT_PROFILE_COUNTS: Record<ProfileName, number> = {
  smoke: 200,
  full: 10_000,
  burst: 1_500
}

const BURST_MIX: Partial<Record<ScenarioClass, number>> = {
  'create-image': 6,
  'search-created': 2,
  'change-image': 1,
  'ignore-image': 0.5,
  'search-image': 0.25,
  'search-file': 0.25,
  'search-app': 0
}

export interface ProfileOverrides {
  count?: number
  concurrency?: number
  burstConcurrency?: number
}

export function resolveProfile(
  name: ProfileName,
  overrides: ProfileOverrides = {},
  counts: Partial<Record<string, number>> = {}
): ProfileSpec {
  const baseCount = counts[name] ?? DEFAULT_PROFILE_COUNTS[name]
  const count = overrides.count ?? baseCount
  if (!Number.isInteger(count) || count < 1)
    throw new RangeError(`scenario count must be a positive integer, got ${count}`)
  const steady = overrides.concurrency ?? 6
  const burst = overrides.burstConcurrency ?? 24
  if (!Number.isInteger(steady) || steady < 1)
    throw new RangeError(`concurrency must be a positive integer, got ${steady}`)
  if (!Number.isInteger(burst) || burst < 1)
    throw new RangeError(`burst concurrency must be a positive integer, got ${burst}`)
  if (name === 'burst') {
    return {
      name,
      count,
      mix: BURST_MIX,
      steadyConcurrency: burst,
      burstConcurrency: burst,
      steadyShare: 0
    }
  }
  return { name, count, steadyConcurrency: steady, burstConcurrency: burst, steadyShare: 0.85 }
}
