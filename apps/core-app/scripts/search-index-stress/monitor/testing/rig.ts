import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, vi } from 'vitest'
import type {
  AppHandles,
  Breach,
  BreachKind,
  MonitorSummary,
  StressMonitor
} from '../../eval-types'
import { createMonitorWith } from '../index'
import {
  LOOP_RESOLUTION_MS,
  MAIN_INSTALL_EXPRESSION,
  MAIN_PEEK_EXPRESSION,
  PAGE_INSTALL_EXPRESSION,
  PAGE_READ_EXPRESSION,
  mainReadExpression
} from '../probes/scripts'
import { FakeWsServer, type WsReply } from './fake-cdp-server'
import { ManualClock } from './manual-clock'
import { installNetGauge, type NetGauge } from './net-gauge'
export const MAIN_PID = process.pid
export const RENDERER_PID = 900_001
export const BASE_DELAY = 2

export const value = (v: unknown): WsReply => ({ result: { result: { type: typeof v, value: v } } })

export interface PageState {
  id: string
  title: string
  vis: boolean
  n: number
  o20: number
  o33: number
  o50: number
  o100: number
  worst: number
  ltMax: number
  lost: boolean
}

/** Delays are what the app reports above the 10 ms timer period; the fake adds the period back. */
export interface LoopState {
  n: number
  p50: number
  p99: number
  max: number
  wn: number
  w99: number
  /** Worst heartbeat lateness since the last read; the fake clears it on every read, as the app does. */
  late: number
  beatAge: number
}

export interface RigOptions {
  mainPid?: number
  intervalMs?: number
  inspectorUp?: boolean
  before?: (dirs: AppHandles) => Promise<void>
}

export interface Rig {
  monitor: StressMonitor
  clock: ManualClock
  browser: FakeWsServer
  inspector: FakeWsServer
  dirs: AppHandles
  breaches: Breach[]
  logLines: string[]
  sample: ReturnType<typeof vi.fn<(pid: number, file: string) => Promise<boolean>>>
  loop: LoopState
  pages: Map<string, PageState>
  cpuRate: { main: number; renderer: number }
  rssKb: { value: number }
  installs: { main: number; page: number; hook: number }
  summary?: MonitorSummary
  stop(): Promise<MonitorSummary>
}

/** Cumulative CPU seconds per process, integrating whatever rate is set when it is read. */
class CpuMeter {
  main = 100
  renderer = 100
  private last: number

  constructor(
    private readonly clock: ManualClock,
    readonly rate: { main: number; renderer: number }
  ) {
    this.last = clock.time
  }

  read(): { main: number; renderer: number } {
    const seconds = (this.clock.time - this.last) / 1000
    this.main += this.rate.main * seconds
    this.renderer += this.rate.renderer * seconds
    this.last = this.clock.time
    return { main: this.main, renderer: this.renderer }
  }
}

const rigs: Rig[] = []
const tempDirs: string[] = []
let gauge: NetGauge

