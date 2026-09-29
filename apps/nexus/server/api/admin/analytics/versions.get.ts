import { requireAdmin } from '../../../utils/auth'
import { getAdminVersionAnalytics } from '../../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const daysValue = typeof query.days === 'string' ? Number(query.days) : 30
  // Mirrors `/api/admin/analytics/geo`, which the Versions & Geo panel reads in
  // the same breath — one window for both halves of that panel.
  const days = Number.isFinite(daysValue) ? Math.max(1, Math.min(90, daysValue)) : 30

  return getAdminVersionAnalytics(event, { days })
})
