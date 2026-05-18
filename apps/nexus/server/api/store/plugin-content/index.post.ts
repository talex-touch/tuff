import type { PluginContentPublishInput } from '@talex-touch/utils/types/cloud-share'
import { createError, readBody } from 'h3'
import { requireAuthOrApiKey } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { createPluginContentPackage } from '../../../utils/pluginContentStore'
import { getPluginById, getPluginBySlug } from '../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:publish'])
  const body = await readBody<PluginContentPublishInput>(event)
  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'
  const plugin = await getPluginBySlug(event, body?.pluginId, { viewerId: userId, viewerIsAdmin: isAdmin })
    ?? await getPluginById(event, body?.pluginId, { viewerId: userId, viewerIsAdmin: isAdmin })

  if (!plugin) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Plugin not found.',
      data: { errorCode: 'PLUGIN_CONTENT_NOT_FOUND' },
    })
  }

  if (!isAdmin && plugin.userId !== userId) {
    throw createError({
      statusCode: 403,
      statusMessage: 'You cannot publish content for this plugin.',
      data: { errorCode: 'PLUGIN_CONTENT_FORBIDDEN' },
    })
  }

  const item = await createPluginContentPackage(event, {
    ...body,
    pluginId: plugin.slug,
  }, userId)

  return {
    package: item,
  }
})
