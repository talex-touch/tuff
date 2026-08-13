export type NetworkTargetClass = 'local' | 'internet' | 'non-http'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

/**
 * Whether a hostname names a machine on the caller's own network rather than the internet.
 *
 * 169.254.169.254 is the cloud instance-metadata address, and loopback covers the
 * admin panels a desktop app is uniquely well placed to reach — both are the point of
 * separating `network.local` from `network.internet` in the permission registry.
 */
function isLocalHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (LOOPBACK_HOSTS.has(host) || host === '::') return true
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost'))
    return true

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    if (a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }

  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)
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
    return isLocalHostname(new URL(raw).hostname) ? 'local' : 'internet'
  } catch {
    return 'local'
  }
}
