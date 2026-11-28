const AUTH_LOOP_PREFIXES = ['/sign-in', '/login', '/verify']

/**
 * Validates a post-auth redirect target so it is strictly a safe same-origin
 * relative path and never creates an open redirect or auth loop.
 */
export function resolveSafeRedirectUrl(raw: unknown, fallback = '/dashboard'): string {
  if (typeof raw !== 'string')
    return fallback
  const trimmed = raw.trim()
  if (!trimmed)
    return fallback

  // Allow relative paths starting with a single '/' (reject protocol-relative '//evil.com' or '/\evil.com')
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\'))
    return fallback

  if (AUTH_LOOP_PREFIXES.some(prefix => trimmed === prefix || trimmed.startsWith(`${prefix}?`) || trimmed.startsWith(`${prefix}/`)))
    return fallback

  return trimmed
}
