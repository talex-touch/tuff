import { requireAdmin } from '../../utils/auth'
import { getAnalyticsSummary, getRealTimeStats } from '../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  // Unclamped, a caller-supplied `days` reaches Date arithmetic that overflows
  // the representable range and answers 500 "Invalid time value"; the sibling
  // analytics endpoints already clamp to the same 1..365 window.
  const days = Math.min(Math.max(Number(query.days) || 30, 1), 365)

  const [summary, realtime] = await Promise.all([
    getAnalyticsSummary(event, { days }),
    getRealTimeStats(event),
  ])

  return {
    summary,
    realtime,
  }
})
