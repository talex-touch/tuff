import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type {
  PerformanceProcessRole,
  PerformanceProcessSample,
  PerformanceProcessTreeEntry,
  PerformanceProcessTreeReport,
  PerformanceResourceReport,
  PerformanceSurface
} from '@talex-touch/utils/transport/events/types'
import type { BrowserWindow, ProcessMetric } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { getHeapStatistics } from 'node:v8'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { app, webContents } from 'electron'
import { getNativeRuntimeBudget } from '../../core/native-runtime-threads'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { sampleWorkerThreads } from '../../core/worker-thread-registry'
import { createLogger } from '../../utils/logger'
import { perfMonitor } from '../../utils/perf-monitor'
import { BaseModule } from '../abstract-base-module'
import { getSystemPorts } from './system-ports'

const performanceLog = createLogger('PerformanceReport')

/**
 * A second request inside this window gets the previous report back. Every delta in a report is
 * measured since the one before it, so two windows polling at once would otherwise shorten each
 * other's window and double the work.
 */
const REPORT_REUSE_MS = 1_000
const PS_MAX_BUFFER_BYTES = 8 * 1024 * 1024
const NETWORK_SERVICE = 'network.mojom.NetworkService'

/**
 * Settings › Performance. Everything here runs because the page asked: no timer, no sampler, no
 * background state beyond the previous report that the next one is measured against.
 */
export class PerformanceReportModule extends BaseModule {
  static key: symbol = Symbol.for('PerformanceReport')
  name: ModuleKey = PerformanceReportModule.key

  private previousReport: PerformanceResourceReport | null = null
  private previousMainCpu: { usage: NodeJS.CpuUsage; at: number } | null = null
  private pendingReport: Promise<PerformanceResourceReport> | null = null
  private getMainWindow: () => BrowserWindow | null = () => null
  private disposers: Array<() => void> = []

