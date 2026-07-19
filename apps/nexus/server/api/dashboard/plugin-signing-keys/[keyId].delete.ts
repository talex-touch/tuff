import { createError, getRouterParam } from 'h3'
import { requireAuthOrApiKey } from '../../../utils/auth'
import { revokePublisherSigningKey } from '../../../utils/pluginSigning'
import { invalidatePluginVersionsForPublisherKey } from '../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:publish'])
  const keyId = getRouterParam(event, 'keyId')
  if (!keyId)
    throw createError({ statusCode: 400, statusMessage: 'keyId is required.' })
  const key = await revokePublisherSigningKey(event, userId, keyId)
  const invalidatedVersions = await invalidatePluginVersionsForPublisherKey(event, keyId, userId)
  return { key, invalidatedVersions }
})
