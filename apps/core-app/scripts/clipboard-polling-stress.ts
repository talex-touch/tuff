#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { PollingService } from '@talex-touch/utils/common/utils/polling'

type QueueDepthSnapshot = Record<string, { queued: number; inFlight: number }>

interface ScenarioResult {
  intervalMs: number
  durationMs: number
  queueDepthPeak: QueueDepthSnapshot
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

interface CliOptions {
  intervals: number[]
  durationMs: number
  outputDir?: string
}

const DEFAULT_INTERVALS = [1000, 500, 250]
const DEFAULT_DURATION_MS = 10_000

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    intervals: [...DEFAULT_INTERVALS],
    durationMs: DEFAULT_DURATION_MS
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--intervals' && argv[i + 1]) {
      const values = argv[++i]
        .split(',')
        .map((item) => Number.parseInt(item.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0)
      if (values.length > 0) {
        options.intervals = Array.from(new Set(values)).sort((a, b) => b - a)
      }
      continue
    }
    if (arg === '--durationMs' && argv[i + 1]) {
      const durationMs = Number.parseInt(argv[++i], 10)
      if (Number.isFinite(durationMs) && durationMs >= 2000) {
        options.durationMs = durationMs
      }
      continue
    }
    if (arg === '--outputDir' && argv[i + 1]) {
      options.outputDir = argv[++i]
      continue
    }
  }

  if (!options.intervals.includes(500)) {
    options.intervals.push(500)
  }
  if (!options.intervals.some((value) => value < 500)) {
    options.intervals.push(250)
  }
  options.intervals = Array.from(new Set(options.intervals)).sort((a, b) => b - a)

  return options
}

function busyWait(ms: number): void {
  const startedAt = performance.now()
  while (performance.now() - startedAt < ms) {
    // intentional busy spin for synthetic CPU pressure
  }
}

