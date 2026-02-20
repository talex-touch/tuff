interface PerfContextEntry {
  label: string
  startedAt: number
  meta?: Record<string, unknown>
}

const contexts = new Map<string, PerfContextEntry>()
const CONTEXT_WARN_MS = 200

function buildContextId(label: string): string {
  return `${label}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

export function enterPerfContext(label: string, meta?: Record<string, unknown>): () => void {
  const id = buildContextId(label)
  contexts.set(id, { label, startedAt: Date.now(), meta })
  return () => {
    const entry = contexts.get(id)
    if (entry) {
      const durationMs = Math.max(0, Date.now() - entry.startedAt)
      if (durationMs >= CONTEXT_WARN_MS) {
        if (entry.meta) {
          console.warn(`[Perf:Context] ${label} ${Math.round(durationMs)}ms`, {
            meta: entry.meta
          })
        } else {
          console.warn(`[Perf:Context] ${label} ${Math.round(durationMs)}ms`)
        }
      }
    }
    contexts.delete(id)
  }
}

export function getPerfContextSnapshot(
  limit = 3
): Array<{ label: string; durationMs: number; meta?: Record<string, unknown> }> {
  const now = Date.now()
  return Array.from(contexts.values())
    .map((entry) => ({
      label: entry.label,
      durationMs: Math.max(0, now - entry.startedAt),
      meta: entry.meta
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, Math.max(0, limit))
}
