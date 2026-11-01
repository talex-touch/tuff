import { stripAnsi } from './db-markers'

export interface AppLag {
  at: number
  lagMs: number
  suspect?: string
  contexts?: string[]
}

// `[Perf:EventLoop] Event loop lag 2.8s (...) lagMs=2825 contexts=[...] ... suspectedCause=...`
// is written by src/main/utils/perf-monitor.ts; the "diagnostics" line that follows it is skipped.
const LAG_LINE = /\[Perf:EventLoop\] Event loop lag (?!diagnostics)(\d+(?:\.\d+)?)(ms|s)\b/
const LAG_MS = /\blagMs=(\d+)/
const SUSPECTED_CAUSE = /\bsuspectedCause=([a-z_]+)/
const SUSPECT_IN_HEAD = /\bsuspect=([a-z_]+)/
const CONTEXTS = /\bcontexts=(\[.*?\])(?= (?:primaryContext|recentContexts|pollingActive)=)/
const ISO_PREFIX = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)\]/
const CLOCK = /\[(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/
const DAY_MS = 86_400_000

function resolveTimestamp(line: string, readAtMs: number): number {
  const iso = ISO_PREFIX.exec(line)
  if (iso) {
    const parsed = Date.parse(iso[1])
    if (Number.isFinite(parsed)) return parsed
  }
  const clock = CLOCK.exec(line)
  if (clock) {
    const day = new Date(readAtMs)
    day.setHours(Number(clock[1]), Number(clock[2]), Number(clock[3]), Number(clock[4]))
    const candidate = day.getTime()
    return candidate > readAtMs + 60_000 ? candidate - DAY_MS : candidate
  }
  return readAtMs
}

function parseContexts(line: string): string[] | undefined {
  const match = CONTEXTS.exec(line)
  if (!match) return undefined
  try {
    const parsed: unknown = JSON.parse(match[1])
    if (!Array.isArray(parsed)) return undefined
    const labels = parsed
      .map((entry) =>
        entry && typeof entry === 'object' ? (entry as { label?: unknown }).label : undefined
      )
      .filter((label): label is string => typeof label === 'string')
    return labels.length > 0 ? labels : undefined
  } catch {
    const labels = [...match[1].matchAll(/"label":"([^"]+)"/g)].map((m) => m[1])
    return labels.length > 0 ? labels : undefined
  }
}

/** `readAtMs` stands in for the log's own timestamp when the line carries none. */
export function parseAppLagLine(rawLine: string, readAtMs: number): AppLag | null {
  const line = stripAnsi(rawLine)
  const head = LAG_LINE.exec(line)
  if (!head) return null

  const explicit = LAG_MS.exec(line)
  const lagMs = explicit
    ? Number(explicit[1])
    : Math.round(Number(head[1]) * (head[2] === 's' ? 1000 : 1))
  if (!Number.isFinite(lagMs)) return null

  const cause = SUSPECTED_CAUSE.exec(line)?.[1] ?? SUSPECT_IN_HEAD.exec(line)?.[1]
  const lag: AppLag = { at: resolveTimestamp(line, readAtMs), lagMs }
  if (cause && cause !== 'null') lag.suspect = cause
  const contexts = parseContexts(line)
  if (contexts) lag.contexts = contexts
  return lag
}
