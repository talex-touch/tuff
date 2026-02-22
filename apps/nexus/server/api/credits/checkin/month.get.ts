import { getQuery } from 'h3'
import { requireVerifiedEmail } from '../../../utils/auth'
import { listCheckinsByMonth } from '../../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const query = getQuery(event)
  const month = typeof query.month === 'string' ? query.month.trim() : undefined
  return listCheckinsByMonth(event, userId, month)
})
