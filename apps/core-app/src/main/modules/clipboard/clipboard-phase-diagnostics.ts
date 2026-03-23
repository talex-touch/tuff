import { performance } from 'node:perf_hooks'

const CLIPBOARD_PHASE_SUMMARY_LIMIT = 8

export type ClipboardPhaseDurations = Record<string, number>
export type ClipboardPhaseAlertLevel = 'normal' | 'low' | 'medium' | 'high' | 'critical'

export interface ClipboardPhaseDiagnostics {
  slowestPhase: string | null
  slowestPhaseMs: number
  phaseMs: string
  phaseAlertLevel: ClipboardPhaseAlertLevel
  phaseAlertCode: string
  phaseAdvice: string
  phaseTop2: string | null
  phaseTop2Ms: number
  phaseTop3: string | null
  phaseTop3Ms: number
}

export function trackPhase<T>(
  target: ClipboardPhaseDurations,
  phase: string,
  operation: () => T
): T {
  const startedAt = performance.now()
  try {
    return operation()
  } finally {
    target[phase] = (target[phase] ?? 0) + (performance.now() - startedAt)
  }
}

export async function trackPhaseAsync<T>(
  target: ClipboardPhaseDurations,
  phase: string,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now()
  try {
    return await operation()
  } finally {
    target[phase] = (target[phase] ?? 0) + (performance.now() - startedAt)
  }
}

export function summarizePhaseDurations(
  durations: ClipboardPhaseDurations,
  maxEntries = CLIPBOARD_PHASE_SUMMARY_LIMIT
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(durations)
      .filter(([, value]) => value >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, maxEntries))
      .map(([name, value]) => [name, Math.round(value)])
  )
}

function getSlowestPhase(
  durations: ClipboardPhaseDurations
): { name: string; durationMs: number } | null {
  const entries = Object.entries(durations)
  if (entries.length === 0) {
    return null
  }
  const [name, durationMs] = entries.sort((a, b) => b[1] - a[1])[0]
  return { name, durationMs: Math.round(durationMs) }
}

function resolvePhaseAlertCode(slowestPhase: string | null): string {
  if (!slowestPhase) {
    return 'none'
  }
  if (slowestPhase === 'gate.waitForIdle') {
    return 'gate_wait'
  }
  if (
    slowestPhase === 'clipboard.readImage' ||
    slowestPhase.startsWith('image.') ||
    slowestPhase === 'eventLoop.yieldBeforeImageEncode'
  ) {
    return 'image_pipeline'
  }
  if (slowestPhase.startsWith('db.')) {
    return 'db_persist'
  }
  if (slowestPhase === 'activeApp.snapshot') {
    return 'active_app'
  }
  if (
    slowestPhase === 'clipboard.readText' ||
    slowestPhase === 'clipboard.readHTML' ||
    slowestPhase === 'clipboard.readFiles'
  ) {
    return 'clipboard_read'
  }
  if (slowestPhase.startsWith('signature.') || slowestPhase.startsWith('diff.')) {
    return 'signature_diff'
  }
  if (slowestPhase.startsWith('meta.')) {
    return 'meta_serialize'
  }
  return 'mixed'
}

function resolvePhaseAdvice(phaseAlertCode: string): string {
  switch (phaseAlertCode) {
    case 'gate_wait':
      return 'check appTaskGate backlog and startup task overlap'
    case 'image_pipeline':
      return 'reduce image encode work in poll path or defer heavy image handling'
    case 'db_persist':
      return 'inspect dbWrite queue depth and sqlite contention'
    case 'active_app':
      return 'prefer includeIcon=false and increase active-app cache ttl for poll path'
    case 'clipboard_read':
      return 'avoid unnecessary clipboard readHTML/readImage in fast path'
    case 'signature_diff':
      return 'optimize signature/diff computation and avoid repeated sorting'
    case 'meta_serialize':
      return 'reduce metadata payload size and serialization frequency'
    default:
      return 'inspect phaseMs top entries and correlate with event loop lag timeline'
  }
}

function resolvePhaseAlertLevel(
  slowestPhase: string | null,
  slowestPhaseMs: number,
  levelBaseDurationMs: number
): ClipboardPhaseAlertLevel {
  if (!slowestPhase) {
    return 'normal'
  }

  if (slowestPhase === 'gate.waitForIdle') {
    if (slowestPhaseMs >= 3000) return 'critical'
    if (slowestPhaseMs >= 1800) return 'high'
    if (slowestPhaseMs >= 900) return 'medium'
    if (slowestPhaseMs >= 400) return 'low'
    return 'normal'
  }

  const compositeDuration = Math.max(slowestPhaseMs, levelBaseDurationMs)
  if (compositeDuration >= 2200) return 'critical'
  if (compositeDuration >= 1200) return 'high'
  if (compositeDuration >= 500) return 'medium'
  if (compositeDuration >= 200) return 'low'
  return 'normal'
}

export function buildPhaseDiagnostics(
  durations: ClipboardPhaseDurations,
  levelBaseDurationMs: number
): ClipboardPhaseDiagnostics {
  const sortedEntries = Object.entries(durations)
    .filter(([, value]) => value >= 1)
    .sort((a, b) => b[1] - a[1])

  const slowest = getSlowestPhase(durations)
  const slowestPhase = slowest?.name ?? null
  const slowestPhaseMs = slowest?.durationMs ?? 0
  const phaseAlertCode = resolvePhaseAlertCode(slowestPhase)
  const phaseAlertLevel = resolvePhaseAlertLevel(slowestPhase, slowestPhaseMs, levelBaseDurationMs)
  const phaseSummary = summarizePhaseDurations(durations)
  const second = sortedEntries[1]
  const third = sortedEntries[2]

  return {
    slowestPhase,
    slowestPhaseMs,
    phaseMs: JSON.stringify(phaseSummary),
    phaseAlertLevel,
    phaseAlertCode,
    phaseAdvice: resolvePhaseAdvice(phaseAlertCode),
    phaseTop2: second?.[0] ?? null,
    phaseTop2Ms: second ? Math.round(second[1]) : 0,
    phaseTop3: third?.[0] ?? null,
    phaseTop3Ms: third ? Math.round(third[1]) : 0
  }
}

export function toPerfSeverity(level: ClipboardPhaseAlertLevel): 'warn' | 'error' | null {
  if (level === 'high' || level === 'critical') {
    return 'error'
  }
  if (level === 'low' || level === 'medium') {
    return 'warn'
  }
  return null
}
