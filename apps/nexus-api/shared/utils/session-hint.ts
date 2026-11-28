export const SESSION_HINT_COOKIE = 'nexus_session_hint'
export const SESSION_HINT_VALUE = '1'
export const SESSION_HINT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export const SESSION_TOKEN_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'authjs.session-token',
  '__Secure-authjs.session-token',
] as const

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
      change ??= 'clear'
      continue
    }

    return 'set'
  }

  return change
}
