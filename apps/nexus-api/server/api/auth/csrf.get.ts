import { randomBytes } from 'node:crypto'
import { defineEventHandler, setCookie, setHeader } from 'h3'
import { resolveSessionAuthSecret } from '../../utils/sessionAuthSecret'
import { isSecureSessionCookieRequest, signTransientCookiePayload } from '../../utils/sessionJwt'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')
  const csrfToken = randomBytes(32).toString('hex')
  const secret = resolveSessionAuthSecret(event)
  const signed = await signTransientCookiePayload(secret, 'csrf', { csrfToken }, 3600)

  setCookie(event, 'nexus_csrf_token', signed, {
    path: '/',
    maxAge: 3600,
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureSessionCookieRequest(event),
  })

  return { csrfToken }
})
