import type { H3Event } from 'h3'
import { getRequestHeader, getRequestIP } from 'h3'

function resolveClientIp(event: H3Event): string | null {
  const direct = getRequestIP(event, { xForwardedFor: true })
  if (direct)
    return direct
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  if (forwarded) {
    const value = forwarded.split(',')[0]?.trim()
    return value || null
  }
  const cf = getRequestHeader(event, 'cf-connecting-ip')
  return cf?.trim() || null
}

function resolveClientCountry(event: H3Event): string | null {
  const country = getRequestHeader(event, 'cf-ipcountry')
    || getRequestHeader(event, 'x-vercel-ip-country')
    || getRequestHeader(event, 'x-country')
  return typeof country === 'string' && country.trim() ? country.trim() : null
}

export function resolveAuditMeta(event: H3Event): Record<string, string> {
  const meta: Record<string, string> = {}
  const ip = resolveClientIp(event)
  if (ip)
    meta.ip = ip
  const country = resolveClientCountry(event)
  if (country)
    meta.country = country
  return meta
}
