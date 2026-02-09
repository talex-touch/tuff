import { requireAppAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const user = await getUserById(event, userId)
  if (!user)
    return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    locale: user.locale,
    emailVerified: Boolean(user.emailVerified),
  }
})
