import { requireAdmin } from '../../../utils/auth'
import { ensureDefaultProviderSceneSeed } from '../../../utils/providerSceneSeed'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const seed = await ensureDefaultProviderSceneSeed(event)
  return { seed }
})
