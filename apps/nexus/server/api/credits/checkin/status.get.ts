import { requireVerifiedEmail } from '../../../utils/auth'
import { getCheckinStatus } from '../../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  return getCheckinStatus(event, userId)
})
