import { requireAdmin } from '../../../../utils/auth'
import { listIntelligenceLabSessionHistory } from '../../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const query = getQuery(event)
  const limitRaw = Number(query.limit)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20
  const sessions = await listIntelligenceLabSessionHistory(event, userId, limit)
  return {
    sessions,
  }
})

