import { requireAdmin } from '../../utils/auth'
import { getAnalyticsSummary, getRealTimeStats } from '../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const days = Number(query.days) || 30

  const [summary, realtime] = await Promise.all([
    getAnalyticsSummary(event, { days }),
    getRealTimeStats(event),
  ])

  return {
    summary,
    realtime,
  }
})
