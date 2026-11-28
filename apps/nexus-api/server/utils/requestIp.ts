import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { getHeader } from 'h3'

/**
 * Resolve client IP from Cloudflare's trusted CF-Connecting-IP header first,
 * falling back to forwarded headers only in local development / tests.
 */
export function resolveRequestIp(event: H3Event): string | undefined {
  const cfRequest = (event.context?.cloudflare as { request?: { headers?: { get?: (name: string) => string | null } } } | undefined)?.request
  const cfHeaderValue = (name: string) => {
    try {
      return cfRequest?.headers?.get?.(name) || undefined
    }
    catch {
      return undefined
    }
  }

  const remoteAddress
    = (event as any)?.node?.req?.socket?.remoteAddress
      || (event as any)?.node?.req?.connection?.remoteAddress
      || undefined

  const raw
    = cfHeaderValue('CF-Connecting-IP')
      || cfHeaderValue('cf-connecting-ip')
      || getHeader(event, 'cf-connecting-ip')
      || getHeader(event, 'CF-Connecting-IP')
      || getHeader(event, 'x-forwarded-for')
      || getHeader(event, 'x-real-ip')
      || getHeader(event, 'true-client-ip')
      || remoteAddress
      || undefined

  if (!raw)
    return undefined

  const first = String(raw).split(',')[0]?.trim()
  if (!first)
    return undefined

  return first.length > 128 ? first.slice(0, 128) : first
}

export function hashIpForRateLimit(ip: string): string {
  return createHash('sha256').update(`nexus-rl:${ip.trim().toLowerCase()}`).digest('hex').slice(0, 32)
}
