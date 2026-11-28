import type { LookupAddress } from 'node:dns'
import { lookup as dnsLookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const DEFAULT_MAX_REDIRECTS = 5
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15_000

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal'
])

function parseIpv4Parts(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    nums.push(value)
  }
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!]
}

function isBlockedIpv4(ip: string): boolean {
  const parts = parseIpv4Parts(ip)
  if (!parts) return true
  const [a, b, c] = parts
  // 0.0.0.0/8 (unspecified / "this network")
  if (a === 0) return true
  // 10.0.0.0/8 (RFC1918)
  if (a === 10) return true
  // 100.64.0.0/10 (RFC6598 CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true
  // 169.254.0.0/16 (link-local & cloud IMDS 169.254.169.254)
  if (a === 169 && b === 254) return true
  // 172.16.0.0/12 (RFC1918)
  if (a === 172 && b >= 16 && b <= 31) return true
  // 192.0.0.0/24 (IETF protocol assignments) & 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  // 192.168.0.0/16 (RFC1918)
  if (a === 192 && b === 168) return true
  // 198.18.0.0/15 (benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true
  // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved/broadcast)
  if (a >= 224) return true
  return false
}

function expandIpv6(raw: string): number[] | null {
  const withoutZone = raw.split('%')[0]!.toLowerCase()
  let working = withoutZone

  // Convert trailing dotted-quad IPv4 to two 16-bit hex groups (e.g. ::ffff:127.0.0.1)
  const lastColon = working.lastIndexOf(':')
  if (lastColon !== -1 && working.slice(lastColon + 1).includes('.')) {
    const ipv4 = parseIpv4Parts(working.slice(lastColon + 1))
    if (!ipv4) return null
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16)
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16)
    working = `${working.slice(0, lastColon)}:${high}:${low}`
  }

  const doubleColonParts = working.split('::')
  if (doubleColonParts.length > 2) return null

  const parseSegment = (segment: string): number[] | null => {
    if (!segment) return []
    const groups = segment.split(':')
    const parsed: number[] = []
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null
      parsed.push(Number.parseInt(group, 16))
    }
    return parsed
  }

  if (doubleColonParts.length === 1) {
    const groups = parseSegment(doubleColonParts[0]!)
    return groups && groups.length === 8 ? groups : null
  }

  const left = parseSegment(doubleColonParts[0]!)
  const right = parseSegment(doubleColonParts[1]!)
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if (missing < 1) return null
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

function isBlockedIpv6(raw: string): boolean {
  const groups = expandIpv6(raw)
  if (!groups) return true

  const allZeroPrefix =
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0

  // :: (unspecified) and ::1 (loopback)
  if (allZeroPrefix && groups[5] === 0 && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) {
    return true
  }

  // ::ffff:0:0/96 (IPv4-mapped) or ::0:0/96 (IPv4-compatible)
  if (allZeroPrefix && (groups[5] === 0xffff || groups[5] === 0)) {
    const embedded = `${(groups[6]! >> 8) & 0xff}.${groups[6]! & 0xff}.${(groups[7]! >> 8) & 0xff}.${groups[7]! & 0xff}`
    return isBlockedIpv4(embedded)
  }

  // ::ffff:0:0:0/96 (RFC 2765 SIIT IPv4-translated — non-globally-reachable)
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0xffff &&
    groups[5] === 0
  ) {
    return true
  }

  // 64:ff9b::/96 (NAT64 well-known prefix) and 64:ff9b:1::/48 (RFC 8215 local-use NAT64)
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) {
    if (groups[2] === 1) return true
    if (groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0) {
      const embedded = `${(groups[6]! >> 8) & 0xff}.${groups[6]! & 0xff}.${(groups[7]! >> 8) & 0xff}.${groups[7]! & 0xff}`
      return isBlockedIpv4(embedded)
    }
  }

  // 2002::/16 (6to4) — check embedded IPv4 in groups[1..2]
  if (groups[0] === 0x2002) {
    const embedded = `${(groups[1]! >> 8) & 0xff}.${groups[1]! & 0xff}.${(groups[2]! >> 8) & 0xff}.${groups[2]! & 0xff}`
    return isBlockedIpv4(embedded)
  }

  // 100::/64 (discard-only)
  if (groups[0] === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true
  // 2001::/32 (Teredo), 2001:2::/48 (benchmarking), 2001:10::/28 & 2001:20::/28 (ORCHID/v2), 2001:db8::/32 (docs)
  if (groups[0] === 0x2001) {
    if (groups[1] === 0 || groups[1] === 0x0db8) return true
    if (groups[1] === 0x0002 && groups[2] === 0) return true
    if ((groups[1]! & 0xfff0) === 0x0010 || (groups[1]! & 0xfff0) === 0x0020) return true
  }
  // fc00::/7 (unique local)
  if ((groups[0]! & 0xfe00) === 0xfc00) return true
  // fe80::/10 (link-local) & fec0::/10 (deprecated site-local)
  if ((groups[0]! & 0xffc0) === 0xfe80 || (groups[0]! & 0xffc0) === 0xfec0) return true
  // ff00::/8 (multicast)
  if ((groups[0]! & 0xff00) === 0xff00) return true

  return false
}

