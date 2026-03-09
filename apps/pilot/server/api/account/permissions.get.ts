import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  const auth = requirePilotAuth(event)
  if (!auth.isAuthenticated) {
    return quotaOk([])
  }

  return quotaOk<string[]>([])
})
