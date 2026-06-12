export type ExternalUrlDecision =
  | { allowed: true; url: string; protocol: string }
  | { allowed: false; reason: 'empty-url' | 'invalid-url' | 'blocked-protocol'; protocol?: string }

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'tuff:'])

export function validateExternalUrl(rawUrl: unknown): ExternalUrlDecision {
  if (typeof rawUrl !== 'string') return { allowed: false, reason: 'empty-url' }

  const trimmed = rawUrl.trim()
  if (!trimmed) return { allowed: false, reason: 'empty-url' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { allowed: false, reason: 'invalid-url' }
  }

  const protocol = parsed.protocol.toLowerCase()
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(protocol)) {
    return { allowed: false, reason: 'blocked-protocol', protocol }
  }

  return { allowed: true, url: parsed.toString(), protocol }
}