export const clockText = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`

export async function makeRig(options: RigOptions = {}): Promise<Rig> {
  const root = await mkdtemp(join(tmpdir(), 'stress-monitor-'))
  tempDirs.push(root)
  const dirs: AppHandles = {
    mainPid: options.mainPid ?? MAIN_PID,
    cdpPort: 0,
    inspectPort: 0,
    profileDir: join(root, 'profile'),
    logsDir: join(root, 'profile', 'logs'),
    evidenceDir: join(root, 'evidence')
  }
  await mkdir(dirs.logsDir, { recursive: true })
  await options.before?.(dirs)

  const browser = await FakeWsServer.start()
  const inspector = await FakeWsServer.start()
  dirs.cdpPort = browser.port
  dirs.inspectPort = inspector.port
  const clock = new ManualClock(gauge)
  clock.servers.push(browser, inspector)

  const pages = new Map<string, PageState>()
  pages.set('p1', {
    id: 'p1',
    title: 'CoreBox',
    vis: true,
    n: 60,
    o20: 0,
    o33: 0,
    o50: 0,
    o100: 0,
    worst: 20,
    ltMax: 0,
    lost: false
  })
  const loop: LoopState = {
    n: 100,
    p50: 0.4,
    p99: 1,
    max: BASE_DELAY,
    wn: 500,
    w99: 1,
    late: 0,
    beatAge: 3
  }
  const cpuRate = { main: 0.2, renderer: 0.1 }
  const meter = new CpuMeter(clock, cpuRate)
  const rssKb = { value: 400_000 }
  const installs = { main: 0, page: 0, hook: 0 }

  inspector.refuseUpgrades = options.inspectorUp === false
  inspector.json.set('/json/list', [
    {
      id: 'n1',
      type: 'node',
      title: 'main',
      url: 'file:///',
      webSocketDebuggerUrl: inspector.url('/n1')
    }
  ])
  inspector.respond = (_connection, request) => {
    if (request.method !== 'Runtime.evaluate') return { result: {} }
    const expression = request.params.expression
    if (expression === MAIN_INSTALL_EXPRESSION) {
      installs.main++
      return value('installed')
    }
    if (expression === MAIN_PEEK_EXPRESSION) return value(loop.beatAge)
    if (expression === mainReadExpression(true) || expression === mainReadExpression(false)) {
      const reply = value({
        n: loop.n,
        mean: LOOP_RESOLUTION_MS + 0.5,
        p50: loop.p50 + LOOP_RESOLUTION_MS,
        p99: loop.p99 + LOOP_RESOLUTION_MS,
        max: loop.max + LOOP_RESOLUTION_MS,
        wn: loop.wn,
        w99: loop.w99 + LOOP_RESOLUTION_MS,
        wmax: loop.max + LOOP_RESOLUTION_MS,
        late: loop.late,
        beatAge: loop.beatAge,
        elu: 0.1
      })
      loop.max = BASE_DELAY
      loop.late = 0
      return reply
    }
    return { error: { code: -32000, message: 'unexpected expression' } }
  }

  browser.json.set('/json/version', { webSocketDebuggerUrl: browser.url('/devtools/browser/b1') })
  browser.json.set('/json/list', () => [
    ...[...pages.values()].map((page) => ({
      id: page.id,
      type: 'page',
      title: page.title,
      url: `http://localhost:5173/#/${page.id}`,
      webSocketDebuggerUrl: browser.url(`/devtools/page/${page.id}`)
    })),
    {
      id: 'sw',
      type: 'service_worker',
      title: 'sw',
      url: 'http://localhost:5173/sw.js',
      webSocketDebuggerUrl: browser.url('/devtools/page/sw')
    }
  ])
  browser.respond = (connection, request) => {
    if (connection.path.startsWith('/devtools/browser')) {
      if (request.method !== 'SystemInfo.getProcessInfo') return { result: {} }
      const cpu = meter.read()
      return {
        result: {
          processInfo: [
            { type: 'browser', id: MAIN_PID, cpuTime: cpu.main },
            { type: 'renderer', id: RENDERER_PID, cpuTime: cpu.renderer }
          ]
        }
      }
    }
    if (request.method === 'Inspector.enable') return { result: {} }
    const page = pages.get(connection.path.split('/').pop() ?? '')
    if (page && request.method === 'Page.addScriptToEvaluateOnNewDocument') {
      installs.hook++
      return { result: { identifier: String(installs.hook) } }
    }
    const expression = request.params.expression
    if (!page || request.method !== 'Runtime.evaluate')
      return { error: { code: -32000, message: 'no such page' } }
    if (expression === PAGE_INSTALL_EXPRESSION) {
      installs.page++
      return value('installed')
    }
    if (expression === PAGE_READ_EXPRESSION) {
      if (page.lost) {
        page.lost = false
        return value(null)
      }
      return value({
        vis: page.vis,
        n: page.vis ? page.n : 0,
        o20: page.o20,
        o33: page.o33,
        o50: page.o50,
        o100: page.o100,
        worst: page.worst,
        thr: 0,
        lt: page.ltMax > 0 ? 1 : 0,
        ltMax: page.ltMax,
        loaf: 0,
        loafMax: 0
      })
    }
    return { error: { code: -32000, message: 'unexpected expression' } }
  }

  const sample = vi.fn(async (_pid: number, file: string) => {
    await writeFile(file, 'Call graph:\n  1000 Thread_1 DispatchQueue_1: com.apple.main-thread\n')
    return true
  })
  const psText = (): string => {
    const cpu = meter.read()
    return [
      `${MAIN_PID} 1 ${rssKb.value} ${clockText(cpu.main)} 1:00:00 /App/Tuff`,
      `${RENDERER_PID} ${MAIN_PID} ${rssKb.value / 2} ${clockText(cpu.renderer)} 1:00:00 /App/Helper --type=renderer`
    ].join('\n')
  }

  const breaches: Breach[] = []
  const logLines: string[] = []
  const monitor = createMonitorWith(
    dirs,
    { now: clock.now, intervalMs: options.intervalMs ?? 1_000, log: (line) => logLines.push(line) },
    {
      scheduler: clock,
      spawnSample: sample,
      runPs: async () => psText(),
      lookupName: async () => null
    }
  )
  monitor.onBreach((breach) => breaches.push({ ...breach }))

  const rig: Rig = {
    monitor,
    clock,
    browser,
    inspector,
    dirs,
    breaches,
    logLines,
    sample,
    loop,
    pages,
    cpuRate,
    rssKb,
    installs,
    async stop() {
      rig.summary ??= await monitor.stop()
      return rig.summary
    }
  }
  rigs.push(rig)
  await monitor.start()
  await clock.settle()
  return rig
}

/** Registers the per-test setup and teardown; call it once at the top level of a test file. */
export function useRigs(): void {
  beforeEach(() => {
    gauge = installNetGauge()
  })

  afterEach(async () => {
    for (const rig of rigs.splice(0)) {
      rig.browser.release()
      rig.inspector.release()
      await rig.stop()
      await rig.browser.stop()
      await rig.inspector.stop()
    }
    gauge.uninstall()
    for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true })
  })
}

export const phaseOf = (
  summary: MonitorSummary,
  name: string
): MonitorSummary['phases'][number] => {
  const phase = summary.phases.find((candidate) => candidate.phase === name)
  if (!phase) throw new Error(`no phase ${name}: ${summary.phases.map((p) => p.phase).join(',')}`)
  return phase
}

export const ofKind = (rig: Rig, kind: BreachKind): Breach[] =>
  rig.breaches.filter((breach) => breach.kind === kind)
