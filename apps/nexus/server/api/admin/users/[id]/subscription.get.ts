import { createError } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getUserSubscription } from '../../../../utils/subscriptionStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'User id is required.' })

  const targetUser = await getUserById(event, id)
  if (!targetUser)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  return {
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      status: targetUser.status,
    },
    subscription: await getUserSubscription(event, id),
  }
})
