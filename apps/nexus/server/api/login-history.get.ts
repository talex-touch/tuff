import { requireAuth } from '../utils/auth'
import { listLoginHistory } from '../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const records = await listLoginHistory(event, userId, 90)
  return records
})

