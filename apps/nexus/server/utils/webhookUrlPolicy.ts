export type WebhookUrlRejection =
  | 'empty'
  | 'unparseable'
  | 'unsupported-scheme'
  | 'insecure-scheme'
  | 'private-host'

export type WebhookUrlDecision =
  | { allowed: true, url: string }
  | { allowed: false, reason: WebhookUrlRejection }

export interface EvaluateWebhookUrlOptions {
  /**
   * Whether loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) are permitted.
   * Defaults to `false` in production and Cloudflare Pages runtimes; local dev/tests may allow it.
   */
  allowLocalhost?: boolean
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
  if (LOOPBACK_HOSTS.has(normalized) || normalized.endsWith('.localhost'))
    return true
  if (normalized === '0:0:0:0:0:0:0:1')
    return true
  return false
}

function isPrivateIpv4Tuple(a: number, b: number, c: number, d: number): boolean {
  if (a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 255 || d < 0 || d > 255)
    return true
  if (a === 0 || a === 10 || a === 127)
    return true
  // Carrier-grade NAT (RFC 6598): 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127)
    return true
  // Link-local / cloud metadata: 169.254.0.0/16
  if (a === 169 && b === 254)
    return true
  // Private RFC 1918: 172.16.0.0/12 and 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31)
    return true
  if (a === 192 && b === 168)
    return true
  // IETF protocol / benchmarking / multicast / reserved
  if (a === 192 && b === 0 && c === 0)
    return true
  if (a === 198 && (b === 18 || b === 19))
    return true
  if (a >= 224)
    return true
  return false
}

/**
 * Hosts a server-side outbound URL must never be pointed at.
 *
 * Covers RFC 1918, loopback, CGNAT (100.64.0.0/10), unspecified (0.0.0.0/8), link-local/metadata
 * (169.254.0.0/16), IPv4-mapped IPv6 (`::ffff:*` in both dotted and URL-normalized hex forms),
 * IPv6 unique-local/link-local/multicast/loopback, and `.internal` / `.local` suffixes.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
  if (!host)
    return true

  if (
    host === '0.0.0.0'
    || host === '::'
    || host === '::1'
    || host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.internal')
    || host.endsWith('.local')
  ) {
    return true
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    return isPrivateIpv4Tuple(Number(ipv4[1]), Number(ipv4[2]), Number(ipv4[3]), Number(ipv4[4]))
  }

  if (host.includes(':')) {
    // Reject all IPv4-mapped IPv6 addresses (`::ffff:*` and `0:0:0:0:0:ffff:*`) unconditionally
    // so neither dotted (`[::ffff:169.254.169.254]`) nor normalized hex (`[::ffff:a9fe:a9fe]`) can bypass checks.
    if (/(?:^|:)ffff:/i.test(host))
      return true
    // IPv4-compatible IPv6 (`::a.b.c.d`) or NAT64 (`64:ff9b::...`)
    if (/^::\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || /^64:ff9b:/i.test(host))
      return true
    // Unspecified / loopback in expanded form (`0:0:0:0:0:0:0:0`, `0:0:0:0:0:0:0:1`)
    if (/^(?:0+:){6,7}0*[01]$/.test(host))
      return true
    // IPv6 unique-local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
    if (/^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host) || /^ff[0-9a-f]{2}:/.test(host))
      return true
  }

  return false
}

function isLocalDevDefault(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NITRO_PRESET !== 'cloudflare-pages'
}

export function evaluateWebhookUrl(
  value: unknown,
  options?: EvaluateWebhookUrlOptions,
): WebhookUrlDecision {
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

  if (url.username || url.password) {
    return { allowed: false, reason: 'unparseable' }
  }

  const allowLocalhost = options?.allowLocalhost ?? isLocalDevDefault()
  const loopback = isLoopbackHost(url.hostname)

  if (loopback && !allowLocalhost) {
    return { allowed: false, reason: 'private-host' }
  }

  if (url.protocol === 'http:' && !loopback) {
    return { allowed: false, reason: 'insecure-scheme' }
  }

  if (!loopback && isPrivateHost(url.hostname)) {
    return { allowed: false, reason: 'private-host' }
  }

  return { allowed: true, url: url.toString() }
}
