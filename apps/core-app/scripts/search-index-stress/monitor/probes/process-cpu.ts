import { execFile } from 'node:child_process'
import { CdpConnection, CdpError, fetchJson } from '../cdp'
import type { ProbeContext } from './context'

export interface PsRow {
  pid: number
  ppid: number
  rssKb: number
  cpuSec: number
  etimeSec: number
  command?: string
}

const CLOCK_PART = /^\d+(?:\.\d+)?$/

/** `[[DD-]HH:]MM:SS[.ff]` as `ps` prints cputime and etime; NaN when malformed. */
export function parseClock(text: string): number {
  const dash = text.indexOf('-')
  const days = dash >= 0 ? text.slice(0, dash) : '0'
  const parts = (dash >= 0 ? text.slice(dash + 1) : text).split(':')
  if (parts.length > 3 || !CLOCK_PART.test(days) || !parts.every((part) => CLOCK_PART.test(part)))
    return NaN
  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + Number(part)
  return Number(days) * 86_400 + seconds
}

const PS_ROW = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/

export function parsePs(output: string): PsRow[] {
  const rows: PsRow[] = []
  for (const line of output.split('\n')) {
    const match = PS_ROW.exec(line)
    if (!match) continue
    const cpuSec = parseClock(match[4])
    const etimeSec = parseClock(match[5])
    if (Number.isNaN(cpuSec) || Number.isNaN(etimeSec)) continue
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssKb: Number(match[3]),
      cpuSec,
      etimeSec,
      command: match[6]
    })
  }
  return rows
}

/** `rootPid` and everything below it; empty when the root is not in `rows`. */
export function descendantsOf(rows: readonly PsRow[], rootPid: number): Set<number> {
  const children = new Map<number, number[]>()
  let rootSeen = false
  for (const row of rows) {
    if (row.pid === rootPid) rootSeen = true
    const siblings = children.get(row.ppid)
    if (siblings) siblings.push(row.pid)
    else children.set(row.ppid, [row.pid])
  }
  const found = new Set<number>()
  if (!rootSeen) return found
  const queue = [rootPid]
  while (queue.length > 0) {
    const pid = queue.pop()!
    if (found.has(pid)) continue
    found.add(pid)
    queue.push(...(children.get(pid) ?? []))
  }
  return found
}

/** `ps %cpu` is a decayed average, so only cumulative cputime is read. `command` is added when CDP cannot classify processes. */
export type RunPs = (withCommand: boolean) => Promise<string>

export const runPs: RunPs = (withCommand) =>
  new Promise((resolve, reject) => {
    const columns = `pid=,ppid=,rss=,cputime=,etime=${withCommand ? ',command=' : ''}`
    execFile('ps', ['-axo', columns], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) =>
      error ? reject(error) : resolve(stdout)
    )
  })

export type LookupName = (pid: number) => Promise<string | null>

export const lookupProcessName: LookupName = (pid) =>
  new Promise((resolve) => {
    execFile('ps', ['-o', 'comm=', '-p', String(pid)], (error, stdout) => {
      const name = stdout.trim().split('/').pop() ?? ''
      resolve(error || !name ? null : name)
    })
  })

type Kind = 'main' | 'renderer' | 'gpu' | 'other'

function kindFromCdp(type: string): Kind {
  const lowered = type.toLowerCase()
  if (lowered === 'browser') return 'main'
  if (lowered === 'renderer') return 'renderer'
  if (lowered === 'gpu') return 'gpu'
  return 'other'
}

function kindFromCommand(command: string | undefined): Kind {
  const type = /--type=([\w-]+)/.exec(command ?? '')?.[1]
  if (type === 'renderer') return 'renderer'
  if (type === 'gpu-process') return 'gpu'
  return 'other'
}

interface Counter {
  cpuSec: number
  at: number
}

const WINDOW_MS = 5_000
const NAME_LOOKUP_MIN_PCT = 25

