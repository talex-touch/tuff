import { defineEventHandler, readBody } from 'h3'
import { normalizeSafeCallbackUrl, resolveAuthBaseUrl } from '../../utils/authOAuth'
import { clearBrowserSessionCookies } from '../../utils/sessionJwt'

export default defineEventHandler(async (event) => {
  clearBrowserSessionCookies(event)
  const baseUrl = resolveAuthBaseUrl(event)
  const body = await readBody<{ callbackUrl?: string }>(event).catch(() => null)
  const url = normalizeSafeCallbackUrl(body?.callbackUrl, baseUrl, '/sign-in')
  return { ok: true, url }
})
