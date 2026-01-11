type PerfContextEntry = {
  label: string
  startedAt: number
  meta?: Record<string, unknown>
}

const contexts = new Map<string, PerfContextEntry>()

function buildContextId(label: string): string {
  return `${label}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

export function enterPerfContext(label: string, meta?: Record<string, unknown>): () => void {
  const id = buildContextId(label)
  contexts.set(id, { label, startedAt: Date.now(), meta })
  return () => {
    contexts.delete(id)
  }
}

export function getPerfContextSnapshot(
  limit = 3,
): Array<{ label: string, durationMs: number, meta?: Record<string, unknown> }> {
  const now = Date.now()
  return Array.from(contexts.values())
    .map(entry => ({
      label: entry.label,
      durationMs: Math.max(0, now - entry.startedAt),
      meta: entry.meta,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, Math.max(0, limit))
}
