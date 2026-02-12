import { requireAdmin } from '../../../utils/auth'
import { listProviders } from '../../../utils/intelligenceStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const providers = await listProviders(event, userId)
  return { providers }
})
