import { getQuery } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { getSyncItemCatalog } from '../../../utils/syncStoreV1'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const limitValue = typeof query.limit === 'string' ? Number(query.limit) : 120
  const limit = Number.isFinite(limitValue) ? limitValue : 120

  return await getSyncItemCatalog(event, userId, limit)
})
