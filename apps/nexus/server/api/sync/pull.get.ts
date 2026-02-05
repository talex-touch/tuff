import { getQuery } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'
import { pullSyncItems } from '../../utils/syncStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const query = getQuery(event)
  const since = typeof query.since === 'string' ? query.since : null
  return pullSyncItems(event, userId, since)
})
