import { deleteApiKey } from '../../../utils/apiKeyStore'
import { requireAuth } from '../../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const keyId = getRouterParam(event, 'id')
  if (!keyId) {
    throw createError({ statusCode: 400, statusMessage: 'Key ID required' })
  }

  const deleted = await deleteApiKey(event, userId, keyId)

  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'API key not found' })
  }

  return { success: true }
})
