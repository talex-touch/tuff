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

function parseIpv6Hextets(rawHost: string): number[] | null {
  const host = rawHost.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
  if (!host || host.includes('%'))
    return null

  let normalized = host
  const dottedTail = /^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized)
  if (dottedTail) {
    const a = Number(dottedTail[2])
    const b = Number(dottedTail[3])
    const c = Number(dottedTail[4])
    const d = Number(dottedTail[5])
    if (a > 255 || b > 255 || c > 255 || d > 255)
      return null
    const hi = ((a << 8) | b).toString(16)
    const lo = ((c << 8) | d).toString(16)
    normalized = `${dottedTail[1]}${hi}:${lo}`
  }

  const doubleColonParts = normalized.split('::')
  if (doubleColonParts.length > 2)
    return null

  let parts: string[]
  if (doubleColonParts.length === 2) {
    const left = doubleColonParts[0] ? doubleColonParts[0].split(':') : []
    const right = doubleColonParts[1] ? doubleColonParts[1].split(':') : []
    const missing = 8 - (left.length + right.length)
    if (missing < 1)
      return null
    parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  }
  else {
    parts = normalized.split(':')
    if (parts.length !== 8)
      return null
  }

  const hextets: number[] = []
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part))
      return null
    hextets.push(Number.parseInt(part, 16))
  }
  return hextets
}

function isIpv6LoopbackHextets(h: number[]): boolean {
  return (
    h[0] === 0
    && h[1] === 0
    && h[2] === 0
    && h[3] === 0
    && h[4] === 0
    && h[5] === 0
    && h[6] === 0
    && h[7] === 1
  )
}

function isPrivateIpv6Hextets(h: number[]): boolean {
  const h0 = h[0]!
  const h1 = h[1]!
  const h2 = h[2]!
  const h3 = h[3]!
  const h4 = h[4]!
  const h5 = h[5]!

  // ::/96 — unspecified (::), loopback (::1), and all IPv4-compatible IPv6 (::a.b.c.d / ::w6:w7)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0)
    return true
  // ::ffff:0:0/96 — IPv4-mapped IPv6
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff)
    return true
  // ::ffff:0:0:0/96 — IPv4-translated IPv6 (SIIT / RFC 2765)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0xffff && h5 === 0)
    return true
  // 64:ff9b::/96 — NAT64 Well-Known Prefix (RFC 6052)
  if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0)
    return true
  // 64:ff9b:1::/48 — NAT64 Local-Use Prefix (RFC 8215)
  if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0x0001)
    return true
  // 100::/64 — Discard-Only Address Block (RFC 6666)
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0)
    return true
  // 2001:0::/32 (Teredo), 2001:2::/48 (Benchmarking), 2001:10::/28 & 2001:20::/28 (ORCHID), 2001:db8::/32 (Docs)
  if (h0 === 0x2001) {
    if (h1 === 0x0000 || h1 === 0x0db8)
      return true
    if (h1 === 0x0002 && h2 === 0)
      return true
    if ((h1 & 0xfff0) === 0x0010 || (h1 & 0xfff0) === 0x0020)
      return true
  }
  // 2002::/16 — 6to4 (embeds IPv4 in h1:h2)
  if (h0 === 0x2002)
    return true
  // fc00::/7 — Unique Local Address (ULA)
  if ((h0 & 0xfe00) === 0xfc00)
    return true
  // fe80::/10 — Link-Local Unicast
  if ((h0 & 0xffc0) === 0xfe80)
    return true
  // fec0::/10 — Deprecated Site-Local
  if ((h0 & 0xffc0) === 0xfec0)
    return true
  // ff00::/8 — Multicast
  if ((h0 & 0xff00) === 0xff00)
    return true

  return false
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase()
  if (LOOPBACK_HOSTS.has(normalized) || normalized.endsWith('.localhost'))
    return true
  if (normalized.includes(':')) {
    const hextets = parseIpv6Hextets(normalized)
    return Boolean(hextets && isIpv6LoopbackHextets(hextets))
  }
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
    const hextets = parseIpv6Hextets(host)
    // Fail closed on malformed IPv6 literals or any non-global / special-purpose prefix.
    if (!hextets)
      return true
    return isPrivateIpv6Hextets(hextets)
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
