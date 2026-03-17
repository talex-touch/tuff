import { requirePilotAdmin } from '../../utils/pilot-admin-auth'
import { listPilotRoutingMetrics } from '../../utils/pilot-routing-metrics'

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeNumber(value: unknown, fallback: number, min = 1, max = 2000): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  const query = getQuery(event)

  const limit = normalizeNumber(query.limit, 200, 1, 2000)
  const channelId = normalizeText(query.channelId)
  const providerModel = normalizeText(query.providerModel)
  const routeComboId = normalizeText(query.routeComboId)
  const fromTs = normalizeText(query.fromTs)

  const rows = await listPilotRoutingMetrics(event, {
    limit,
    channelId,
    providerModel,
    routeComboId,
    fromTs,
  })

  const total = rows.length
  const success = rows.filter(item => item.success).length
  const avgTtftMs = total > 0
    ? Number((rows.reduce((sum, item) => sum + Number(item.ttftMs || 0), 0) / total).toFixed(2))
    : 0
  const avgTotalDurationMs = total > 0
    ? Number((rows.reduce((sum, item) => sum + Number(item.totalDurationMs || 0), 0) / total).toFixed(2))
    : 0

  return {
    metrics: rows,
    summary: {
      total,
      success,
      failed: Math.max(total - success, 0),
      successRate: total > 0 ? Number((success / total).toFixed(4)) : 0,
      avgTtftMs,
      avgTotalDurationMs,
    },
  }
})