  constructor() {
    super(PerformanceReportModule.key, {
      create: false,
      dirName: 'system'
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'PerformanceReportModule.onInit')
    this.getMainWindow = () => runtime.app.window?.window ?? null

    this.disposers.push(
      runtime.transport.on(AppEvents.performance.getReport, async (_payload, context) => {
        if (context?.plugin) throw new Error('PERFORMANCE_REPORT_HOST_ONLY')
        return await this.getReport()
      }),
      runtime.transport.on(AppEvents.performance.getProcessTree, async (_payload, context) => {
        if (context?.plugin) throw new Error('PERFORMANCE_REPORT_HOST_ONLY')
        return await this.buildProcessTree()
      })
    )
  }

  onDestroy(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.previousReport = null
    this.previousMainCpu = null
  }

  private async getReport(): Promise<PerformanceResourceReport> {
    const previous = this.previousReport
    if (previous && Date.now() - previous.capturedAt < REPORT_REUSE_MS) return previous
    this.pendingReport ??= this.buildReport().finally(() => {
      this.pendingReport = null
    })
    return await this.pendingReport
  }

  private async buildReport(): Promise<PerformanceResourceReport> {
    // Only the synchronous parts count as cost: waiting for workers to answer is not main-thread work.
    let startedAt = performance.now()
    const capturedAt = Date.now()
    const metrics = app.getAppMetrics()
    const processes = this.toProcessSamples(metrics)
    const mainCpuUsage = readMainThreadCpu()
    const mainCpuAt = performance.now()
    const previousMainCpu = this.previousMainCpu
    const mainThreadCpuPercent =
      mainCpuUsage && previousMainCpu
        ? cpuPercentBetween(previousMainCpu.usage, mainCpuUsage, mainCpuAt - previousMainCpu.at)
        : null
    this.previousMainCpu = mainCpuUsage ? { usage: mainCpuUsage, at: mainCpuAt } : null
    const heap = getHeapStatistics()
    const workersProbe = sampleWorkerThreads()
    let collectMs = performance.now() - startedAt

    const workers = await workersProbe
    startedAt = performance.now()
    const reportsWakeups = process.platform !== 'win32'
    const previous = this.previousReport
    const report: PerformanceResourceReport = {
      capturedAt,
      windowMs: previous ? capturedAt - previous.capturedAt : null,
      platform: process.platform,
      logicalCpuCount: os.availableParallelism(),
      totals: {
        cpuPercent: sum(processes, (sample) => sample.cpuPercent),
        workingSetBytes: sum(processes, (sample) => sample.workingSetBytes),
        idleWakeupsPerSecond: reportsWakeups
          ? sum(processes, (sample) => sample.idleWakeupsPerSecond ?? 0)
          : null
      },
      processes,
      mainThread: {
        cpuPercent: mainThreadCpuPercent,
        heapUsedBytes: heap.used_heap_size,
        heapTotalBytes: heap.total_heap_size,
        heapLimitBytes: heap.heap_size_limit,
        lastLag: perfMonitor.getRecentEventLoopLagSnapshot()
      },
      workers,
      nativeRuntimes: getNativeRuntimeBudget(),
      collectMs: 0
    }
    collectMs += performance.now() - startedAt
    report.collectMs = collectMs
    this.previousReport = report
    return report
  }

  private toProcessSamples(metrics: ProcessMetric[]): PerformanceProcessSample[] {
    const surfaces = this.collectSurfaces()
    const reportsWakeups = process.platform !== 'win32'
    return metrics.map((metric) => ({
      pid: metric.pid,
      role: resolveProcessRole(metric),
      electronType: metric.type,
      serviceName: metric.serviceName ?? null,
      surfaces: surfaces.get(metric.pid) ?? [],
      cpuPercent: metric.cpu.percentCPUUsage,
      idleWakeupsPerSecond: reportsWakeups ? metric.cpu.idleWakeupsPerSecond : null,
      // Electron reports process memory in kilobytes.
      workingSetBytes: metric.memory.workingSetSize * 1024,
      peakWorkingSetBytes: metric.memory.peakWorkingSetSize * 1024,
      privateBytes:
        typeof metric.memory.privateBytes === 'number' ? metric.memory.privateBytes * 1024 : null,
      createdAt: metric.creationTime
    }))
  }

  /** Which windows and views each renderer process hosts, keyed by OS process id. */
  private collectSurfaces(): Map<number, PerformanceSurface[]> {
    const performancePort = getSystemPorts().performance
    const mainWindowId = liveContentsId(this.getMainWindow())
    const coreBoxWindowId = liveContentsId(performancePort.getCoreBoxWindow())
    const byPid = new Map<number, PerformanceSurface[]>()
    for (const contents of webContents.getAllWebContents()) {
      if (contents.isDestroyed()) continue
      const pid = contents.getOSProcessId()
      let surface: PerformanceSurface
      const pluginName = performancePort.resolvePluginNameByWebContents(contents.id)
      if (contents.id === mainWindowId) surface = { kind: 'main-window', pluginName: null }
      else if (contents.id === coreBoxWindowId) surface = { kind: 'corebox', pluginName: null }
      else if (pluginName) surface = { kind: 'plugin-view', pluginName }
      else surface = { kind: classifyByUrl(contents.getURL()), pluginName: null }
      const list = byPid.get(pid)
      if (list) list.push(surface)
      else byPid.set(pid, [surface])
    }
    return byPid
  }

  private async buildProcessTree(): Promise<PerformanceProcessTreeReport> {
    const startedAt = performance.now()
    const capturedAt = Date.now()
    if (process.platform !== 'darwin' && process.platform !== 'linux') {
      return { capturedAt, supported: false, processes: [], collectMs: 0 }
    }
    try {
      const electronPids = new Set(app.getAppMetrics().map((metric) => metric.pid))
      const listing = await runPs(['-A', '-o', 'pid=,ppid=,rss=,%cpu=,comm='])
      // The listing includes the `ps` that produced it, a child of this process for that moment.
      const rows = parseProcessListing(listing.stdout).filter((row) => row.pid !== listing.pid)
      const tree = descendantsOf(process.pid, rows)
      const threads = await readThreadCounts(tree.map((row) => row.pid))
      const processes: PerformanceProcessTreeEntry[] = tree.map((row) => ({
        pid: row.pid,
        command: row.command,
        threads: threads.get(row.pid) ?? null,
        cpuPercent: row.cpuPercent,
        residentBytes: row.residentKb === null ? null : row.residentKb * 1024,
        electronManaged: electronPids.has(row.pid)
      }))
      return { capturedAt, supported: true, processes, collectMs: performance.now() - startedAt }
    } catch (error) {
      performanceLog.warn('Process tree sampling failed', { error })
      throw new Error('PERFORMANCE_PROCESS_TREE_FAILED')
    }
  }
}

function resolveProcessRole(metric: ProcessMetric): PerformanceProcessRole {
  switch (metric.type) {
    case 'Browser':
      return 'browser'
    case 'GPU':
      return 'gpu'
    case 'Tab':
      return 'renderer'
    case 'Utility': {
      const registeredRole = getSystemPorts().performance.resolveUtilityProcessRole({
        name: metric.name,
        serviceName: metric.serviceName
      })
      if (registeredRole) return registeredRole
      if (metric.serviceName === NETWORK_SERVICE) return 'network-service'
      return 'utility'
    }
    default:
      return 'other'
  }
}

function classifyByUrl(url: string): PerformanceSurface['kind'] {
  if (url.startsWith('devtools://')) return 'devtools'
  if (url.includes('#/meta-overlay')) return 'meta-overlay'
  return 'other'
}

function liveContentsId(window: BrowserWindow | null): number | null {
  if (!window || window.isDestroyed()) return null
  return window.webContents.id
}

type ProcessWithThreadCpu = NodeJS.Process & { threadCpuUsage?: () => NodeJS.CpuUsage }

/** The calling thread's own CPU; null where Node has no `process.threadCpuUsage`. */
function readMainThreadCpu(): NodeJS.CpuUsage | null {
  const threadCpuUsage = (process as ProcessWithThreadCpu).threadCpuUsage
  return threadCpuUsage ? threadCpuUsage.call(process) : null
}

function cpuPercentBetween(
  previous: NodeJS.CpuUsage,
  current: NodeJS.CpuUsage,
  elapsedMs: number
): number {
  if (elapsedMs <= 0) return 0
  const usedMicros = current.user - previous.user + (current.system - previous.system)
  return Math.max(0, usedMicros / 1000 / elapsedMs) * 100
}

function sum<T>(items: T[], pick: (item: T) => number): number {
  let total = 0
  for (const item of items) total += pick(item)
  return total
}

function runPs(args: string[]): Promise<{ stdout: string; pid: number | undefined }> {
  const { promise, resolve, reject } = Promise.withResolvers<{
    stdout: string
    pid: number | undefined
  }>()
  const child = execFile(
    process.platform === 'darwin' ? '/bin/ps' : 'ps',
    args,
    { maxBuffer: PS_MAX_BUFFER_BYTES },
    (error, stdout) => (error ? reject(error) : resolve({ stdout, pid: child.pid }))
  )
  return promise
}

interface ProcessRow {
  pid: number
  ppid: number
  residentKb: number | null
  cpuPercent: number | null
  command: string
}

/** Rows of `ps -o pid=,ppid=,rss=,%cpu=,comm=`; the command is last and may contain spaces. */
function parseProcessListing(listing: string): ProcessRow[] {
  const rows: ProcessRow[] = []
  for (const line of listing.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/.exec(line)
    if (!match) continue
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      residentKb: Number(match[3]),
      cpuPercent: Number(match[4]),
      command: path.basename(match[5].trim())
    })
  }
  return rows
}

