import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'
import { ensureQuotaUserSchema, getOrInitQuotaDummyState } from '../../utils/quota-user-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  await ensureQuotaUserSchema(event)
  const state = await getOrInitQuotaDummyState(event, auth.userId)

  return quotaOk({
    points: state.points,
    signinCount: state.signinCount,
    lastSigninDate: state.lastSigninDate,
    canUse: true,
  })
})