export function isBlockedIpAddress(rawAddress: string): boolean {
  const stripped = rawAddress.trim().replace(/^\[/, '').replace(/\]$/, '')
  const ipVersion = net.isIP(stripped)
  if (ipVersion === 4) return isBlockedIpv4(stripped)
  if (ipVersion === 6) return isBlockedIpv6(stripped)
  return true
}

export function validatePublicHttpUrl(rawUrl: string): URL {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('SSRF_BLOCKED: URL is required')
  }
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error('SSRF_BLOCKED: Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`SSRF_BLOCKED: Disallowed protocol ${parsed.protocol}`)
  }
  if (parsed.username || parsed.password) {
    throw new Error('SSRF_BLOCKED: Credentials in URL are not allowed')
  }

  const host = parsed.hostname
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.+$/, '')
    .toLowerCase()
  if (!host) {
    throw new Error('SSRF_BLOCKED: Hostname is required')
  }
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error(`SSRF_BLOCKED: Disallowed host ${host}`)
  }

  const ipVersion = net.isIP(host)
  if (ipVersion !== 0 && isBlockedIpAddress(host)) {
    throw new Error(`SSRF_BLOCKED: Disallowed IP address ${host}`)
  }

  return parsed
}

export interface SafeWebPageFetchOptions {
  signal?: AbortSignal
  maxBytes?: number
  timeoutMs?: number
  maxRedirects?: number
  resolveHost?: (hostname: string) => Promise<LookupAddress[]>
}

async function resolveAndVerifyAddresses(
  hostname: string,
  resolveHost: (hostname: string) => Promise<LookupAddress[]>
): Promise<LookupAddress> {
  const bare = hostname.replace(/^\[/, '').replace(/\]$/, '')
  const ipVersion = net.isIP(bare)
  if (ipVersion !== 0) {
    if (isBlockedIpAddress(bare)) {
      throw new Error(`SSRF_BLOCKED: Disallowed IP address ${bare}`)
    }
    return { address: bare, family: ipVersion as 4 | 6 }
  }

  const addresses = await resolveHost(bare)
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error(`SSRF_BLOCKED: DNS lookup returned no addresses for ${bare}`)
  }
  for (const entry of addresses) {
    if (!entry?.address || isBlockedIpAddress(entry.address)) {
      throw new Error(`SSRF_BLOCKED: Resolved disallowed address for ${bare}`)
    }
  }
  return addresses[0]!
}

