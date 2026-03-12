import { requirePilotAuth } from '../../../utils/auth'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler((event) => {
  requirePilotAuth(event)

  return quotaOk({
    total: 0,
    thisWeek: 0,
    favorites: 0,
    updatedAt: new Date().toISOString(),
  })
})
