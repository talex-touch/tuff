import { requireSessionAuth } from '../../utils/auth'
import { getUserById } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const auth = await requireSessionAuth(event)
  const { userId } = auth
  const user = auth.user ?? await getUserById(event, userId)

  return {
    settings: {
      allowCliIpMismatch: user?.allowCliIpMismatch ?? false,
    },
  }
})