export class ProcessProbe {
  private browser: CdpConnection | null = null
  private cdpUnavailable: string | null = null
  private readonly prevCdp = new Map<number, Counter>()
  private readonly prevPs = new Map<number, Counter>()
  private readonly names = new Map<number, string>()
  private readonly window: Array<{ at: number; cpuSec: number; dtSec: number }> = []
  private lastTickAt: number | null = null
  private busy = false

  constructor(
    private readonly ctx: ProbeContext,
    private readonly deps: { runPs?: RunPs; lookupName?: LookupName } = {}
  ) {}

  close(): void {
    this.browser?.close()
  }

  private async cdpProcesses(): Promise<{
    at: number
    procs: Map<number, { type: string; cpuSec: number }>
  } | null> {
    if (this.cdpUnavailable) return null
    try {
      if (!this.browser || this.browser.closed) {
        const version = await fetchJson<{ webSocketDebuggerUrl?: string }>(
          `http://127.0.0.1:${this.ctx.handles.cdpPort}/json/version`
        )
        if (!version.webSocketDebuggerUrl)
          throw new Error('/json/version has no webSocketDebuggerUrl')
        this.browser = await CdpConnection.open(version.webSocketDebuggerUrl, this.ctx.now)
      }
      const sentAt = this.ctx.now()
      const result = await this.browser.send<{
        processInfo?: Array<{ type?: string; id?: number; cpuTime?: number }>
      }>('SystemInfo.getProcessInfo', {}, 3_000)
      const at = (sentAt + this.ctx.now()) / 2
      const procs = new Map<number, { type: string; cpuSec: number }>()
      for (const info of result.processInfo ?? []) {
        if (typeof info.id === 'number' && typeof info.cpuTime === 'number') {
          procs.set(info.id, { type: info.type ?? '', cpuSec: info.cpuTime })
        }
      }
      return { at, procs }
    } catch (error) {
      if (error instanceof CdpError && error.code === -32601) {
        this.cdpUnavailable = error.message
        this.ctx.note(`process CPU comes from ps cputime (0.01 s steps): ${error.message}`)
      }
      return null
    }
  }

  /** The 5 s average of app-wide CPU (percent of one core), or null while there is nothing to average yet. */
  async poll(): Promise<number | null> {
    if (this.busy) return null
    this.busy = true
    try {
      return await this.measure()
    } finally {
      this.busy = false
    }
  }

