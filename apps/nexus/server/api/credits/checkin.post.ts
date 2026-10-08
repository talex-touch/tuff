import { requireVerifiedEmail } from '../../utils/auth'
import { claimDailyCheckin, getCreditSummary } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const result = await claimDailyCheckin(event, userId)
  const summary = await getCreditSummary(event, userId)
  return {
    ...result,
    // Claimed now or earlier today, the day is checked in: reading it back was a round trip.
    status: {
      day: result.day,
      checkedInToday: true,
      reward: result.reward,
    },
    summary,
  }
})
