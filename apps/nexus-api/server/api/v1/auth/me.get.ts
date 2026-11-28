import { requireAppAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { normalizeLocaleCode } from '../../../utils/locale'

export default defineEventHandler(async (event) => {
  const auth = await requireAppAuth(event)
  const { userId } = auth
  const user = auth.user ?? await getUserById(event, userId)
  if (!user)
    return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role,
    locale: normalizeLocaleCode(user.locale),
    emailVerified: Boolean(user.emailVerified),
  }
})
