import { getHeader, readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { upsertBrowserPushSubscription } from '../../../../utils/browserPushSubscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)
  const subscription = await upsertBrowserPushSubscription(event, {
    userId,
    subscription: body?.subscription,
    userAgent: getHeader(event, 'user-agent'),
  })

  return {
    subscription,
    generatedAt: new Date().toISOString(),
  }
})
