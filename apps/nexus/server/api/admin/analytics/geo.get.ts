import { requireAdmin } from '../../../utils/auth'
import { getAdminGeoAnalytics } from '../../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const daysValue = typeof query.days === 'string' ? Number(query.days) : 30
  const days = Number.isFinite(daysValue) ? Math.max(1, Math.min(90, daysValue)) : 30
  const limitValue = typeof query.limit === 'string' ? Number(query.limit) : 200
  const limit = Number.isFinite(limitValue) ? Math.max(10, Math.min(500, limitValue)) : 200
  const country = typeof query.country === 'string' ? query.country : null

  return getAdminGeoAnalytics(event, {
    days,
    country,
    limit,
  })
})
