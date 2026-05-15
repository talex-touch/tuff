export function normalizeAuthOrigin(value: unknown): string {
  if (typeof value !== 'string')
    return ''

  const trimmed = value.trim()
  if (!trimmed)
    return ''

  try {
    return new URL(trimmed).origin
  }
  catch {
    return ''
  }
}

export function isLocalAuthOrigin(value: string): boolean {
  const origin = normalizeAuthOrigin(value)
  if (!origin)
    return false

  const hostname = new URL(origin).hostname.toLowerCase()
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname.endsWith('.localhost')
}

export function shouldTrustForwardedAuthHost(configuredOrigin: string): boolean {
  return !configuredOrigin || (process.env.NODE_ENV === 'production' && isLocalAuthOrigin(configuredOrigin))
}
