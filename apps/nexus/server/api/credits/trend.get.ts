import { getQuery } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'
import { listCreditTrendByUsers } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const query = getQuery(event)
  const daysRaw = typeof query.days === 'string' ? Number(query.days) : undefined
  const days = Number.isFinite(daysRaw) ? Number(daysRaw) : undefined

  const result = await listCreditTrendByUsers(event, [userId], { days })

  return {
    days: result.days,
    values: result.values,
    totalUsed: result.totalUsed,
  }
})
