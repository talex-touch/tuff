export const SEARCH_TRACE_SCHEMA = 'search-trace/v1'
export const SEARCH_TRACE_STATS_SCHEMA = 'search-trace-stats/v1'

export const SEARCH_TRACE_DEFAULT_SLOW_THRESHOLD_MS = 800
export const SEARCH_TRACE_DEFAULT_MIN_SAMPLES = 200

export type SearchTraceTimedEvent = 'first.result' | 'session.end'

export interface SearchTraceSample {
  event: SearchTraceTimedEvent
  sessionId: string
  totalMs: number
  ts?: number
  providerSlow?: SearchTraceProviderSlowSample[]
}

export interface SearchTraceProviderSlowSample {
  providerId: string
  durationMs: number
  status: string
  resultCount: number
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function normalizeDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return Math.max(0, value)
}

function normalizeTimedEvent(value: unknown): SearchTraceTimedEvent | null {
  if (value === 'first.result' || value === 'session.end') {
    return value
  }
  return null
}

function normalizeProviderSlowSample(value: unknown): SearchTraceProviderSlowSample | null {
  if (!isRecord(value)) return null

  const providerId =
    typeof value.providerId === 'string' && value.providerId.length > 0
      ? value.providerId
      : 'unknown'
  const durationMs = normalizeDuration(value.durationMs)
  if (durationMs === null) return null

  return {
    providerId,
    durationMs,
    status: typeof value.status === 'string' && value.status.length > 0 ? value.status : 'success',
    resultCount:
      typeof value.resultCount === 'number' && Number.isFinite(value.resultCount)
        ? Math.max(0, Math.round(value.resultCount))
        : 0
  }
}

function normalizeProviderSlowSamples(
  payload: Record<string, unknown>
): SearchTraceProviderSlowSample[] {
  const providers = isRecord(payload.providers) ? payload.providers : null
  const summary = isRecord(providers?.summary) ? providers.summary : null
  const topSlow = Array.isArray(summary?.topSlow) ? summary.topSlow : []

  return topSlow.flatMap((entry) => {
    const normalized = normalizeProviderSlowSample(entry)
    return normalized ? [normalized] : []
  })
}

function pickPercentile(sorted: number[], percentile: number): number | null {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1))
  return sorted[index]
}

function roundMetric(value: number | null): number | null {
  return value === null ? null : Math.round(value)
}

function buildEventStats(
  event: SearchTraceTimedEvent,
  samples: SearchTraceSample[],
  slowThresholdMs: number
): SearchTraceEventStats {
  const durations = samples
    .filter((sample) => sample.event === event)
    .map((sample) => sample.totalMs)
    .sort((a, b) => a - b)

  const total = durations.reduce((sum, duration) => sum + duration, 0)
  const slowCount = durations.filter((duration) => duration >= slowThresholdMs).length

  return {
    event,
    sampleCount: durations.length,
    avgMs: durations.length > 0 ? Math.round(total / durations.length) : null,
    p50Ms: roundMetric(pickPercentile(durations, 0.5)),
    p95Ms: roundMetric(pickPercentile(durations, 0.95)),
    p99Ms: roundMetric(pickPercentile(durations, 0.99)),
    maxMs: durations.length > 0 ? Math.round(durations[durations.length - 1]) : null,
    slowCount,
    slowRatio: durations.length > 0 ? Number((slowCount / durations.length).toFixed(4)) : 0
  }
}

function buildProviderSlowStats(samples: SearchTraceSample[]): SearchTraceProviderSlowStats[] {
  const stats = new Map<
    string,
    {
      durations: number[]
      timeoutCount: number
      errorCount: number
      resultCount: number
    }
  >()

  for (const sample of samples) {
    for (const provider of sample.providerSlow ?? []) {
      const current = stats.get(provider.providerId) ?? {
        durations: [],
        timeoutCount: 0,
        errorCount: 0,
        resultCount: 0
      }
      current.durations.push(provider.durationMs)
      if (provider.status === 'timeout') current.timeoutCount += 1
      if (provider.status === 'error') current.errorCount += 1
      current.resultCount += provider.resultCount
      stats.set(provider.providerId, current)
    }
  }

  return [...stats.entries()]
    .map(([providerId, stat]) => {
      const durations = stat.durations.sort((a, b) => a - b)
      const total = durations.reduce((sum, duration) => sum + duration, 0)

      return {
        providerId,
        sampleCount: durations.length,
        avgMs: Math.round(total / durations.length),
        p95Ms: roundMetric(pickPercentile(durations, 0.95)) ?? 0,
        maxMs: Math.round(durations[durations.length - 1] ?? 0),
        timeoutCount: stat.timeoutCount,
        errorCount: stat.errorCount,
        resultCount: stat.resultCount
      }
    })
    .sort((left, right) => right.p95Ms - left.p95Ms || right.sampleCount - left.sampleCount)
}

