export type NetworkTargetClass = 'local' | 'internet' | 'non-http'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', '::'])

function parseIpv4Octets(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!match) return null
  const octets = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])] as [
    number,
    number,
    number,
    number
  ]
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null
  }
  return octets
}

function isLocalIpv4Octets(a: number, b: number, c: number, _d: number): boolean {
  // 0.0.0.0/8 ("this host"), 10.0.0.0/8, 127.0.0.0/8
  if (a === 0 || a === 10 || a === 127) return true
  // 100.64.0.0/10 (CGNAT RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 169.254.0.0/16 (link-local & cloud instance metadata)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 (RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.0.0.0/24 (IETF protocol assignments) and 192.168.0.0/16 (RFC 1918)
  if (a === 192 && b === 0 && c === 0) return true
  if (a === 192 && b === 168) return true
  // 224.0.0.0/4+ (multicast / reserved / broadcast)
  if (a >= 224) return true
  return false
}

function parseIpv6Groups(rawHost: string): number[] | null {
  const zoneIndex = rawHost.indexOf('%')
  const host = zoneIndex >= 0 ? rawHost.slice(0, zoneIndex) : rawHost
  if (!host.includes(':')) return null

  // Handle optional embedded dotted IPv4 tail (e.g. ::ffff:127.0.0.1)
  let normalized = host
  const lastColon = host.lastIndexOf(':')
  const tail = host.slice(lastColon + 1)
  if (tail.includes('.')) {
    const octets = parseIpv4Octets(tail)
    if (!octets) return null
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    normalized = `${host.slice(0, lastColon + 1)}${high}:${low}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null

  const parseSide = (side: string): number[] | null => {
    if (!side) return []
    const parts = side.split(':')
    const values: number[] = []
    for (const part of parts) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null
      values.push(Number.parseInt(part, 16))
    }
    return values
  }

  const left = parseSide(halves[0] ?? '')
  if (!left) return null

  if (halves.length === 1) {
    return left.length === 8 ? left : null
  }

  const right = parseSide(halves[1] ?? '')
  if (!right) return null
  const missing = 8 - (left.length + right.length)
  if (missing < 1) return null

  return [...left, ...new Array<number>(missing).fill(0), ...right]
}

function isLocalIpv6Groups(groups: number[]): boolean {
  // Unspecified (::) and loopback (::1)
  const firstSixZero =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  if (firstSixZero && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) {
    return true
  }

  // IPv4-mapped (::ffff:0:0/96) — covers WHATWG-normalized [::ffff:7f00:1] and dotted forms
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    return isLocalIpv4Octets(
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff
    )
  }

  // IPv4-translated (::ffff:0:0:0/96)
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0xffff &&
    groups[5] === 0
  ) {
    return isLocalIpv4Octets(
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff
    )
  }

  // Deprecated IPv4-compatible (::/96)
  if (firstSixZero && (groups[6] !== 0 || groups[7] > 1)) {
    return isLocalIpv4Octets(
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff
    )
  }

  // NAT64 well-known prefix (64:ff9b::/96)
  if (
    groups[0] === 0x0064 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  ) {
    return isLocalIpv4Octets(
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff
    )
  }

  // 6to4 (2002::/16) embedding an IPv4 address in groups[1..2]
  if (groups[0] === 0x2002) {
    return isLocalIpv4Octets(
      (groups[1] >> 8) & 0xff,
      groups[1] & 0xff,
      (groups[2] >> 8) & 0xff,
      groups[2] & 0xff
    )
  }

  // Unique-local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8)
  if ((groups[0] & 0xfe00) === 0xfc00) return true
  if ((groups[0] & 0xffc0) === 0xfe80) return true
  if ((groups[0] & 0xff00) === 0xff00) return true
  return false
}

/**
 * Whether a literal IPv4 or IPv6 address resolves to loopback, private, link-local,
 * CGNAT, metadata, or reserved space rather than the public internet.
 */
export function isLocalIpAddress(address: string): boolean {
  const host = address
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
  if (!host) return true
  const ipv4 = parseIpv4Octets(host)
  if (ipv4) {
    return isLocalIpv4Octets(ipv4[0], ipv4[1], ipv4[2], ipv4[3])
  }
  const ipv6 = parseIpv6Groups(host)
  if (ipv6) {
    return isLocalIpv6Groups(ipv6)
  }
  return false
}

/**
 * Whether a hostname names a machine on the caller's own network rather than the internet.
 *
 * 169.254.169.254 is the cloud instance-metadata address, and loopback covers the
 * admin panels a desktop app is uniquely well placed to reach — both are the point of
 * separating `network.local` from `network.internet` in the permission registry.
 */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '')
    .toLowerCase()
  if (!host) return true
  if (LOOPBACK_HOSTS.has(host)) return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost'))
    return true

  const ipv4 = parseIpv4Octets(host)
  if (ipv4) {
    return isLocalIpv4Octets(ipv4[0], ipv4[1], ipv4[2], ipv4[3])
  }

  const ipv6 = parseIpv6Groups(host)
  if (ipv6) {
    return isLocalIpv6Groups(ipv6)
  }

  // Fail closed on malformed IPv6-like strings
  if (host.includes(':')) {
    return true
  }

  return false
}

export function isHttpUrl(source: unknown): boolean {
  if (typeof source !== 'string') return false
  const raw = source.trim()
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Classifies where a network request is headed, so the right permission can be required.
 *
 * The three network transport handlers forwarded whatever they were given with no permission
 * check at all, even though the registry declares network.local and network.internet for
 * exactly this. That let a plugin sidestep the confinement
 * installPluginViewNavigationPolicy puts on its own view: the request is issued by the main
 * process, outside the view's session, with the user's LAN position (#906).
 *
 * 'non-http' covers sources that are not network requests at all — readText and readBinary
 * accept local file paths, which are policed separately by the local-file allowlist.
 *
 * Anything unparseable is treated as 'local', the more restrictive answer, so a malformed
 * target cannot fall through to the weaker permission.
 */
export function classifyNetworkTarget(source: unknown): NetworkTargetClass {
  const raw = typeof source === 'string' ? source.trim() : ''
  if (!raw) return 'local'

  if (!/^https?:\/\//i.test(raw)) {
    return 'non-http'
  }

  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'non-http'
    }
    return isLocalHostname(parsed.hostname) ? 'local' : 'internet'
  } catch {
    return 'local'
  }
}
