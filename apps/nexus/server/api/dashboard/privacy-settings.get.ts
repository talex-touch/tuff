import { requireSessionAuth } from '../../utils/auth'
import { DEFAULT_USER_PRIVACY_SETTINGS, getUserById } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const auth = await requireSessionAuth(event)
  const { userId } = auth
  const user = auth.user ?? await getUserById(event, userId)

  return {
    settings: user?.privacySettings ?? DEFAULT_USER_PRIVACY_SETTINGS,
  }
})
