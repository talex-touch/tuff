import { createError, defineEventHandler, getHeader, readBody } from 'h3'
import { requireAuth } from '../../utils/auth'
import { upsertBrowserPushSubscription } from '../../utils/browserPushSubscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody<{ subscription?: unknown } & Record<string, unknown>>(event)

  const subscriptionPayload = body && typeof body === 'object' && 'subscription' in body
    ? body.subscription
    : body

  if (!subscriptionPayload || typeof subscriptionPayload !== 'object')
    throw createError({ statusCode: 400, statusMessage: 'subscription is required.' })

  const subscription = await upsertBrowserPushSubscription(event, {
    userId,
    subscription: subscriptionPayload,
    userAgent: getHeader(event, 'user-agent'),
  })

  return {
    ok: true,
    subscription,
  }
})
