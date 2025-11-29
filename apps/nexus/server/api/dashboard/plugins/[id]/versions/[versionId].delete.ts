import { clerkClient } from '@clerk/nuxt/server'
import { createError } from 'h3'
import { requireAuth } from '../../../../../utils/auth'
import { deletePluginVersion, getPluginById } from '../../../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const id = event.context.params?.id
  const versionId = event.context.params?.versionId

  if (!id || !versionId)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id and version id are required.' })

  const client = clerkClient(event)
  const user = await client.users.getUser(userId)
  const isAdmin = user.publicMetadata?.role === 'admin'

  const plugin = await getPluginById(event, id)

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  if (!isAdmin && plugin.userId !== userId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  await deletePluginVersion(event, id, versionId, { bypassOwnerCheck: isAdmin })

  return {
    ok: true,
  }
})
