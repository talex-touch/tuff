import { requireVerifiedEmail } from '../../utils/auth'
import { claimDailyCheckin, getCheckinStatus, getCreditSummary } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const result = await claimDailyCheckin(event, userId)
  const status = await getCheckinStatus(event, userId)
  const summary = await getCreditSummary(event, userId)
  return {
    ...result,
    status,
    summary,
  }
})
