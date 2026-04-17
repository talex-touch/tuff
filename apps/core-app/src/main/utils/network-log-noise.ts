const DOWNGRADED_REMOTE_FAILURE_MARKERS = [
  'err_connection_refused',
  'econnrefused',
  'localhost:3200',
  'eai_again',
  'enotfound',
  'etimedout',
  'network guard cooldown',
  'network_http_status_403',
  'network_http_status_429',
  'rate limit',
  'ratelimit',
  'just a moment',
  'cloudflare',
  'challenge-platform',
  'cf_chl',
  'enable javascript and cookies to continue'
]

const CLOUDFLARE_HTML_MARKERS = [
  'just a moment',
  'challenge-platform',
  'cf_chl',
  'enable javascript and cookies to continue',
  'cloudflare'
]

function toFailureText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    return value.message
  }
  return ''
}

export function shouldDowngradeRemoteFailure(...parts: unknown[]): boolean {
  const combined = parts
    .map((part) => toFailureText(part))
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!combined) {
    return false
  }

  return DOWNGRADED_REMOTE_FAILURE_MARKERS.some((marker) => combined.includes(marker))
}

export function summarizeRemoteFailurePayload(
  payload: unknown,
  options?: { maxLength?: number }
): string | undefined {
  if (typeof payload !== 'string') {
    return undefined
  }

  const compact = payload.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return undefined
  }

  const lower = compact.toLowerCase()
  if (CLOUDFLARE_HTML_MARKERS.some((marker) => lower.includes(marker))) {
    return 'cloudflare_challenge'
  }

  if (/<html[\s>]/i.test(compact)) {
    return 'html_response'
  }

  const maxLength = options?.maxLength ?? 180
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact
}
