export const CLIPBOARD_STRESS_SCHEMA = 'clipboard-stress-summary/v1'

export interface ClipboardStressQueueDepth {
  queued: number
  inFlight: number
}

export interface ClipboardStressScenario {
  intervalMs: number
  durationMs: number
  queueDepthPeak: Record<string, ClipboardStressQueueDepth | undefined>
  clipboard: {
    count: number
    schedulerDelaySampleCount: number
    avgSchedulerDelayMs: number
    p95SchedulerDelayMs: number
    lastSchedulerDelayMs: number
    maxSchedulerDelayMs: number
    lastDurationMs: number
    maxDurationMs: number
    droppedCount: number
    coalescedCount: number
    timeoutCount: number
    errorCount: number
  }
}

export interface ClipboardStressSummary {
  schema?: typeof CLIPBOARD_STRESS_SCHEMA
  generatedAt: string
  results: ClipboardStressScenario[]
}

export interface ClipboardStressGateOptions {
  strict?: boolean
  minDurationMs?: number
  requireIntervals?: number[]
  maxP95SchedulerDelayMs?: number
  maxSchedulerDelayMs?: number
  maxRealtimeQueuedPeak?: number
  maxDroppedCount?: number
  allowTimeouts?: boolean
  allowErrors?: boolean
}

