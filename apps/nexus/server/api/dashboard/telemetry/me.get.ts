import { requireAuth } from '../../../utils/auth'
import { getUserTelemetryOverview } from '../../../utils/telemetryStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const query = getQuery(event)
  const days = Math.max(1, Math.min(90, Number(query.days) || 30))

  const data = await getUserTelemetryOverview(event, userId, { days })

  return data
})
