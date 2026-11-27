export const SEARCH_TRACE_STATS_SCHEMA = 'search-trace-stats/v1'

export type SearchTraceTimedEvent = 'first.result' | 'session.end'

export interface SearchTraceProviderSlowStats {
  providerId: string
  sampleCount: number
  avgMs: number
  p95Ms: number
  maxMs: number
  timeoutCount: number
  errorCount: number
  resultCount: number
}

export interface SearchTraceEventStats {
  event: SearchTraceTimedEvent
  sampleCount: number
  avgMs: number | null
  p50Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
  maxMs: number | null
  slowCount: number
  slowRatio: number
}

export interface SearchTracePerformanceSummary {
  schema: typeof SEARCH_TRACE_STATS_SCHEMA
  minSamples: number
  slowThresholdMs: number
  enoughSamples: boolean
  sessionCount: number
  pairedSessionCount: number
  missingFirstResultSessionCount: number
  missingSessionEndSessionCount: number
  firstResult: SearchTraceEventStats
  sessionEnd: SearchTraceEventStats
  providerSlow: SearchTraceProviderSlowStats[]
}

export interface SearchTracePerformanceGateOptions {
  strict?: boolean
  minSamples?: number
  maxFirstResultP95Ms?: number
  maxSessionEndP95Ms?: number
  maxSlowRatio?: number
}

