import { createError } from 'h3'
import { requireAuthOrApiKey } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { getPluginById } from '../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:read'])
  const id = event.context.params?.id

  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'

  const plugin = await getPluginById(event, id, {
    includeVersions: true,
    viewerId: userId,
    viewerIsAdmin: isAdmin,
  })

  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })

  if (!isAdmin && plugin.userId !== userId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const versions = plugin.versions ?? []
  const latest = versions.find(version => version.id === plugin.latestVersionId) ?? versions[0] ?? null

  return {
    plugin: {
      ...plugin,
      latestVersion: latest,
    },
  }
})
