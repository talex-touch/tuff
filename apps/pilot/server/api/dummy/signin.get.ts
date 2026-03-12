import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'
import { ensureQuotaUserSchema, quotaDailySignin } from '../../utils/quota-user-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  await ensureQuotaUserSchema(event)
  const result = await quotaDailySignin(event, auth.userId)

  return quotaOk({
    amount: result.amount,
    points: result.points,
    signedToday: result.signedToday,
  })
})
