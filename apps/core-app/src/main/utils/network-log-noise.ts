import { TRANSPORT_FAILURE_MARKERS } from '@talex-touch/utils/network'

/**
 * Failures that are expected enough to log below error severity.
 *
 * Transport failures come from the shared classifier rather than a second hand-maintained copy:
 * this list had drifted from it and was missing `err_connection_closed`, the code the official
 * update host actually produces. The entries below are the ones that are noise for logging but not
 * transport failures — challenge pages, rate limits, cooldowns, dev-server misses — so they stay
 * local.
 */
const DOWNGRADED_REMOTE_FAILURE_MARKERS = [
  ...TRANSPORT_FAILURE_MARKERS,
  'localhost:3200',
  'network timeout',
  'network_timeout',
  'request timeout',
  'timed out',
  // Not spelled with a space, so 'timed out' above does not cover it. It is deliberately absent
  // from TRANSPORT_FAILURE_MARKERS so that isTimeoutLikeError owns it alone; noise suppression has
  // no such ownership rule and wants both.
  'etimedout',
  'aborterror',
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
