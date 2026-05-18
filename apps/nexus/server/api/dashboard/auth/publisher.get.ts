import { requireAuthOrApiKey } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const auth = await requireAuthOrApiKey(event, ['plugin:publish'])
  const user = await getUserById(event, auth.userId)

  return {
    ok: true,
    userId: auth.userId,
    authType: auth.authType,
    role: user?.role ?? null,
  }
})