export interface SearchTracePerformanceGate {
  passed: boolean
  failures: string[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
}

function addEventMetricConsistencyFailures(stats: SearchTraceEventStats, failures: string[]): void {
  const label = stats.event

  if (
    isNonNegativeInteger(stats.sampleCount) &&
    isNonNegativeInteger(stats.slowCount) &&
    stats.sampleCount > 0
  ) {
    const expectedSlowRatio = Number((stats.slowCount / stats.sampleCount).toFixed(4))
    if (stats.slowRatio !== expectedSlowRatio) {
      failures.push(`search trace ${label} slowRatio does not match slow count`)
    }
  }

  const orderedMetrics: Array<[string, number | null]> = [
    ['p50', stats.p50Ms],
    ['p95', stats.p95Ms],
    ['p99', stats.p99Ms],
    ['max', stats.maxMs]
  ]
  const presentMetrics = orderedMetrics.filter((entry): entry is [string, number] =>
    isFiniteNumber(entry[1])
  )

  for (let index = 1; index < presentMetrics.length; index += 1) {
    const [previousName, previousValue] = presentMetrics[index - 1]
    const [currentName, currentValue] = presentMetrics[index]
    if (currentValue < previousValue) {
      failures.push(`search trace ${label} ${currentName} is less than ${previousName}`)
      break
    }
  }
}

function addCounterConsistencyFailures(
  summary: SearchTracePerformanceSummary,
  failures: string[]
): void {
  const counters: Array<[string, unknown]> = [
    ['sessionCount', summary.sessionCount],
    ['pairedSessionCount', summary.pairedSessionCount],
    ['missingFirstResultSessionCount', summary.missingFirstResultSessionCount],
    ['missingSessionEndSessionCount', summary.missingSessionEndSessionCount],
    ['first.result sampleCount', summary.firstResult.sampleCount],
    ['session.end sampleCount', summary.sessionEnd.sampleCount],
    ['first.result slowCount', summary.firstResult.slowCount],
    ['session.end slowCount', summary.sessionEnd.slowCount]
  ]

  for (const [label, value] of counters) {
    if (!isNonNegativeInteger(value)) {
      failures.push(`search trace ${label} is not a non-negative integer`)
    }
  }

  if (!isNonNegativeInteger(summary.pairedSessionCount)) return

  if (
    isNonNegativeInteger(summary.sessionCount) &&
    summary.pairedSessionCount > summary.sessionCount
  ) {
    failures.push('search trace paired sessions exceed session count')
  }

  if (
    isNonNegativeInteger(summary.firstResult.sampleCount) &&
    summary.pairedSessionCount > summary.firstResult.sampleCount
  ) {
    failures.push('search trace paired sessions exceed first.result samples')
  }

  if (
    isNonNegativeInteger(summary.sessionEnd.sampleCount) &&
    summary.pairedSessionCount > summary.sessionEnd.sampleCount
  ) {
    failures.push('search trace paired sessions exceed session.end samples')
  }

  if (
    isNonNegativeInteger(summary.sessionCount) &&
    isNonNegativeInteger(summary.missingFirstResultSessionCount) &&
    isNonNegativeInteger(summary.missingSessionEndSessionCount)
  ) {
    const expectedSessionCount =
      summary.pairedSessionCount +
      summary.missingFirstResultSessionCount +
      summary.missingSessionEndSessionCount
    if (summary.sessionCount !== expectedSessionCount) {
      failures.push(
        `search trace session count ${summary.sessionCount} does not match paired/missing sessions ${expectedSessionCount}`
      )
    }
  }

  if (
    isNonNegativeInteger(summary.firstResult.sampleCount) &&
    isNonNegativeInteger(summary.firstResult.slowCount) &&
    summary.firstResult.slowCount > summary.firstResult.sampleCount
  ) {
    failures.push('search trace first.result slow count exceeds samples')
  }

  if (
    isNonNegativeInteger(summary.sessionEnd.sampleCount) &&
    isNonNegativeInteger(summary.sessionEnd.slowCount) &&
    summary.sessionEnd.slowCount > summary.sessionEnd.sampleCount
  ) {
    failures.push('search trace session.end slow count exceeds samples')
  }

  if (isNonNegativeInteger(summary.minSamples)) {
    const expectedEnoughSamples = summary.pairedSessionCount >= summary.minSamples
    if (summary.enoughSamples !== expectedEnoughSamples) {
      failures.push('search trace enoughSamples does not match paired sessions')
    }
  }

  addEventMetricConsistencyFailures(summary.firstResult, failures)
  addEventMetricConsistencyFailures(summary.sessionEnd, failures)
}

export function evaluateSearchTracePerformance(
  summary: SearchTracePerformanceSummary,
  options: SearchTracePerformanceGateOptions = {}
): SearchTracePerformanceGate {
  const failures: string[] = []
  const minSamples = options.minSamples ?? summary.minSamples

  addCounterConsistencyFailures(summary, failures)

  if (options.strict && summary.pairedSessionCount < minSamples) {
    failures.push(`paired sessions ${summary.pairedSessionCount} < minSamples ${minSamples}`)
  }

  if (
    isFiniteNumber(options.maxFirstResultP95Ms) &&
    (summary.firstResult.p95Ms === null || summary.firstResult.p95Ms > options.maxFirstResultP95Ms)
  ) {
    failures.push(
      `first.result p95 ${summary.firstResult.p95Ms ?? 'n/a'} > ${options.maxFirstResultP95Ms}`
    )
  }

  if (
    isFiniteNumber(options.maxSessionEndP95Ms) &&
    (summary.sessionEnd.p95Ms === null || summary.sessionEnd.p95Ms > options.maxSessionEndP95Ms)
  ) {
    failures.push(
      `session.end p95 ${summary.sessionEnd.p95Ms ?? 'n/a'} > ${options.maxSessionEndP95Ms}`
    )
  }

  if (isFiniteNumber(options.maxSlowRatio)) {
    if (summary.firstResult.slowRatio > options.maxSlowRatio) {
      failures.push(
        `first.result slowRatio ${summary.firstResult.slowRatio} > ${options.maxSlowRatio}`
      )
    }
    if (summary.sessionEnd.slowRatio > options.maxSlowRatio) {
      failures.push(
        `session.end slowRatio ${summary.sessionEnd.slowRatio} > ${options.maxSlowRatio}`
      )
    }
  }

  return {
    passed: failures.length === 0,
    failures
  }
}
