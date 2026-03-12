import { requirePilotAuth } from '../../utils/auth'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  requirePilotAuth(event)

  return quotaOk([])
})
