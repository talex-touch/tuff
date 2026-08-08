export type WebhookUrlRejection =
  | 'empty'
  | 'unparseable'
  | 'unsupported-scheme'
  | 'insecure-scheme'
  | 'private-host'

export type WebhookUrlDecision =
  | { allowed: true, url: string }
  | { allowed: false, reason: WebhookUrlRejection }

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * Hosts a server-side webhook must never be pointed at.
 *
 * 169.254.169.254 is the cloud instance-metadata address and the reason this matters most,
 * but the whole private and link-local space is refused: a webhook is an outbound call the
 * server makes on a stored address, so it is a ready-made probe of the network it runs in.
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()

  if (host === '0.0.0.0' || host === '::' || host.endsWith('.internal') || host.endsWith('.local'))
    return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    // Indexed directly rather than destructured: noUncheckedIndexedAccess types a slice's
    // elements as possibly undefined, and the regex has already guaranteed both groups.
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    if (a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }

  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host))
    return true

  return false
}

/**
 * Whether a stored webhook URL may be dispatched to.
 *
 * The credential store accepted any non-empty string under 2048 characters — no parse, no
 * scheme check, no host rule — and the dispatcher passed it straight to the HTTP client. An
 * admin session could point it at http://169.254.169.254/latest/meta-data/ and every
 * notification became a request to that address; `validateStatus` accepts 100-599, so the
 * delivery record reported the status and worked as a probe oracle. Plain http also sent the
 * body and the X-Tuff-Signature HMAC in cleartext (#899).
 *
 * The scheme rule is the one `readHttpsRelayEndpoint` already applies in the dispatcher —
 * https, or http for loopback so local development still works — with the private-host
 * refusal added.
 *
 * Known limit: this checks the literal host. A DNS name that resolves to a private address
 * still passes, because the check happens before resolution. Closing that needs resolution
 * -time filtering in the HTTP client, which is a different change.
 */
export function evaluateWebhookUrl(value: unknown): WebhookUrlDecision {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) {
    return { allowed: false, reason: 'empty' }
  }

  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return { allowed: false, reason: 'unparseable' }
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { allowed: false, reason: 'unsupported-scheme' }
  }

  const loopback = LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  if (url.protocol === 'http:' && !loopback) {
    return { allowed: false, reason: 'insecure-scheme' }
  }

  // Loopback over http is the documented development case, so it is not a private-host
  // rejection; anything else in private or link-local space is.
  if (!loopback && isPrivateHost(url.hostname)) {
    return { allowed: false, reason: 'private-host' }
  }

  return { allowed: true, url: url.toString() }
}
