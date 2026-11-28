import { defineEventHandler, getQuery } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { listRecentSyncActivities, listSyncSessions } from '../../../utils/syncStoreV1'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const query = getQuery(event)
  const limit = Number.parseInt(String(query.limit ?? '30'), 10)
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 30

  const [sessions, activities] = await Promise.all([
    listSyncSessions(event, userId, safeLimit),
    listRecentSyncActivities(event, userId, safeLimit),
  ])

  return {
    sessions,
    activities,
    totalSessions: sessions.length,
    generatedAt: new Date().toISOString(),
  }
})