/** `root` first, then its descendants breadth-first. */
function descendantsOf(root: number, rows: ProcessRow[]): ProcessRow[] {
  const byParent = new Map<number, ProcessRow[]>()
  let rootRow: ProcessRow | undefined
  for (const row of rows) {
    if (row.pid === root) rootRow = row
    const siblings = byParent.get(row.ppid)
    if (siblings) siblings.push(row)
    else byParent.set(row.ppid, [row])
  }
  if (!rootRow) return []
  const ordered = [rootRow]
  for (let index = 0; index < ordered.length; index += 1) {
    ordered.push(...(byParent.get(ordered[index].pid) ?? []))
  }
  return ordered
}

async function readThreadCounts(pids: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>()
  if (pids.length === 0) return counts
  const pidList = pids.join(',')
  if (process.platform === 'linux') {
    for (const line of (await runPs(['-o', 'pid=,nlwp=', '-p', pidList])).stdout.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
      if (match) counts.set(Number(match[1]), Number(match[2]))
    }
    return counts
  }
  // macOS has no thread-count column: `-M` prints one line per thread, and `pid=` puts the owning
  // pid last on each. The header line ends in a column title, never a number, so it is skipped.
  const wanted = new Set(pids)
  for (const line of (await runPs(['-M', '-ww', '-o', 'pid=', '-p', pidList])).stdout.split('\n')) {
    const pid = Number(line.trim().split(/\s+/).at(-1))
    if (wanted.has(pid)) counts.set(pid, (counts.get(pid) ?? 0) + 1)
  }
  return counts
}

export const performanceReportModule = new PerformanceReportModule()
