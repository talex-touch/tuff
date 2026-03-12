import { clearPilotSessionCookie } from '../../utils/pilot-session'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  clearPilotSessionCookie(event)
  return quotaOk({
    ok: true,
  })
})
