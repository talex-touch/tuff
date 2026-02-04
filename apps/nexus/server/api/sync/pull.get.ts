import { getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { pullSyncItems } from '../../utils/syncStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const since = typeof query.since === 'string' ? query.since : null
  return pullSyncItems(event, userId, since)
})

