import type { Pressure } from '../eval-types'
import type { Clock } from './clock'
import type { RateLimiter } from './rate-limiter'

export interface PacingStats {
  /** Seconds the monitor reported pressure above ok: concurrency and query rate were reduced. */
  throttledSeconds: number
  /** Times new work was held back because pressure was critical. */
  criticalHolds: number
  criticalHoldSeconds: number
  /** Holds that reached their bound and went on at one scenario at a time. */
  criticalTimeouts: number
  /** Separate stretches with pressure above ok. */
  degradedEpisodes: number
}

export type PacerMode = 'normal' | 'holding' | 'limp'

export interface PacerOptions {
  clock: Clock
  base: number
  pressure: () => { level: Pressure; reason?: string }
  mark: (label: string) => void
  /** Critical pressure must stay away this long before work is released again. */
  okHoldMs?: number
  /** Longest hold; then the run goes on at one scenario at a time instead of waiting for ever. */
  holdMaxMs?: number
}

export interface Pacer {
  /** Samples the pressure and advances the hold; call it before every release decision. */
  update: () => void
  /** Scenarios allowed in flight now: 0 while holding. */
  limit: () => number
  level: () => Pressure
  mode: () => PacerMode
  setBase: (base: number) => void
  stats: () => PacingStats
}

export function createPacer(options: PacerOptions): Pacer {
  const okHoldMs = options.okHoldMs ?? 3_000
  const holdMaxMs = options.holdMaxMs ?? 60_000
  let base = options.base
  let level: Pressure = 'ok'
  let mode: PacerMode = 'normal'
  let lastAt = options.clock.now()
  let holdStartedAt = 0
  let okSince: number | null = null
  let throttledMs = 0
  let holdMs = 0
  const counters = { criticalHolds: 0, criticalTimeouts: 0, degradedEpisodes: 0 }

  const label = (kind: string, reason?: string): string =>
    `pacing:${kind}${reason ? ` (${reason})` : ''}`

  const update = (): void => {
    const now = options.clock.now()
    const elapsed = Math.max(0, now - lastAt)
    lastAt = now
    if (level !== 'ok') throttledMs += elapsed
    if (mode !== 'normal') holdMs += elapsed

    const sample = options.pressure()
    if (sample.level !== level) {
      if (level === 'ok') counters.degradedEpisodes += 1
      if (sample.level !== 'ok' || level !== 'ok') options.mark(label(sample.level, sample.reason))
    }
    level = sample.level

    if (mode === 'normal' && level === 'critical') {
      mode = 'holding'
      holdStartedAt = now
      okSince = null
      counters.criticalHolds += 1
      options.mark(label('hold'))
    } else if (mode === 'holding') {
      if (level === 'ok') okSince ??= now
      else okSince = null
      if (okSince !== null && now - okSince >= okHoldMs) {
        mode = 'normal'
        options.mark(label('resume'))
      } else if (now - holdStartedAt >= holdMaxMs) {
        mode = 'limp'
        counters.criticalTimeouts += 1
        options.mark(label('hold-timeout', 'going on one scenario at a time'))
      }
    } else if (mode === 'limp' && level !== 'critical') {
      mode = 'normal'
      options.mark(label('resume'))
    }
  }

  return {
    update,
    limit: () => {
      if (mode === 'holding') return 0
      if (mode === 'limp') return 1
      return level === 'ok' ? base : Math.max(1, Math.floor(base / 2))
    },
    level: () => level,
    mode: () => mode,
    setBase: (next) => {
      base = Math.max(1, Math.floor(next))
    },
    stats: () => ({
      throttledSeconds: Math.round(throttledMs / 1000),
      criticalHolds: counters.criticalHolds,
      criticalHoldSeconds: Math.round(holdMs / 1000),
      criticalTimeouts: counters.criticalTimeouts,
      degradedEpisodes: counters.degradedEpisodes
    })
  }
}

/** Takes slots from the slow limiter (half the rate) while pressure is above ok. */
export function createPacedLimiter(
  fast: RateLimiter,
  slow: RateLimiter,
  level: () => Pressure
): RateLimiter {
  return {
    acquire: (signal) => (level() === 'ok' ? fast : slow).acquire(signal),
    get issued() {
      return fast.issued + slow.issued
    },
    get waitedMs() {
      return fast.waitedMs + slow.waitedMs
    }
  }
}
