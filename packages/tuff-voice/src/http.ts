import type { VoiceHttpClient, VoiceHttpResponse } from './contracts'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { VoiceProviderError } from './contracts'

const MAX_SAFE_REDIRECTS = 5
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])
const SENSITIVE_REDIRECT_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
  'x-api-access-key',
  'x-dashscope-workspace',
])

export type DnsLookupFn = (hostname: string) => Promise<ReadonlyArray<{ address: string }>>

export interface SafeRemoteUrlOptions {
  allowedProtocols?: readonly string[]
  allowLocalhost?: boolean
  lookup?: DnsLookupFn
}

const defaultDnsLookup: DnsLookupFn = async (hostname) => {
  return await dnsLookup(hostname, { all: true, verbatim: true })
}

function stripIpv6Brackets(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1)
  }
  return hostname
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.')
  if (parts.length !== 4)
    return null
  const nums: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part))
      return null
    const value = Number.parseInt(part, 10)
    if (value < 0 || value > 255)
      return null
    nums.push(value)
  }
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!]
}

function isPrivateOrReservedIpv4Octets(a: number, b: number, c: number, _d: number): boolean {
  if (a === 0)
    return true // 0.0.0.0/8 (this network)
  if (a === 10)
    return true // 10.0.0.0/8 (RFC 1918)
  if (a === 100 && b >= 64 && b <= 127)
    return true // 100.64.0.0/10 (CGNAT)
  if (a === 127)
    return true // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254)
    return true // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b >= 16 && b <= 31)
    return true // 172.16.0.0/12 (RFC 1918)
  if (a === 192 && b === 0 && c === 0)
    return true // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && c === 2)
    return true // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 168)
    return true // 192.168.0.0/16 (RFC 1918)
  if (a === 198 && (b === 18 || b === 19))
    return true // 198.18.0.0/15 (benchmarking)
  if (a === 198 && b === 51 && c === 100)
    return true // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113)
    return true // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224)
    return true // 224.0.0.0/4 (multicast) & 240.0.0.0/4 (reserved/broadcast)
  return false
}

function expandIpv6Groups(rawIp: string): number[] | null {
  const ip = rawIp.toLowerCase()
  if (ip.includes('%'))
    return null // Zone IDs are never valid public remote targets

  // Normalize dotted-quad IPv4 tail (e.g. ::ffff:127.0.0.1)
  let normalized = ip
  const lastColon = ip.lastIndexOf(':')
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes('.')) {
    const octets = parseIpv4Octets(ip.slice(lastColon + 1))
    if (!octets)
      return null
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    normalized = `${ip.slice(0, lastColon + 1)}${high}:${low}`
  }

  const doubleColonParts = normalized.split('::')
  if (doubleColonParts.length > 2)
    return null

  const parseSide = (side: string): number[] | null => {
    if (!side)
      return []
    const chunks = side.split(':')
    const out: number[] = []
    for (const chunk of chunks) {
      if (!/^[0-9a-f]{1,4}$/.test(chunk))
        return null
      out.push(Number.parseInt(chunk, 16))
    }
    return out
  }

  if (doubleColonParts.length === 1) {
    const groups = parseSide(doubleColonParts[0]!)
    return groups && groups.length === 8 ? groups : null
  }

  const left = parseSide(doubleColonParts[0]!)
  const right = parseSide(doubleColonParts[1]!)
  if (!left || !right)
    return null
  const missing = 8 - (left.length + right.length)
  if (missing < 1)
    return null
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

function isLoopbackIpv6(groups: readonly number[]): boolean {
  return (
    groups[0] === 0
    && groups[1] === 0
    && groups[2] === 0
    && groups[3] === 0
    && groups[4] === 0
    && groups[5] === 0
    && groups[6] === 0
    && groups[7] === 1
  )
}

