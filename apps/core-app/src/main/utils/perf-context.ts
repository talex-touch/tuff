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

export type PerfContextMode = 'duration' | 'blocking'

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
      const durationMs = Math.max(0, Date.now() - entry.startedAt)
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
