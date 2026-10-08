import { createLogger } from './logger'

interface PerfContextEntry {
  label: string
  startedAt: number
  mode: PerfContextMode
  meta?: Record<string, unknown>
}

const contexts = new Map<string, PerfContextEntry>()
const CONTEXT_WARN_MS = 200
const CONTEXT_LAG_WINDOW_MS = 1000
const perfContextLog = createLogger('Perf').child('Context')
/**
 * Contexts that already closed are what an event-loop lag report usually needs: a synchronous
 * block disposes its context before the lag timer gets to run, so the live snapshot is empty
 * exactly when the attribution matters. Short ones are noise, so only >= 50ms are kept.
 */
const RECENT_CONTEXT_MIN_DURATION_MS = 50
const RECENT_CONTEXT_LIMIT = 16

export type PerfContextMode = 'duration' | 'blocking'

interface RecentPerfContextEntry {
  label: string
  durationMs: number
  endedAt: number
  mode: PerfContextMode
  meta?: Record<string, unknown>
}

const recentContexts: RecentPerfContextEntry[] = []

export interface PerfContextOptions {
  mode?: PerfContextMode
  warnMs?: number
  lagWindowMs?: number
}

interface RecentEventLoopLag {
  lagMs: number
  severity: 'warn' | 'error'
  at: number
}

let recentEventLoopLag: RecentEventLoopLag | null = null

function buildContextId(label: string): string {
  return `${label}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function summarizeMeta(meta?: Record<string, unknown>): string | undefined {
  if (!meta) return undefined
  try {
    return JSON.stringify(meta)
  } catch {
    return '[unserializable]'
  }
}

function getRecentLag(windowMs: number): RecentEventLoopLag | null {
  if (!recentEventLoopLag) return null
  return Date.now() - recentEventLoopLag.at <= windowMs ? recentEventLoopLag : null
}

export function markPerfEventLoopLag(lag: RecentEventLoopLag): void {
  recentEventLoopLag = lag
}

/**
 * The last event-loop lag the monitor recorded. Cheap to depend on from modules that must not
 * pull in `perf-monitor` (it drags the Sentry SDK along), such as background maintenance loops
 * that want to space themselves out after the loop has just stalled.
 */
export function getRecentPerfEventLoopLag(): RecentEventLoopLag | null {
  return recentEventLoopLag ? { ...recentEventLoopLag } : null
}

export function enterPerfContext(
  label: string,
  meta?: Record<string, unknown>,
  options: PerfContextOptions = {}
): () => void {
  const id = buildContextId(label)
  const mode = options.mode ?? 'duration'
  contexts.set(id, { label, startedAt: Date.now(), mode, meta })
  return () => {
    const entry = contexts.get(id)
    if (entry) {
      const endedAt = Date.now()
      const durationMs = Math.max(0, endedAt - entry.startedAt)
      if (durationMs >= RECENT_CONTEXT_MIN_DURATION_MS) {
        recentContexts.push({
          label,
          durationMs: Math.round(durationMs),
          endedAt,
          mode: entry.mode,
          meta: entry.meta
        })
        if (recentContexts.length > RECENT_CONTEXT_LIMIT) recentContexts.shift()
      }
      const warnMs = options.warnMs ?? CONTEXT_WARN_MS
      const recentLag = getRecentLag(options.lagWindowMs ?? CONTEXT_LAG_WINDOW_MS)
      const shouldWarn = durationMs >= warnMs && (entry.mode === 'blocking' || Boolean(recentLag))
      if (shouldWarn) {
        perfContextLog.warn('Slow perf context', {
          meta: {
            label,
            durationMs: Math.round(durationMs),
            mode: entry.mode,
            eventLoopLagMs: recentLag?.lagMs,
            eventLoopLagSeverity: recentLag?.severity,
            context: summarizeMeta(entry.meta)
          }
        })
      }
    }
    contexts.delete(id)
  }
}

/**
 * Contexts that ended within the last `windowMs`, longest first. A lag report passes the lag
 * span plus a little slack, so a block that closed just before the report still gets named.
 */
export function getRecentPerfContextSnapshot(
  windowMs: number,
  limit = 3
): Array<{
  label: string
  durationMs: number
  mode: PerfContextMode
  endedAgoMs: number
  meta?: Record<string, unknown>
}> {
  const now = Date.now()
  const since = now - Math.max(0, windowMs)
  return recentContexts
    .filter((entry) => entry.endedAt >= since)
    .map((entry) => ({
      label: entry.label,
      durationMs: entry.durationMs,
      mode: entry.mode,
      endedAgoMs: Math.max(0, now - entry.endedAt),
      meta: entry.meta
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, Math.max(0, limit))
}

export function getPerfContextSnapshot(limit = 3): Array<{
  label: string
  durationMs: number
  mode: PerfContextMode
  meta?: Record<string, unknown>
}> {
  const now = Date.now()
  return Array.from(contexts.values())
    .map((entry) => ({
      label: entry.label,
      durationMs: Math.max(0, now - entry.startedAt),
      mode: entry.mode,
      meta: entry.meta
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, Math.max(0, limit))
}