export function isLoopbackHost(rawHostname: string): boolean {
  const host = stripIpv6Brackets(rawHostname.trim().toLowerCase()).replace(/\.+$/, '')
  if (host === 'localhost' || host.endsWith('.localhost'))
    return true
  const ipKind = isIP(host)
  if (ipKind === 4) {
    const octets = parseIpv4Octets(host)
    return octets !== null && octets[0] === 127
  }
  if (ipKind === 6) {
    const groups = expandIpv6Groups(host)
    if (!groups)
      return false
    if (isLoopbackIpv6(groups))
      return true
    // ::ffff:127.0.0.0/104
    if (
      groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0
      && groups[4] === 0 && groups[5] === 0xFFFF
    ) {
      return ((groups[6]! >> 8) & 0xFF) === 127
    }
  }
  return false
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = stripIpv6Brackets(rawIp.trim().toLowerCase())
  if (!ip || ip.includes('%'))
    return true

  const kind = isIP(ip)
  if (kind === 4) {
    const octets = parseIpv4Octets(ip)
    if (!octets)
      return true
    return isPrivateOrReservedIpv4Octets(octets[0], octets[1], octets[2], octets[3])
  }
  if (kind === 6) {
    const groups = expandIpv6Groups(ip)
    if (!groups)
      return true
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    // :: (unspecified) and ::1 (loopback)
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) {
      return true
    }
    // ::ffff:0:0/96 (IPv4-mapped) and ::ffff:0:0:0/96 (IPv4-translated)
    if (
      g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0
      && ((g4 === 0 && g5 === 0xFFFF) || (g4 === 0xFFFF && g5 === 0))
    ) {
      return isPrivateOrReservedIpv4Octets((g6 >> 8) & 0xFF, g6 & 0xFF, (g7 >> 8) & 0xFF, g7 & 0xFF)
    }
    // ::/96 deprecated IPv4-compatible
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
      return true
    }
    // 64:ff9b::/96 and 64:ff9b:1::/48 (NAT64)
    if (g0 === 0x0064 && g1 === 0xFF9B) {
      if (g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
        return isPrivateOrReservedIpv4Octets((g6 >> 8) & 0xFF, g6 & 0xFF, (g7 >> 8) & 0xFF, g7 & 0xFF)
      }
      if (g2 === 0x0001)
        return true
    }
    // 100::/64 (discard-only)
    if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0)
      return true
    // 2001:db8::/32 (documentation)
    if (g0 === 0x2001 && g1 === 0x0DB8)
      return true
    // 2002::/16 (6to4 embeds IPv4 in g1:g2)
    if (g0 === 0x2002) {
      return isPrivateOrReservedIpv4Octets((g1 >> 8) & 0xFF, g1 & 0xFF, (g2 >> 8) & 0xFF, g2 & 0xFF)
    }
    // fc00::/7 (ULA)
    if ((g0 & 0xFE00) === 0xFC00)
      return true
    // fe80::/10 (link-local) and fec0::/10 (deprecated site-local)
    if ((g0 & 0xFFC0) === 0xFE80 || (g0 & 0xFFC0) === 0xFEC0)
      return true
    // ff00::/8 (multicast)
    if ((g0 & 0xFF00) === 0xFF00)
      return true
    return false
  }
  return false
}

function isBlockedHostname(rawHostname: string): boolean {
  const host = stripIpv6Brackets(rawHostname.trim().toLowerCase()).replace(/\.+$/, '')
  if (!host)
    return true
  if (host.includes('%'))
    return true
  if (
    host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.home.arpa')
    || host === 'metadata'
    || host === 'metadata.google.internal'
  ) {
    return true
  }
  if (isIP(host) !== 0) {
    return isPrivateOrReservedIp(host)
  }
  return false
}

export function isSafeRemoteUrl(
  rawUrl: string,
  allowedProtocols: readonly string[] = ['https:', 'wss:'],
  options: { allowLocalhost?: boolean } = {},
): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  }
  catch {
    return false
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    return false
  }
  if (parsed.username || parsed.password) {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) {
    return false
  }

  if (options.allowLocalhost && isLoopbackHost(hostname)) {
    return true
  }

  return !isBlockedHostname(hostname)
}

export async function assertSafeRemoteUrlAsync(
  rawUrl: string,
  options: SafeRemoteUrlOptions = {},
): Promise<URL> {
  const allowedProtocols = options.allowedProtocols ?? ['https:', 'wss:']
  const allowLocalhost = options.allowLocalhost === true

  if (!isSafeRemoteUrl(rawUrl, allowedProtocols, { allowLocalhost })) {
    throw new VoiceProviderError(
      'VOICE_SCRIPT_URL_DENIED',
      `URL is not an allowed remote target: ${rawUrl}`,
    )
  }

  const parsed = new URL(rawUrl)
  const canonicalHost = stripIpv6Brackets(parsed.hostname.toLowerCase()).replace(/\.+$/, '')

  if (allowLocalhost && isLoopbackHost(canonicalHost)) {
    return parsed
  }

  if (isIP(canonicalHost) !== 0) {
    if (isPrivateOrReservedIp(canonicalHost)) {
      throw new VoiceProviderError(
        'VOICE_SCRIPT_URL_DENIED',
        `URL resolves to a blocked IP address: ${rawUrl}`,
      )
    }
    return parsed
  }

  const lookupFn = options.lookup ?? defaultDnsLookup
  let resolved: ReadonlyArray<{ address: string }>
  try {
    resolved = await lookupFn(canonicalHost)
  }
  catch (error) {
    throw new VoiceProviderError(
      'VOICE_SCRIPT_URL_DENIED',
      `Failed to resolve remote host for URL: ${rawUrl}`,
      { cause: error },
    )
  }

  if (!resolved.length) {
    throw new VoiceProviderError(
      'VOICE_SCRIPT_URL_DENIED',
      `Remote host resolved to no addresses: ${rawUrl}`,
    )
  }

  for (const record of resolved) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new VoiceProviderError(
        'VOICE_SCRIPT_URL_DENIED',
        `Remote host resolved to a private or reserved IP address: ${rawUrl}`,
      )
    }
  }

  return parsed
}