export function parseSearchTracePayload(payload: unknown): SearchTraceSample | null {
  if (!isRecord(payload)) return null
  if (payload.schema !== SEARCH_TRACE_SCHEMA) return null

  const event = normalizeTimedEvent(payload.event)
  if (!event) return null

  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : ''
  if (!sessionId) return null

  const timing = isRecord(payload.timing) ? payload.timing : null
  const totalMs = normalizeDuration(timing?.totalMs)
  if (totalMs === null) return null

  const ts = normalizeDuration(payload.ts)
  return {
    event,
    sessionId,
    totalMs,
    ts: ts ?? undefined,
    providerSlow: normalizeProviderSlowSamples(payload)
  }
}

export function parseSearchTraceLine(line: string): SearchTraceSample | null {
  const marker = `[${SEARCH_TRACE_SCHEMA}]`
  const markerIndex = line.indexOf(marker)
  if (markerIndex === -1) return null

  const jsonStart = line.indexOf('{', markerIndex + marker.length)
  if (jsonStart === -1) return null

  try {
    return parseSearchTracePayload(JSON.parse(line.slice(jsonStart)))
  } catch {
    return null
  }
}

export function summarizeSearchTracePerformance(
  input: Array<SearchTraceSample | string>,
  options: {
    minSamples?: number
    slowThresholdMs?: number
  } = {}
): SearchTracePerformanceSummary {
  const minSamples = options.minSamples ?? SEARCH_TRACE_DEFAULT_MIN_SAMPLES
  const slowThresholdMs = options.slowThresholdMs ?? SEARCH_TRACE_DEFAULT_SLOW_THRESHOLD_MS
  const samples = input.flatMap((entry) => {
    if (typeof entry === 'string') {
      const parsed = parseSearchTraceLine(entry)
      return parsed ? [parsed] : []
    }
    return [entry]
  })

  const firstResultSessionIds = new Set(
    samples.filter((sample) => sample.event === 'first.result').map((sample) => sample.sessionId)
  )
  const sessionEndSessionIds = new Set(
    samples.filter((sample) => sample.event === 'session.end').map((sample) => sample.sessionId)
  )
  const allSessionIds = new Set([...firstResultSessionIds, ...sessionEndSessionIds])
  let pairedSessionCount = 0

  for (const sessionId of firstResultSessionIds) {
    if (sessionEndSessionIds.has(sessionId)) {
      pairedSessionCount += 1
    }
  }

  return {
    schema: SEARCH_TRACE_STATS_SCHEMA,
    minSamples,
    slowThresholdMs,
    enoughSamples: pairedSessionCount >= minSamples,
    sessionCount: allSessionIds.size,
    pairedSessionCount,
    missingFirstResultSessionCount: [...sessionEndSessionIds].filter(
      (sessionId) => !firstResultSessionIds.has(sessionId)
    ).length,
    missingSessionEndSessionCount: [...firstResultSessionIds].filter(
      (sessionId) => !sessionEndSessionIds.has(sessionId)
    ).length,
    firstResult: buildEventStats('first.result', samples, slowThresholdMs),
    sessionEnd: buildEventStats('session.end', samples, slowThresholdMs),
    providerSlow: buildProviderSlowStats(samples)
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function evaluateSearchTracePerformance(
  summary: SearchTracePerformanceSummary,
  options: SearchTracePerformanceGateOptions = {}
): SearchTracePerformanceGate {
  const failures: string[] = []
  const minSamples = options.minSamples ?? summary.minSamples

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