export interface ClipboardStressGate {
  passed: boolean
  failures: string[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
}

function getRealtimeQueuedPeak(result: ClipboardStressScenario): number {
  const realtime = result.queueDepthPeak.realtime
  return isFiniteNumber(realtime?.queued) ? Math.max(0, Math.round(realtime.queued)) : 0
}

function hasInterval(summary: ClipboardStressSummary, intervalMs: number): boolean {
  return summary.results.some((result) => result.intervalMs === intervalMs)
}

export function evaluateClipboardStressSummary(
  summary: ClipboardStressSummary,
  options: ClipboardStressGateOptions = {}
): ClipboardStressGate {
  const failures: string[] = []
  const results = Array.isArray(summary.results) ? summary.results : []

  if (options.strict && summary.schema !== CLIPBOARD_STRESS_SCHEMA) {
    failures.push(`unsupported clipboard stress summary schema: ${String(summary.schema)}`)
  }

  if (results.length === 0) {
    failures.push('clipboard stress summary has no scenario results')
    return { passed: false, failures }
  }

  for (const intervalMs of options.requireIntervals ?? []) {
    if (!hasInterval(summary, intervalMs)) {
      failures.push(`missing required interval ${intervalMs}ms`)
    }
  }

  for (const result of results) {
    const label = `interval ${result.intervalMs}ms`
    const counters: Array<[string, unknown]> = [
      ['count', result.clipboard.count],
      ['scheduler delay sample count', result.clipboard.schedulerDelaySampleCount],
      ['dropped count', result.clipboard.droppedCount],
      ['coalesced count', result.clipboard.coalescedCount],
      ['timeout count', result.clipboard.timeoutCount],
      ['error count', result.clipboard.errorCount]
    ]

    for (const [counterLabel, value] of counters) {
      if (!isNonNegativeInteger(value)) {
        failures.push(`${label} ${counterLabel} is not a non-negative integer`)
      }
    }

    if (
      isNonNegativeInteger(result.clipboard.count) &&
      isNonNegativeInteger(result.clipboard.schedulerDelaySampleCount)
    ) {
      if (result.clipboard.count === 0) {
        failures.push(`${label} clipboard count is zero`)
      }
      if (result.clipboard.schedulerDelaySampleCount === 0) {
        failures.push(`${label} scheduler delay sample count is zero`)
      }
      if (result.clipboard.schedulerDelaySampleCount > result.clipboard.count) {
        failures.push(`${label} scheduler delay samples exceed clipboard count`)
      }
    }

    const schedulerMetrics: Array<[string, unknown]> = [
      ['avg scheduler delay', result.clipboard.avgSchedulerDelayMs],
      ['p95 scheduler delay', result.clipboard.p95SchedulerDelayMs],
      ['last scheduler delay', result.clipboard.lastSchedulerDelayMs],
      ['max scheduler delay', result.clipboard.maxSchedulerDelayMs],
      ['last duration', result.clipboard.lastDurationMs],
      ['max duration', result.clipboard.maxDurationMs]
    ]
    for (const [metricLabel, value] of schedulerMetrics) {
      if (!isFiniteNumber(value) || value < 0) {
        failures.push(`${label} ${metricLabel} is not a non-negative number`)
      }
    }

    if (
      isFiniteNumber(result.clipboard.avgSchedulerDelayMs) &&
      isFiniteNumber(result.clipboard.maxSchedulerDelayMs) &&
      result.clipboard.avgSchedulerDelayMs > result.clipboard.maxSchedulerDelayMs
    ) {
      failures.push(`${label} avg scheduler delay exceeds max scheduler delay`)
    }

    if (
      isFiniteNumber(result.clipboard.p95SchedulerDelayMs) &&
      isFiniteNumber(result.clipboard.maxSchedulerDelayMs) &&
      result.clipboard.p95SchedulerDelayMs > result.clipboard.maxSchedulerDelayMs
    ) {
      failures.push(`${label} p95 scheduler delay exceeds max scheduler delay`)
    }

    if (
      isFiniteNumber(result.clipboard.lastSchedulerDelayMs) &&
      isFiniteNumber(result.clipboard.maxSchedulerDelayMs) &&
      result.clipboard.lastSchedulerDelayMs > result.clipboard.maxSchedulerDelayMs
    ) {
      failures.push(`${label} last scheduler delay exceeds max scheduler delay`)
    }

    if (
      isFiniteNumber(result.clipboard.lastDurationMs) &&
      isFiniteNumber(result.clipboard.maxDurationMs) &&
      result.clipboard.lastDurationMs > result.clipboard.maxDurationMs
    ) {
      failures.push(`${label} last duration exceeds max duration`)
    }

    if (isFiniteNumber(options.minDurationMs) && result.durationMs < options.minDurationMs) {
      failures.push(`${label} duration ${result.durationMs} < ${options.minDurationMs}`)
    }

    if (
      isFiniteNumber(options.maxP95SchedulerDelayMs) &&
      result.clipboard.p95SchedulerDelayMs > options.maxP95SchedulerDelayMs
    ) {
      failures.push(
        `${label} p95 scheduler delay ${result.clipboard.p95SchedulerDelayMs} > ${options.maxP95SchedulerDelayMs}`
      )
    }

    if (
      isFiniteNumber(options.maxSchedulerDelayMs) &&
      result.clipboard.maxSchedulerDelayMs > options.maxSchedulerDelayMs
    ) {
      failures.push(
        `${label} max scheduler delay ${result.clipboard.maxSchedulerDelayMs} > ${options.maxSchedulerDelayMs}`
      )
    }

    if (
      isFiniteNumber(options.maxRealtimeQueuedPeak) &&
      getRealtimeQueuedPeak(result) > options.maxRealtimeQueuedPeak
    ) {
      failures.push(
        `${label} realtime queue peak ${getRealtimeQueuedPeak(result)} > ${options.maxRealtimeQueuedPeak}`
      )
    }

    if (
      isFiniteNumber(options.maxDroppedCount) &&
      result.clipboard.droppedCount > options.maxDroppedCount
    ) {
      failures.push(
        `${label} dropped count ${result.clipboard.droppedCount} > ${options.maxDroppedCount}`
      )
    }

    if (!options.allowTimeouts && result.clipboard.timeoutCount > 0) {
      failures.push(`${label} timeout count ${result.clipboard.timeoutCount} > 0`)
    }

    if (!options.allowErrors && result.clipboard.errorCount > 0) {
      failures.push(`${label} error count ${result.clipboard.errorCount} > 0`)
    }
  }

  return {
    passed: failures.length === 0,
    failures
  }
}
