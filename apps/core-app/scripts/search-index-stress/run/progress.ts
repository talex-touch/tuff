import { execFile } from 'node:child_process'
import type { CheckResult } from '../types'
import type { Clock } from './clock'
import type { ListProcesses } from './process-info'
import { descendantsOf, listProcesses } from './process-info'

type Outcome = CheckResult['outcome']

export interface Progress {
  setPhase: (name: string) => void
  setTotal: (total: number) => void
  scenarioSettled: () => number
  check: (outcome: Outcome) => void
  line: (extra: { pressure: string; cpuPct: number | null; inflight?: number }) => string
}

const RATE_WINDOW_MS = 60_000

const formatMinutes = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes < 0) return '?'
  if (minutes < 1) return '<1m'
  const whole = Math.round(minutes)
  return whole < 60
    ? `${whole}m`
    : `${Math.floor(whole / 60)}h${String(whole % 60).padStart(2, '0')}m`
}

/** What the one-line ticker prints: where the run is, how fast it goes, and how the results stand. */
export function createProgress(clock: Clock): Progress {
  const state = { phase: 'starting', total: 0, settled: 0 }
  const counts: Record<Outcome, number> = { pass: 0, fail: 0, error: 0, skipped: 0 }
  const startedAt = clock.now()
  const finishedAt: number[] = []

  return {
    setPhase: (name) => {
      state.phase = name
    },
    setTotal: (total) => {
      state.total = total
    },
    scenarioSettled: () => {
      state.settled += 1
      finishedAt.push(clock.now())
      return state.settled
    },
    check: (outcome) => {
      counts[outcome] += 1
    },
    line: (extra) => {
      const now = clock.now()
      while (finishedAt.length > 0 && now - finishedAt[0] > RATE_WINDOW_MS) finishedAt.shift()
      const perMin =
        finishedAt.length / (Math.max(Math.min(RATE_WINDOW_MS, now - startedAt), 1_000) / 60_000)
      const remaining = Math.max(0, state.total - state.settled)
      const parts = [
        `${state.phase} ${state.settled}/${state.total}${state.total > 0 ? ` (${Math.floor((state.settled * 100) / state.total)}%)` : ''}`,
        `${perMin.toFixed(1)}/min${perMin > 0 && remaining > 0 ? ` eta ${formatMinutes(remaining / perMin)}` : ''}`,
        `pass ${counts.pass} fail ${counts.fail} err ${counts.error} skip ${counts.skipped}`,
        ...(extra.inflight !== undefined ? [`in flight ${extra.inflight}`] : []),
        `pressure ${extra.pressure}`,
        `app cpu ${extra.cpuPct === null ? '?' : `${Math.round(extra.cpuPct)}%`}`
      ]
      return parts.join(' | ')
    }
  }
}

/** `[[dd-][hh:]]mm:ss[.ff]` as `ps` prints accumulated CPU time. */
export function parseCpuTime(text: string): number | null {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(text.trim())
  if (!match) return null
  const [, days, hours, minutes, seconds] = match
  return (
    Number(days ?? 0) * 86_400 + Number(hours ?? 0) * 3_600 + Number(minutes) * 60 + Number(seconds)
  )
}

export type PsCpu = (pids: readonly number[]) => Promise<string>

const defaultPsCpu: PsCpu = (pids) =>
  new Promise((resolve, reject) => {
    execFile(
      'ps',
      ['-o', 'pid=,time=', '-p', pids.join(',')],
      { timeout: 5_000, maxBuffer: 1 << 20 },
      (error, stdout) => {
        // ps exits 1 when some of the pids are gone; what it still printed is usable.
        if (error && !String(stdout).trim()) reject(error)
        else resolve(String(stdout))
      }
    )
  })

export interface CpuSampler {
  /** Percent of one core used by the process and its descendants since the previous call; null on the first call or when unreadable. */
  sample: (rootPid: number) => Promise<number | null>
}

export function createCpuSampler(
  clock: Clock,
  deps: { listProcesses?: ListProcesses; psCpu?: PsCpu } = {}
): CpuSampler {
  const list = deps.listProcesses ?? listProcesses
  const psCpu = deps.psCpu ?? defaultPsCpu
  let last: { at: number; seconds: number } | null = null
  return {
    async sample(rootPid) {
      try {
        const tree = descendantsOf(rootPid, await list())
        const pids = [rootPid, ...tree.map((proc) => proc.pid)]
        let seconds = 0
        for (const line of (await psCpu(pids)).split('\n')) {
          const match = /^\s*\d+\s+(\S+)\s*$/.exec(line)
          const parsed = match ? parseCpuTime(match[1]) : null
          if (parsed !== null) seconds += parsed
        }
        const now = clock.now()
        const previous = last
        last = { at: now, seconds }
        if (!previous || now <= previous.at) return null
        return (Math.max(0, seconds - previous.seconds) / ((now - previous.at) / 1000)) * 100
      } catch {
        return null
      }
    }
  }
}
