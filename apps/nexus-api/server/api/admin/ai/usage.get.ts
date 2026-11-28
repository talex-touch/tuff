import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { getAiGatewayUsageAggregated } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const query = getQuery(event)
  const daysRaw = Number(query.days)
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 365) : 30
  const userId = typeof query.userId === 'string' && query.userId.trim() ? query.userId.trim() : null
  const providerId = typeof query.providerId === 'string' && query.providerId.trim() ? query.providerId.trim() : null

  return await getAiGatewayUsageAggregated(event, { days, userId, providerId })
})
