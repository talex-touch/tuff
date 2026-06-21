import { requireSessionAuth } from '../../utils/auth'
import { DEFAULT_USER_PRIVACY_SETTINGS, getUserById } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const user = await getUserById(event, userId)

  return {
    settings: user?.privacySettings ?? DEFAULT_USER_PRIVACY_SETTINGS,
  }
})
