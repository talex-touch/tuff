import { requireAdmin } from '../../../utils/auth'
import { listIntelligenceProvidersWithRegistryMirrors } from '../../../utils/intelligenceProviderRegistryBridge'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const providers = await listIntelligenceProvidersWithRegistryMirrors(event, userId)
  return { providers }
})
