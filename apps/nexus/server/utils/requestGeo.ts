import type { H3Event } from 'h3'
import { getHeader } from 'h3'

export type RequestGeoSource = 'edge-cf' | 'header' | 'unknown'

export interface RequestGeo {
  countryCode: string | null
  regionCode: string | null
  regionName: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  timezone: string | null
  source: RequestGeoSource
}

const EMPTY_GEO: RequestGeo = {
  countryCode: null,
  regionCode: null,
  regionName: null,
  city: null,
  latitude: null,
  longitude: null,
  timezone: null,
  source: 'unknown',
}

function normalizeText(value: unknown, maxLength = 128): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

function normalizeCountryCode(value: unknown): string | null {
  const normalized = normalizeText(value, 8)?.toUpperCase()
  if (!normalized || normalized === 'XX') {
    return null
  }
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

function normalizeRegionCode(value: unknown): string | null {
  const normalized = normalizeText(value, 32)?.toUpperCase()
  if (!normalized) {
    return null
  }
  return /^[A-Z0-9-]{1,32}$/.test(normalized) ? normalized : null
}

function normalizeCoordinate(value: unknown, min: number, max: number): number | null {
  const raw = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(raw)) {
    return null
  }
  if (raw < min || raw > max) {
    return null
  }
  return Number(raw.toFixed(6))
}

function hasGeoData(geo: Omit<RequestGeo, 'source'>): boolean {
  return Boolean(
    geo.countryCode
    || geo.regionCode
    || geo.regionName
    || geo.city
    || geo.latitude != null
    || geo.longitude != null
    || geo.timezone,
  )
}

function readHeaderValue(event: H3Event, names: string[]): string | null {
  for (const name of names) {
    const value = getHeader(event, name)
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }
  return null
}

function resolveFromCloudflareRequest(event: H3Event): RequestGeo | null {
  const cf = (event.context.cloudflare as any)?.request?.cf as Record<string, unknown> | undefined
  if (!cf || typeof cf !== 'object') {
    return null
  }

  const geo = {
    countryCode: normalizeCountryCode(cf.country),
    regionCode: normalizeRegionCode(cf.regionCode),
    regionName: normalizeText(cf.region, 64),
    city: normalizeText(cf.city, 64),
    latitude: normalizeCoordinate(cf.latitude, -90, 90),
    longitude: normalizeCoordinate(cf.longitude, -180, 180),
    timezone: normalizeText(cf.timezone, 64),
  }

  if (!hasGeoData(geo)) {
    return null
  }

  return {
    ...geo,
    source: 'edge-cf',
  }
}

function resolveFromHeaders(event: H3Event): RequestGeo | null {
  const geo = {
    countryCode: normalizeCountryCode(readHeaderValue(event, [
      'cf-ipcountry',
      'x-vercel-ip-country',
      'x-nf-country',
    ])),
    regionCode: normalizeRegionCode(readHeaderValue(event, [
      'cf-region-code',
      'x-vercel-ip-country-region',
      'x-nf-region-code',
    ])),
    regionName: normalizeText(readHeaderValue(event, [
      'cf-region',
      'x-vercel-ip-country-region-name',
      'x-nf-region',
    ]), 64),
    city: normalizeText(readHeaderValue(event, [
      'cf-ipcity',
      'x-vercel-ip-city',
      'x-nf-city',
    ]), 64),
    latitude: normalizeCoordinate(readHeaderValue(event, [
      'cf-iplatitude',
      'x-vercel-ip-latitude',
      'x-nf-latitude',
    ]), -90, 90),
    longitude: normalizeCoordinate(readHeaderValue(event, [
      'cf-iplongitude',
      'x-vercel-ip-longitude',
      'x-nf-longitude',
    ]), -180, 180),
    timezone: normalizeText(readHeaderValue(event, [
      'cf-timezone',
      'x-vercel-ip-timezone',
      'x-nf-timezone',
    ]), 64),
  }

  if (!hasGeoData(geo)) {
    return null
  }

  return {
    ...geo,
    source: 'header',
  }
}

export function resolveRequestGeo(event: H3Event): RequestGeo {
  return resolveFromCloudflareRequest(event)
    || resolveFromHeaders(event)
    || EMPTY_GEO
}
