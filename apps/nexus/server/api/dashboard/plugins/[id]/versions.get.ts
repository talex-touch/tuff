import { createError } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getPluginById, listPluginVersions } from '../../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'
  const viewerOrgIds: string[] = []

  const plugin = await getPluginById(event, id)

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  if (!isAdmin && plugin.userId !== userId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const versions = await listPluginVersions(event, id, {
    viewerId: userId,
    viewerOrgIds,
    viewerIsAdmin: isAdmin,
  })

  return {
    versions,
  }
})
