import { requirePilotAuth } from '../../../utils/auth'
import { quotaOk } from '../../../utils/quota-api'
import { ensureQuotaUserSchema, getQuotaSigninCalendar } from '../../../utils/quota-user-store'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const query = getQuery(event)
  const year = Number(query.year) || new Date().getFullYear()
  const month = Number(query.month) || (new Date().getMonth() + 1)

  await ensureQuotaUserSchema(event)
  const calendar = await getQuotaSigninCalendar(event, auth.userId, year, month)

  return quotaOk(calendar)
})
