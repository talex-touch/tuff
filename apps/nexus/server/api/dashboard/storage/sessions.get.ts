import { getQuery } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { listRecentSyncActivities } from '../../../utils/syncStoreV1'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const limitValue = typeof query.limit === 'string' ? Number(query.limit) : 24
  const limit = Number.isFinite(limitValue) ? limitValue : 24

  const sessions = await listRecentSyncActivities(event, userId, limit)
  return {
    sessions,
    generated_at: new Date().toISOString(),
  }
})
