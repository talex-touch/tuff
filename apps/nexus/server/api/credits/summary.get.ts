import { requireVerifiedEmail } from '../../utils/auth'
import { getCreditSummary } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  return getCreditSummary(event, userId)
})
