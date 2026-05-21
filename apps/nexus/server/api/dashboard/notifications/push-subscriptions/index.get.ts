import { getQuery } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { listBrowserPushSubscriptions } from '../../../../utils/browserPushSubscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const subscriptions = await listBrowserPushSubscriptions(event, {
    userId,
    limit: query.limit,
  })

  return {
    subscriptions,
    generatedAt: new Date().toISOString(),
  }
})
