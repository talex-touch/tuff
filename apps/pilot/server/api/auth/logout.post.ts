import { clearPilotSessionCookie } from '../../utils/pilot-session'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler((event) => {
  return clearPilotSessionCookie(event).then(() => quotaOk({
    ok: true,
  }))
})
