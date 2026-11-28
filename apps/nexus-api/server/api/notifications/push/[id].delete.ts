import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireAuth } from '../../../utils/auth'
import { deleteBrowserPushSubscription } from '../../../utils/browserPushSubscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = getRouterParam(event, 'id')?.trim()
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Subscription id is required.' })

  const deleted = await deleteBrowserPushSubscription(event, { userId, id })
  if (!deleted)
    throw createError({ statusCode: 404, statusMessage: 'Push subscription not found.' })

  return {
    ok: true,
    deleted: true,
    id,
  }
})