function stripSensitiveHeadersForCrossOrigin(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers)
    return undefined
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_REDIRECT_HEADERS.has(key.toLowerCase())) {
      next[key] = value
    }
  }
  return next
}

export interface SafeFetchRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: BodyInit | Uint8Array | string
  signal?: AbortSignal
}

export interface SafeFetchOptions extends SafeRemoteUrlOptions {
  fetchImpl?: typeof fetch
  maxRedirects?: number
  /** Skip DNS lookup when calling a mocked fetch implementation without an explicit lookup hook. */
  skipDnsLookup?: boolean
}

export async function safeFetchWithRedirects(
  request: SafeFetchRequest,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch
  const allowedProtocols = options.allowedProtocols ?? ['https:']
  const allowLocalhost = options.allowLocalhost === true
  const maxRedirects = options.maxRedirects ?? MAX_SAFE_REDIRECTS
  const validateDns = !options.skipDnsLookup && (fetchImpl === fetch || options.lookup !== undefined)

  const validateHop = async (candidateUrl: string): Promise<URL> => {
    if (validateDns) {
      return await assertSafeRemoteUrlAsync(candidateUrl, {
        allowedProtocols,
        allowLocalhost,
        lookup: options.lookup,
      })
    }
    if (!isSafeRemoteUrl(candidateUrl, allowedProtocols, { allowLocalhost })) {
      throw new VoiceProviderError(
        'VOICE_SCRIPT_URL_DENIED',
        `URL is not an allowed remote target: ${candidateUrl}`,
      )
    }
    return new URL(candidateUrl)
  }

  let currentUrl = await validateHop(request.url)
  let currentMethod = request.method ?? 'GET'
  let currentHeaders = request.headers ? { ...request.headers } : undefined
  let currentBody = request.body

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const response = await fetchImpl(currentUrl.toString(), {
      method: currentMethod,
      headers: currentHeaders,
      body: currentBody as BodyInit | undefined,
      signal: request.signal,
      redirect: 'manual',
    })

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    if (!location) {
      return response
    }
    if (hop === maxRedirects) {
      throw new VoiceProviderError(
        'VOICE_HTTP_TOO_MANY_REDIRECTS',
        `Request exceeded maximum redirect limit (${maxRedirects}).`,
      )
    }

    let nextUrlRaw: string
    try {
      nextUrlRaw = new URL(location, currentUrl).toString()
    }
    catch (error) {
      throw new VoiceProviderError(
        'VOICE_SCRIPT_URL_DENIED',
        `Redirect target URL is invalid: ${location}`,
        { cause: error },
      )
    }

    const nextUrl = await validateHop(nextUrlRaw)
    if (nextUrl.origin !== currentUrl.origin) {
      currentHeaders = stripSensitiveHeadersForCrossOrigin(currentHeaders)
    }
    if (
      response.status === 303
      || ((response.status === 301 || response.status === 302) && currentMethod.toUpperCase() === 'POST')
    ) {
      currentMethod = 'GET'
      currentBody = undefined
    }
    currentUrl = nextUrl
  }

  throw new VoiceProviderError('VOICE_HTTP_TOO_MANY_REDIRECTS', 'Request exceeded maximum redirect limit.')
}

export function createFetchHttpClient(
  fetchImpl: typeof fetch = fetch,
  options: Omit<SafeFetchOptions, 'fetchImpl'> = {},
): VoiceHttpClient {
  return {
    async request(request) {
      const response = await safeFetchWithRedirects(
        {
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.body as BodyInit | undefined,
          signal: request.signal,
        },
        {
          ...options,
          fetchImpl,
          allowedProtocols: options.allowedProtocols ?? ['https:'],
        },
      )
      const body = await readResponseBody(response)
      const headers: Record<string, string | undefined> = {}
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
      })
      return { status: response.status, headers, body }
    },
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return await response.json()
  }
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

export function assertHttpSuccess(response: VoiceHttpResponse, provider: string): unknown {
  if (response.status < 200 || response.status >= 300) {
    throw new VoiceProviderError(
      `${provider.toUpperCase()}_HTTP_${response.status}`,
      `${provider} voice request failed with HTTP ${response.status}.`,
      { retryable: response.status >= 500 },
    )
  }
  return response.body
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function assertProviderOptionUrl(value: string, name: string): string {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new VoiceProviderError('VOICE_PROVIDER_URL_INVALID', `${name} is invalid.`)
  }
  if (url.protocol !== 'https:' || url.username || url.password || !isSafeRemoteUrl(value, ['https:'])) {
    throw new VoiceProviderError('VOICE_PROVIDER_URL_INVALID', `${name} must be a safe remote HTTPS URL.`)
  }
  return url.toString()
}