  private async measure(): Promise<number | null> {
    const ctx = this.ctx
    const cdp = await this.cdpProcesses()
    const sentAt = ctx.now()
    let output: string
    try {
      output = await (this.deps.runPs ?? runPs)(this.cdpUnavailable !== null)
    } catch {
      ctx.blind.begin('cpu')
      return null
    }
    const psAt = (sentAt + ctx.now()) / 2
    const rows = parsePs(output)
    const byPid = new Map(rows.map((row) => [row.pid, row]))
    const tree = descendantsOf(rows, ctx.handles.mainPid)
    if (tree.size === 0) return null
    ctx.blind.end('cpu')

    const pids = new Set(tree)
    for (const pid of cdp?.procs.keys() ?? []) pids.add(pid)

    const tickDtSec = this.lastTickAt === null ? 0 : (psAt - this.lastTickAt) / 1000
    const perKind: Record<Kind, number> = { main: 0, renderer: 0, gpu: 0, other: 0 }
    const rates: Array<{ pid: number; kind: Kind; pct: number }> = []
    let rssKb = 0
    const nextCdp = new Map<number, Counter>()
    const nextPs = new Map<number, Counter>()

    for (const pid of pids) {
      const row = byPid.get(pid)
      const cdpInfo = cdp?.procs.get(pid)
      if (row) rssKb += row.rssKb
      if (cdpInfo && cdp) nextCdp.set(pid, { cpuSec: cdpInfo.cpuSec, at: cdp.at })
      if (row) nextPs.set(pid, { cpuSec: row.cpuSec, at: psAt })

      let rate: number | undefined
      const prevC = this.prevCdp.get(pid)
      const prevP = this.prevPs.get(pid)
      if (cdpInfo && cdp && prevC && cdp.at > prevC.at) {
        rate = (cdpInfo.cpuSec - prevC.cpuSec) / ((cdp.at - prevC.at) / 1000)
      } else if (row && prevP && psAt > prevP.at) {
        rate = (row.cpuSec - prevP.cpuSec) / ((psAt - prevP.at) / 1000)
      } else if (this.lastTickAt !== null && tickDtSec > 0) {
        const cumulative = cdpInfo?.cpuSec ?? row?.cpuSec
        const youngEnough = row === undefined || row.etimeSec <= tickDtSec + 1.5
        if (cumulative !== undefined && youngEnough) rate = cumulative / tickDtSec
      }
      if (rate === undefined || !Number.isFinite(rate)) continue

      const pct = Math.max(0, rate) * 100
      const kind: Kind =
        pid === ctx.handles.mainPid
          ? 'main'
          : cdpInfo
            ? kindFromCdp(cdpInfo.type)
            : kindFromCommand(row?.command)
      perKind[kind] += pct
      rates.push({ pid, kind, pct })
    }

    this.prevCdp.clear()
    for (const [pid, counter] of nextCdp) this.prevCdp.set(pid, counter)
    this.prevPs.clear()
    for (const [pid, counter] of nextPs) this.prevPs.set(pid, counter)

    const previousTickAt = this.lastTickAt
    this.lastTickAt = psAt
    if (previousTickAt === null) return null

    const total = perKind.main + perKind.renderer + perKind.gpu + perKind.other
    const rssMb = rssKb / 1024
    const phase = ctx.phases.current
    phase.cpu.push(total)
    phase.mainCpu.push(perKind.main)
    phase.rendererCpu.push(perKind.renderer)
    phase.rss.push(rssMb)

    this.window.push({ at: psAt, cpuSec: (total / 100) * tickDtSec, dtSec: tickDtSec })
    while (this.window.length > 1 && psAt - this.window[0].at > WINDOW_MS) this.window.shift()
    let windowCpu = 0
    let windowDt = 0
    for (const entry of this.window) {
      windowCpu += entry.cpuSec
      windowDt += entry.dtSec
    }
    const avg5 = windowDt > 0 ? (windowCpu / windowDt) * 100 : 0

    const top = await this.describeTop(rates)
    ctx.timeline('tick', {
      k: 'cpu',
      total: Math.round(total),
      main: Math.round(perKind.main),
      renderer: Math.round(perKind.renderer),
      gpu: Math.round(perKind.gpu),
      other: Math.round(perKind.other),
      avg5: Math.round(avg5),
      rssMb: Math.round(rssMb),
      procs: pids.size,
      top,
      src: cdp ? 'cdp+ps' : 'ps'
    })

    const spanMs =
      this.window.length > 1 ? psAt - this.window[0].at + tickDtSec * 1000 : tickDtSec * 1000
    if (spanMs >= Math.min(3_000, ctx.intervalMs * 3)) {
      ctx.episodes.observe('cpu:app', 'cpu', avg5, ctx.thresholds.cpuPct, {
        unit: 'pct',
        context: top
      })
    }
    ctx.episodes.observe('rss:app', 'rss', rssMb, ctx.thresholds.rssMb, {
      unit: 'mb',
      context: `${pids.size} processes`
    })
    return avg5
  }

  private async describeTop(
    rates: Array<{ pid: number; kind: Kind; pct: number }>
  ): Promise<string> {
    const top = rates
      .filter((entry) => entry.pct >= 5)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3)
    let lookedUp = false
    const parts: string[] = []
    for (const entry of top) {
      let label: string = entry.kind
      if (entry.kind === 'other') {
        let name = this.names.get(entry.pid)
        if (!name && !lookedUp && entry.pct >= NAME_LOOKUP_MIN_PCT) {
          lookedUp = true
          name = (await (this.deps.lookupName ?? lookupProcessName)(entry.pid)) ?? undefined
          if (name) this.names.set(entry.pid, name)
        }
        label = name ?? `pid ${entry.pid}`
      } else if (entry.kind !== 'main') {
        label = `${entry.kind} ${entry.pid}`
      }
      parts.push(`${label} ${Math.round(entry.pct)}%`)
    }
    return parts.join(', ')
  }
}
