import type { SearchCheck, SearchTarget } from '../types'
import type { QueryPlan } from './queries'

/** ms the runner keeps polling a `present` check before giving up. */
export const PRESENT_DEADLINE_MS = {
  seeded: 8_000,
  later: 10_000,
  created: 30_000,
  slow: 45_000,
  burst: 60_000
} as const

/** ms the runner waits after first confirming absence before it confirms again. */
export const ABSENT_SETTLE_MS = 6_000
const ABSENT_TOP_K = 50

export function fileTarget(path: string): SearchTarget {
  return { kind: 'file', name: path.slice(path.lastIndexOf('/') + 1), path }
}

export function presentCheck(
  plan: QueryPlan,
  target: SearchTarget,
  deadlineMs: number
): SearchCheck {
  return {
    query: plan.query,
    target,
    expect: 'present',
    topK: plan.topK,
    tier: plan.tier,
    deadlineMs
  }
}

/** `hard` only when a traversal-policy rule backs it; a deleted or renamed-away name is stale-index detection, which stays soft. */
export function absentCheck(
  query: string,
  target: SearchTarget,
  tier: 'hard' | 'soft',
  startAfterMs?: number
): SearchCheck {
  const check: SearchCheck = {
    query,
    target,
    expect: 'absent',
    topK: ABSENT_TOP_K,
    tier,
    deadlineMs: ABSENT_SETTLE_MS
  }
  return startAfterMs === undefined ? check : { ...check, startAfterMs }
}
