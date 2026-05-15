import { requireSessionAuth } from '../../utils/auth'
import { getUserById } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const user = await getUserById(event, userId)

  return {
    settings: {
      allowCliIpMismatch: user?.allowCliIpMismatch ?? false,
    },
  }
})
