/**
 * Trace sampling rates for Sentry, shared by the main and renderer initialisers.
 *
 * A flat 1.0 uploads every transaction from a long-running desktop app on the user's own machine
 * and network, and burns the project quota. Once the quota is hit Sentry rate-limits the project,
 * so genuine **error** events start getting dropped — the setting degrades exactly the observability
 * it exists to provide (#799).
 *
 * Development keeps 1.0: the traffic is one developer's, and a trace you cannot see is worse than a
 * trace you did not need.
 */

/** Every transaction, for a build a developer is running themselves. */
export const SENTRY_TRACES_SAMPLE_RATE_DEVELOPMENT = 1

/**
 * One transaction in ten, for builds on users' machines.
 *
 * The conservative end of the 0.01–0.1 range: performance data stays statistically usable at this
 * volume, and moving further down is a decision that wants real quota numbers rather than a guess.
 * Override with TUFF_SENTRY_TRACES_SAMPLE_RATE when investigating something specific.
 */
export const SENTRY_TRACES_SAMPLE_RATE_PRODUCTION = 0.1

/**
 * Resolves the rate for a runtime, honouring an explicit override.
 *
 * An out-of-range or unparseable override is ignored rather than clamped: a typo like `10` meaning
 * "10 percent" would otherwise silently become full sampling, which is the state being fixed.
 */
export function resolveSentryTracesSampleRate(options: {
  isDevelopment: boolean
  override?: string | null
}): number {
  const raw = options.override?.trim()
  if (raw) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed
    }
  }
  return options.isDevelopment
    ? SENTRY_TRACES_SAMPLE_RATE_DEVELOPMENT
    : SENTRY_TRACES_SAMPLE_RATE_PRODUCTION
}
