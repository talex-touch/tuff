import { requireAuth } from '../../utils/auth'
import { listDevices } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  return listDevices(event, userId)
})

