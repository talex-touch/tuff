import { createError } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { deleteBrowserPushSubscription } from '../../../../utils/browserPushSubscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Subscription id is required.' })

  const deleted = await deleteBrowserPushSubscription(event, {
    userId,
    id,
  })

  return {
    deleted,
    generatedAt: new Date().toISOString(),
  }
})
