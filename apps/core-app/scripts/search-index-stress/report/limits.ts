import type { ReportLimits } from '../eval-types'

export const DEFAULT_REPORT_LIMITS: ReportLimits = {
  indexP95WarnMs: 6_000,
  indexP99FailMs: 15_000,
  answerP95WarnMs: 300,
  answerP99FailMs: 1_000,
  blindShareFail: 0.02,
  undecidedShareFail: 0.02,
  frameCoverageMin: 0.8,
  outlierFactor: 2
}

/** A group smaller than this is never flagged: its p95 is one or two observations. */
export const FLAG_MIN_SAMPLES = 5

/** A group whose p95 is below this is never flagged: 12 ms against 30 ms is measurement noise, not a case difference. */
export const FLAG_MIN_P95_MS = 50

/** The app's own event-loop detector reports nothing below this (`LOOP_LAG_WARN_MS` in perf-monitor-config.ts). */
export const APP_LAG_FLOOR_MS = 200

const SHARES: ReadonlySet<keyof ReportLimits> = new Set([
  'blindShareFail',
  'undecidedShareFail',
  'frameCoverageMin'
])

export function resolveLimits(overrides: Partial<ReportLimits> = {}): ReportLimits {
  const limits: ReportLimits = { ...DEFAULT_REPORT_LIMITS }
  for (const key of Object.keys(DEFAULT_REPORT_LIMITS) as Array<keyof ReportLimits>) {
    const value = overrides[key]
    if (value === undefined) continue
    const valid =
      Number.isFinite(value) &&
      value > 0 &&
      (!SHARES.has(key) || value <= 1) &&
      (key !== 'outlierFactor' || value > 1)
    if (!valid) throw new Error(`invalid report limit ${key}: ${value}`)
    limits[key] = value
  }
  return limits
}
