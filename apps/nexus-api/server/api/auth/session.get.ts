import { defineEventHandler, setHeader } from 'h3'
import { resolveBrowserSessionToken } from '../../utils/auth'
import { getUserById } from '../../utils/authStore'
import { clearBrowserSessionCookies, readSessionTokenFromCookies } from '../../utils/sessionJwt'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'private, no-store, max-age=0')

  const rawCookie = readSessionTokenFromCookies(event)
  const token = await resolveBrowserSessionToken(event)
  if (!token) {
    if (rawCookie)
      clearBrowserSessionCookies(event)
    return {}
  }

  const userId = (typeof token.userId === 'string' && token.userId.trim())
    || (typeof token.sub === 'string' && token.sub.trim())
    || ''
  if (!userId)
    return {}

  const user = await getUserById(event, userId)
  if (!user || user.status !== 'active') {
    clearBrowserSessionCookies(event)
    return {}
  }

  const expires = typeof token.exp === 'number'
    ? new Date(token.exp * 1000).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
    },
    expires,
    issuedAt: typeof token.iat === 'number' ? token.iat : null,
  }
})
