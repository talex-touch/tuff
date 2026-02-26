import { requireAdmin } from '../../../utils/auth'
import { listIntelligenceLabProviders } from '../../../utils/tuffIntelligenceLabService'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  return await listIntelligenceLabProviders(event, userId)
})
