import { requireAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { hasInviteForEmail } from '../../../utils/teamStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const user = await getUserById(event, userId)

  if (!user) {
    return { allowed: false, reason: 'missing_user' }
  }

  if (user.role === 'admin') {
    return { allowed: true, reason: 'admin' }
  }

  const email = user.email?.trim()
  if (!email) {
    return { allowed: false, reason: 'missing_email' }
  }

  const invited = await hasInviteForEmail(event, email)

  return {
    allowed: invited,
    reason: invited ? 'invited' : 'not_invited',
  }
})
