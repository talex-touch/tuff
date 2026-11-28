import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../utils/auth'
import { getAdminUsageAnalytics } from '../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const rawDays = Number.parseInt(String(query.days ?? '30'), 10)
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 365) : 30
  return await getAdminUsageAnalytics(event, { days })
})
