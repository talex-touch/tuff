import { createError } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getPluginById, listPluginTimeline } from '../../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'

  const plugin = await getPluginById(event, id)
  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  const isOwner = plugin.userId === userId
  if (!isAdmin && !isOwner)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const timeline = await listPluginTimeline(event, id)

  return {
    timeline,
  }
})
