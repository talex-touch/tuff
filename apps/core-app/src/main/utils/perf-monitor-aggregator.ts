type IpcDirection = 'renderer->main' | 'main->renderer'

export interface PerfIncidentLike {
  kind: string
  severity: 'warn' | 'error'
  eventName?: string
  durationMs?: number
  direction?: IpcDirection
  meta?: Record<string, unknown>
}

export function summarizeIncidentKinds(snapshot: PerfIncidentLike[], limit = 6): string {
  const byKind = new Map<string, number>()
  for (const incident of snapshot) {
    byKind.set(incident.kind, (byKind.get(incident.kind) ?? 0) + 1)
  }

  return Array.from(byKind.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(' ')
}

export function pickTopSlowIncidents(snapshot: PerfIncidentLike[], limit = 5): PerfIncidentLike[] {
  return snapshot
    .filter((incident) => typeof incident.durationMs === 'number')
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, limit)
}

export function buildTopEvents(
  snapshot: PerfIncidentLike[],
  limit = 6
): Array<{ key: string; count: number }> {
  const eventCounts = new Map<string, number>()
  for (const incident of snapshot) {
    if (!incident.eventName) continue
    const channelType =
      incident.meta && typeof incident.meta.channelType === 'string'
        ? incident.meta.channelType
        : undefined
    const direction = incident.direction ? `:${incident.direction}` : ''
    const channel = channelType ? `:${channelType}` : ''
    const key = `${incident.kind}${direction}${channel}:${incident.eventName}`
    eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
  }

  return Array.from(eventCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }))
}

export function buildTopPhaseCodes(
  snapshot: PerfIncidentLike[],
  limit = 6
): Array<{ code: string; count: number; maxDurationMs: number }> {
  const phaseCodeStats = new Map<string, { count: number; maxDurationMs: number }>()
  for (const incident of snapshot) {
    const metaPhaseCode =
      incident.meta && typeof incident.meta.phaseAlertCode === 'string'
        ? incident.meta.phaseAlertCode
        : undefined
    const derivedPhaseCode =
      incident.kind.startsWith('main.clipboard.') &&
      typeof incident.eventName === 'string' &&
      incident.eventName.trim().length > 0
        ? incident.eventName.trim()
        : undefined

    const phaseCode = metaPhaseCode ?? derivedPhaseCode
    if (!phaseCode) continue

    const entry = phaseCodeStats.get(phaseCode) ?? { count: 0, maxDurationMs: 0 }
    entry.count += 1
    entry.maxDurationMs = Math.max(entry.maxDurationMs, Math.round(incident.durationMs ?? 0))
    phaseCodeStats.set(phaseCode, entry)
  }

  return Array.from(phaseCodeStats.entries())
    .sort((a, b) => {
      if (b[1].count !== a[1].count) {
        return b[1].count - a[1].count
      }
      return b[1].maxDurationMs - a[1].maxDurationMs
    })
    .slice(0, limit)
    .map(([code, value]) => ({
      code,
      count: value.count,
      maxDurationMs: value.maxDurationMs
    }))
}