function randomRange(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function createQueueDepthSnapshot(): QueueDepthSnapshot {
  return {
    critical: { queued: 0, inFlight: 0 },
    realtime: { queued: 0, inFlight: 0 },
    io: { queued: 0, inFlight: 0 },
    maintenance: { queued: 0, inFlight: 0 },
    legacy_serial: { queued: 0, inFlight: 0 }
  }
}

function mergeQueuePeaks(target: QueueDepthSnapshot, current?: QueueDepthSnapshot): void {
  if (!current) return
  for (const [lane, depth] of Object.entries(current)) {
    const existing = target[lane] ?? { queued: 0, inFlight: 0 }
    target[lane] = {
      queued: Math.max(existing.queued, Math.max(0, Math.round(depth.queued ?? 0))),
      inFlight: Math.max(existing.inFlight, Math.max(0, Math.round(depth.inFlight ?? 0)))
    }
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  const total = values.reduce((sum, value) => sum + value, 0)
  return total / values.length
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const boundedRatio = Math.min(1, Math.max(0, ratio))
  const index = Math.max(0, Math.ceil(sorted.length * boundedRatio) - 1)
  return sorted[index] ?? 0
}

async function runScenario(intervalMs: number, durationMs: number): Promise<ScenarioResult> {
  const service = PollingService.getInstance()
  const runTag = `${intervalMs}-${Date.now()}`
  const clipboardTaskId = `stress.clipboard.${runTag}`
  const ioTaskId = `stress.io.${runTag}`
  const maintenanceTaskId = `stress.maintenance.${runTag}`
  const realtimeNoiseTaskIds = [
    `stress.realtime-noise-a.${runTag}`,
    `stress.realtime-noise-b.${runTag}`
  ]

  const queueDepthPeak = createQueueDepthSnapshot()
  const clipboardDelaySamples: number[] = []

  service.register(
    clipboardTaskId,
    async () => {
      const roll = Math.random()
      if (roll < 0.7) {
        await sleep(randomRange(8, 22))
      } else if (roll < 0.93) {
        await sleep(randomRange(35, 95))
      } else {
        busyWait(randomRange(8, 18))
        await sleep(randomRange(120, 220))
      }
    },
    {
      interval: intervalMs,
      unit: 'milliseconds',
      runImmediately: true,
      lane: 'realtime',
      backpressure: 'latest_wins',
      dedupeKey: clipboardTaskId,
      maxInFlight: 1,
      timeoutMs: 2_000,
      jitterMs: 20
    }
  )

  for (const [index, taskId] of realtimeNoiseTaskIds.entries()) {
    service.register(
      taskId,
      async () => {
        const roll = Math.random()
        if (roll < 0.65) {
          await sleep(randomRange(35, 85))
        } else if (roll < 0.9) {
          await sleep(randomRange(90, 180))
        } else {
          busyWait(randomRange(8, 22))
          await sleep(randomRange(180, 320))
        }
      },
      {
        interval: Math.max(40, Math.floor(intervalMs * (index === 0 ? 0.42 : 0.33))),
        unit: 'milliseconds',
        runImmediately: true,
        lane: 'realtime',
        backpressure: 'strict_fifo',
        maxInFlight: 1,
        timeoutMs: 2_000,
        jitterMs: 12
      }
    )
  }

  service.register(
    ioTaskId,
    async () => {
      await sleep(randomRange(45, 130))
    },
    {
      interval: Math.max(200, Math.floor(intervalMs * 0.8)),
      unit: 'milliseconds',
      runImmediately: true,
      lane: 'io',
      backpressure: 'coalesce',
      dedupeKey: ioTaskId,
      maxInFlight: 1,
      timeoutMs: 2_000,
      jitterMs: 40
    }
  )

  service.register(
    maintenanceTaskId,
    async () => {
      await sleep(randomRange(30, 95))
    },
    {
      interval: Math.max(600, intervalMs * 2),
      unit: 'milliseconds',
      runImmediately: true,
      lane: 'maintenance',
      backpressure: 'coalesce',
      dedupeKey: maintenanceTaskId,
      maxInFlight: 1,
      timeoutMs: 2_000,
      jitterMs: 60
    }
  )

  service.start()

  const sampler = setInterval(() => {
    const diagnostics = service.getDiagnostics()
    mergeQueuePeaks(queueDepthPeak, diagnostics.queueDepthByLane)
    const snapshot = diagnostics.recentTasks.find((task) => task.id === clipboardTaskId)
    if (snapshot) {
      clipboardDelaySamples.push(numberOrZero(snapshot.lastSchedulerDelayMs))
    }
  }, 20)

  try {
    await sleep(durationMs)
  } finally {
    clearInterval(sampler)
  }

  const diagnostics = service.getDiagnostics()
  mergeQueuePeaks(queueDepthPeak, diagnostics.queueDepthByLane)

  const clipboardStats = diagnostics.recentTasks.find((task) => task.id === clipboardTaskId)
  if (clipboardStats) {
    clipboardDelaySamples.push(numberOrZero(clipboardStats.lastSchedulerDelayMs))
  }

  service.unregister(clipboardTaskId)
  for (const taskId of realtimeNoiseTaskIds) {
    service.unregister(taskId)
  }
  service.unregister(ioTaskId)
  service.unregister(maintenanceTaskId)

  return {
    intervalMs,
    durationMs,
    queueDepthPeak,
    clipboard: {
      count: numberOrZero(clipboardStats?.count),
      schedulerDelaySampleCount: clipboardDelaySamples.length,
      avgSchedulerDelayMs: Number(average(clipboardDelaySamples).toFixed(2)),
      p95SchedulerDelayMs: percentile(clipboardDelaySamples, 0.95),
      lastSchedulerDelayMs: numberOrZero(clipboardStats?.lastSchedulerDelayMs),
      maxSchedulerDelayMs: numberOrZero(clipboardStats?.maxSchedulerDelayMs),
      lastDurationMs: numberOrZero(clipboardStats?.lastDurationMs),
      maxDurationMs: numberOrZero(clipboardStats?.maxDurationMs),
      droppedCount: numberOrZero(clipboardStats?.droppedCount),
      coalescedCount: numberOrZero(clipboardStats?.coalescedCount),
      timeoutCount: numberOrZero(clipboardStats?.timeoutCount),
      errorCount: numberOrZero(clipboardStats?.errorCount)
    }
  }
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`
}

function renderTable(results: ScenarioResult[]): string {
  if (results.length === 0) return 'No scenario results.'
  const baseline = results[0]

  const lines = [
    '| interval_ms | realtime_peak(queued/inFlight) | io_peak(queued/inFlight) | maintenance_peak(queued/inFlight) | p95_scheduler_delay_ms | max_scheduler_delay_ms | delta_vs_baseline_ms | dropped | coalesced | max_duration_ms | count |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  ]

  for (const result of results) {
    const realtimePeak = result.queueDepthPeak.realtime ?? { queued: 0, inFlight: 0 }
    const ioPeak = result.queueDepthPeak.io ?? { queued: 0, inFlight: 0 }
    const maintenancePeak = result.queueDepthPeak.maintenance ?? { queued: 0, inFlight: 0 }
    const delta = result.clipboard.maxSchedulerDelayMs - baseline.clipboard.maxSchedulerDelayMs

    lines.push(
      `| ${result.intervalMs} | ${realtimePeak.queued}/${realtimePeak.inFlight} | ${ioPeak.queued}/${ioPeak.inFlight} | ${maintenancePeak.queued}/${maintenancePeak.inFlight} | ${result.clipboard.p95SchedulerDelayMs} | ${result.clipboard.maxSchedulerDelayMs} | ${formatDelta(delta)} | ${result.clipboard.droppedCount} | ${result.clipboard.coalescedCount} | ${result.clipboard.maxDurationMs} | ${result.clipboard.count} |`
    )
  }

  return lines.join('\n')
}

async function persistReport(results: ScenarioResult[], outputDir?: string): Promise<string> {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const coreRoot = path.resolve(__dirname, '..')
  const repoRoot = path.resolve(coreRoot, '..', '..')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportDir = outputDir
    ? path.resolve(outputDir)
    : path.resolve(
        repoRoot,
        'docs',
        'engineering',
        'reports',
        `clipboard-polling-stress-${timestamp}`
      )

  await mkdir(reportDir, { recursive: true })
  const reportPath = path.join(reportDir, 'summary.json')
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        results
      },
      null,
      2
    )}\n`,
    'utf8'
  )
  return reportPath
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  const results: ScenarioResult[] = []
  for (const intervalMs of options.intervals) {
    process.stdout.write(
      `\n[clipboard-stress] running interval=${intervalMs}ms duration=${options.durationMs}ms ...\n`
    )
    const result = await runScenario(intervalMs, options.durationMs)
    results.push(result)
    await sleep(600)
  }

  const table = renderTable(results)
  process.stdout.write(
    '\n[clipboard-stress] queueDepthByLane + scheduler_delay_ms baseline comparison\n'
  )
  process.stdout.write(`${table}\n`)

  const reportPath = await persistReport(results, options.outputDir)
  process.stdout.write(`\n[clipboard-stress] report saved: ${reportPath}\n`)

  PollingService.getInstance().stop('clipboard stress benchmark completed')
}

main().catch((error) => {
  console.error('[clipboard-stress] failed:', error)
  PollingService.getInstance().stop('clipboard stress benchmark failed')
  process.exitCode = 1
})
