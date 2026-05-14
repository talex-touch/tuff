import { listApiKeys } from '../../utils/apiKeyStore'
import { requireAuth } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const keys = await listApiKeys(event, userId)

  return { keys }
})