function requestWithPinnedAddress(
  target: URL,
  pinned: LookupAddress,
  options: { signal?: AbortSignal; maxBytes: number; timeoutMs: number }
): Promise<{ statusCode: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('BROWSER_EXTRACT_CANCELLED'))
      return
    }

    const transport = target.protocol === 'https:' ? https : http
    let settled = false
    let req: http.ClientRequest | undefined
    let resStream: http.IncomingMessage | undefined

    const cleanup = () => {
      options.signal?.removeEventListener('abort', onAbort)
    }

    const finishError = (err: Error) => {
      if (settled) return
      settled = true
      cleanup()
      req?.destroy()
      resStream?.destroy()
      reject(err)
    }

    const onAbort = () => {
      finishError(new Error('BROWSER_EXTRACT_CANCELLED'))
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname.replace(/^\[/, '').replace(/\]$/, ''),
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        timeout: options.timeoutMs,
        headers: {
          'User-Agent': 'Tuff-BrowserExtract/1.0',
          Accept: 'text/html, text/plain, application/xhtml+xml;q=0.9, */*;q=0.1'
        },
        lookup: ((_hostname: string, lookupOpts: unknown, callback?: unknown) => {
          const cb = (typeof lookupOpts === 'function' ? lookupOpts : callback) as (
            err: NodeJS.ErrnoException | null,
            address: string | LookupAddress[],
            family?: number
          ) => void
          const wantsAll =
            typeof lookupOpts === 'object' &&
            lookupOpts !== null &&
            (lookupOpts as { all?: boolean }).all === true
          if (wantsAll) {
            cb(null, [{ address: pinned.address, family: pinned.family }])
          } else {
            cb(null, pinned.address, pinned.family)
          }
        }) as http.RequestOptions['lookup']
      },
      (res) => {
        resStream = res
        const statusCode = res.statusCode ?? 0
        const locationHeader = res.headers.location
        const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader

        if (statusCode >= 300 && statusCode < 400 && location) {
          if (!settled) {
            settled = true
            cleanup()
            res.destroy()
            req?.destroy()
            resolve({ statusCode, location, body: '' })
          }
          return
        }

        const chunks: Buffer[] = []
        let totalBytes = 0
        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.byteLength
          if (totalBytes > options.maxBytes) {
            finishError(new Error('BROWSER_EXTRACT_RESPONSE_TOO_LARGE'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          if (settled) return
          settled = true
          cleanup()
          resolve({
            statusCode,
            body: Buffer.concat(chunks, totalBytes).toString('utf8')
          })
        })
        res.on('error', (error) =>
          finishError(error instanceof Error ? error : new Error(String(error)))
        )
      }
    )

    req.on('timeout', () => {
      finishError(new Error('BROWSER_EXTRACT_TIMEOUT'))
    })
    req.on('error', (error) =>
      finishError(error instanceof Error ? error : new Error(String(error)))
    )
    req.end()
  })
}

export async function fetchSafeWebPageText(
  rawUrl: string,
  options: SafeWebPageFetchOptions = {}
): Promise<{ url: string; body: string }> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const resolveHost =
    options.resolveHost ??
    ((hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }))

  let currentUrl = validatePublicHttpUrl(rawUrl)

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    if (options.signal?.aborted) {
      throw new Error('BROWSER_EXTRACT_CANCELLED')
    }
    const pinned = await resolveAndVerifyAddresses(currentUrl.hostname, resolveHost)
    const response = await requestWithPinnedAddress(currentUrl, pinned, {
      signal: options.signal,
      maxBytes,
      timeoutMs
    })

    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      if (hop === maxRedirects) {
        throw new Error('SSRF_BLOCKED: Too many redirects')
      }
      const nextRaw = new URL(response.location, currentUrl).toString()
      currentUrl = validatePublicHttpUrl(nextRaw)
      continue
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(`BROWSER_EXTRACT_HTTP_${response.statusCode}`)
    }

    return {
      url: currentUrl.toString(),
      body: response.body
    }
  }

  throw new Error('SSRF_BLOCKED: Too many redirects')
}
