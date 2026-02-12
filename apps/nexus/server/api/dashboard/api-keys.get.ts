import { listApiKeys } from '../../utils/apiKeyStore'
import { requireAdmin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)

  const keys = await listApiKeys(event, userId)

  return { keys }
})
