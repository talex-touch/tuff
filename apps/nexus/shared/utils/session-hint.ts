/**
 * A non-httpOnly marker that says "this browser may hold a Nexus session".
 *
 * The real session token is httpOnly, so the client cannot see it; without a hint every public
 * page had to ask `/api/auth/session` on mount to learn what the header should show. For the
 * anonymous majority that was a Worker round trip that returned `{}` — measured at 1–3 s from
 * CN. The hint is written and cleared alongside the session-token cookie, so a public page can
 * skip the request when the hint is absent and still ask when it is present.
 *
 * It carries no data and grants nothing: a forged or stale hint only causes the session request
 * the page would have made anyway, and the answer to that request is what the UI trusts.
 */
export const SESSION_HINT_COOKIE = 'nexus_session_hint'
export const SESSION_HINT_VALUE = '1'
export const SESSION_HINT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** Cookie names Auth.js uses for the session token, in both the plain and `__Secure-` forms. */
export const SESSION_TOKEN_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'authjs.session-token',
  '__Secure-authjs.session-token',
] as const

/** Reads the hint from a `Cookie` request header or `document.cookie` string. */
export function hasSessionHintInCookieString(cookieString: string | null | undefined) {
  if (!cookieString)
    return false

  for (const part of cookieString.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1)
      continue
    if (part.slice(0, separator).trim() !== SESSION_HINT_COOKIE)
      continue
    return part.slice(separator + 1).trim() === SESSION_HINT_VALUE
  }

  return false
}

export type SessionHintChange = 'set' | 'clear' | null

/**
 * Works out from a response's `Set-Cookie` headers whether the session token was just issued or
 * just cleared, which is exactly when the hint has to follow it.
 *
 * Only the session-token cookies count; CSRF, callback-url and PKCE cookies come and go on
 * every auth request and say nothing about whether a session exists.
 */
export function resolveSessionHintChange(setCookieHeaders: readonly string[]): SessionHintChange {
  let change: SessionHintChange = null

  for (const header of setCookieHeaders) {
    const [pair = '', ...attributes] = header.split(';')
    const separator = pair.indexOf('=')
    if (separator === -1)
      continue

    const name = pair.slice(0, separator).trim()
    if (!(SESSION_TOKEN_COOKIE_NAMES as readonly string[]).includes(name))
      continue

    const value = pair.slice(separator + 1).trim()
    const expiresNow = attributes.some((attribute) => {
      const [key = '', raw = ''] = attribute.split('=')
      const normalizedKey = key.trim().toLowerCase()
      if (normalizedKey === 'max-age')
        return Number(raw.trim()) <= 0
      if (normalizedKey === 'expires') {
        const time = Date.parse(raw.trim())
        return !Number.isNaN(time) && time <= Date.now()
      }
      return false
    })

    if (!value || expiresNow) {
      // A clear wins only if nothing in the same response sets a token.
      change ??= 'clear'
      continue
    }

    return 'set'
  }

  return change
}
