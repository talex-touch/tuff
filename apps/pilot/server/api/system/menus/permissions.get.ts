import { resolvePilotAdmin } from '../../../utils/pilot-admin-auth'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const admin = await resolvePilotAdmin(event)
  if (admin.isAdmin) {
    return quotaOk(['pilot:admin', 'system:user:create', 'system:user:update', 'system:user:delete'])
  }
  return quotaOk([])
})
