import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'
import { resolveRequestIp } from './ipSecurityStore'

function resolveClientCountry(event: H3Event): string | null {
  const country = getRequestHeader(event, 'cf-ipcountry')
    || getRequestHeader(event, 'x-vercel-ip-country')
    || getRequestHeader(event, 'x-country')
  return typeof country === 'string' && country.trim() ? country.trim() : null
}

export function resolveAuditMeta(event: H3Event): Record<string, string> {
  const meta: Record<string, string> = {}
  const ip = resolveRequestIp(event)
  if (ip)
    meta.ip = ip
  const country = resolveClientCountry(event)
  if (country)
    meta.country = country
  return meta
}
