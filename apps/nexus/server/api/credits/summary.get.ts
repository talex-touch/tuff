import { requireAuth } from '../../utils/auth'
import { getCreditSummary } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  return getCreditSummary(event, userId)
})

