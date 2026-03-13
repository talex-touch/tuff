import { requirePilotAuth } from '../../utils/auth'
import { resolvePilotAdmin } from '../../utils/pilot-admin-auth'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  if (!auth.isAuthenticated) {
    return quotaOk([])
  }

  const admin = await resolvePilotAdmin(event)
  if (admin.isAdmin) {
    return quotaOk<string[]>(['pilot:admin'])
  }

  return quotaOk<string[]>([])
})
