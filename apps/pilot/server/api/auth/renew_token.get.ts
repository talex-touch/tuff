import { getQuery } from 'h3'
import { renewPilotSessionCookie } from '../../utils/pilot-session'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const refreshToken = String(query.refresh_token || '').trim()
  const token = await renewPilotSessionCookie(event, refreshToken)
  if (!token) {
    return quotaError(401, 'refresh token is invalid or expired', null)
  }

  return quotaOk({
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresIn: token.expiresIn,
    refreshExpiresIn: token.refreshExpiresIn,
  })
})
