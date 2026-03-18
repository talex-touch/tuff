import { requirePilotAuth } from '../../utils/auth'
import { quotaError } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  requirePilotAuth(event)
  return quotaError(410, 'fortune feature removed', null)
})
