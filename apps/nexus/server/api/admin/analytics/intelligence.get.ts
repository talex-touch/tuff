import { requireAdmin } from '../../../utils/auth'
import { listRuntimeAudits } from '../../../utils/intelligenceStore'

interface RuntimeMetricMetadata {
  status?: string
  totalActions?: number
  completedActions?: number
  failedActions?: number
  waitingApprovals?: number
  approvalHitCount?: number
  fallbackCount?: number
  retryCount?: number
  streamEventCount?: number
  durationMs?: number
  sessionId?: string
  toolFailureDistribution?: Record<string, number>
  disconnectPaused?: boolean
  pauseReason?: string | null
  checkpointLossCount?: number
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0)
    return 0
  return Number(((numerator / denominator) * 100).toFixed(2))
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function parseRuntimeMetadata(value: unknown): RuntimeMetricMetadata {
  const row = asRecord(value)
  const toolFailureDistribution = asRecord(row.toolFailureDistribution)
  const normalizedDistribution: Record<string, number> = {}
  for (const [toolId, count] of Object.entries(toolFailureDistribution)) {
    normalizedDistribution[toolId] = toNumber(count, 0)
  }
  return {
    status: typeof row.status === 'string' ? row.status : undefined,
    totalActions: toNumber(row.totalActions, 0),
    completedActions: toNumber(row.completedActions, 0),
    failedActions: toNumber(row.failedActions, 0),
    waitingApprovals: toNumber(row.waitingApprovals, 0),
    approvalHitCount: toNumber(row.approvalHitCount, 0),
    fallbackCount: toNumber(row.fallbackCount, 0),
    retryCount: toNumber(row.retryCount, 0),
    streamEventCount: toNumber(row.streamEventCount, 0),
    durationMs: toNumber(row.durationMs, 0),
    sessionId: typeof row.sessionId === 'string' ? row.sessionId : undefined,
    toolFailureDistribution: normalizedDistribution,
    disconnectPaused: row.disconnectPaused === true,
    pauseReason: typeof row.pauseReason === 'string' ? row.pauseReason : null,
    checkpointLossCount: toNumber(row.checkpointLossCount, 0),
  }
}

function percentile(values: number[], p: number): number {
  if (values.length <= 0)
    return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index] || 0
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365)
  const audits = await listRuntimeAudits(event, { days, limit: 2000 })

  const toolFailureDistribution: Record<string, number> = {}
  const statusDistribution: Record<string, number> = {}
  const durations: number[] = []

  let totalActions = 0
  let completedActions = 0
  let failedActions = 0
  let waitingApprovals = 0
  let approvalHits = 0
  let fallbackRuns = 0
  let retryRuns = 0
  let recoveredRuns = 0
  let streamEnabledRuns = 0
  let disconnectPausedRuns = 0
  let checkpointLossCount = 0

  const recentRuns = audits.slice(0, 12).map((audit) => {
    const metadata = parseRuntimeMetadata(audit.metadata)
    return {
      sessionId: metadata.sessionId || audit.traceId || audit.id,
      status: metadata.status || (audit.success ? 'completed' : 'failed'),
      providerName: audit.providerName,
      model: audit.model,
      fallbackCount: metadata.fallbackCount || 0,
      approvalHitCount: metadata.approvalHitCount || 0,
      durationMs: metadata.durationMs || audit.latency || 0,
      createdAt: audit.createdAt,
    }
  })

  for (const audit of audits) {
    const metadata = parseRuntimeMetadata(audit.metadata)
    const status = metadata.status || (audit.success ? 'completed' : 'failed')
    statusDistribution[status] = (statusDistribution[status] ?? 0) + 1

    const duration = metadata.durationMs || audit.latency || 0
    durations.push(duration)

    totalActions += metadata.totalActions || 0
    completedActions += metadata.completedActions || 0
    failedActions += metadata.failedActions || 0
    waitingApprovals += metadata.waitingApprovals || 0
    approvalHits += metadata.approvalHitCount || 0

    const fallbackCount = metadata.fallbackCount || 0
    const retryCount = metadata.retryCount || 0
    if (fallbackCount > 0)
      fallbackRuns += 1
    if (retryCount > 0)
      retryRuns += 1
    if ((fallbackCount > 0 || retryCount > 0) && audit.success)
      recoveredRuns += 1
    if ((metadata.streamEventCount || 0) > 0)
      streamEnabledRuns += 1
    if (metadata.disconnectPaused || metadata.status === 'paused_disconnect')
      disconnectPausedRuns += 1
    checkpointLossCount += metadata.checkpointLossCount || 0

    for (const [toolId, count] of Object.entries(metadata.toolFailureDistribution || {})) {
      toolFailureDistribution[toolId] = (toolFailureDistribution[toolId] ?? 0) + toNumber(count, 0)
    }
  }

  const totalRuns = audits.length
  const successRuns = audits.filter(audit => audit.success).length
  const failureRuns = totalRuns - successRuns
  const recoveryCandidates = audits.filter((audit) => {
    const metadata = parseRuntimeMetadata(audit.metadata)
    return (metadata.fallbackCount || 0) > 0 || (metadata.retryCount || 0) > 0
  }).length

  return {
    summary: {
      days,
      totalRuns,
      successRuns,
      failureRuns,
      successRate: toPercent(successRuns, totalRuns),
      fallbackRate: toPercent(fallbackRuns, totalRuns),
      approvalHitRate: toPercent(approvalHits, Math.max(totalActions, 1)),
      recoveryRate: toPercent(recoveredRuns, recoveryCandidates),
      streamCoverageRate: toPercent(streamEnabledRuns, totalRuns),
      retryRunRate: toPercent(retryRuns, totalRuns),
      disconnectPauseRate: toPercent(disconnectPausedRuns, totalRuns),
      checkpointLossRate: toPercent(checkpointLossCount, Math.max(totalActions, 1)),
      totalActions,
      completedActions,
      failedActions,
      waitingApprovals,
      avgDurationMs: totalRuns > 0 ? Number((durations.reduce((sum, value) => sum + value, 0) / totalRuns).toFixed(2)) : 0,
      p95DurationMs: percentile(durations, 95),
    },
    statusDistribution,
    toolFailureDistribution: Object.entries(toolFailureDistribution)
      .sort((a, b) => b[1] - a[1])
      .map(([toolId, count]) => ({ toolId, count })),
    recentRuns,
  }
})
