import { Buffer } from 'node:buffer'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { useRuntimeConfig } from '#imports'
import { resolveRequestIp } from './ipSecurityStore'

interface OobConfig {
  clientId: string
  clientSecret: string
  mtlsEnabled: boolean
  mtlsFingerprints: string[]
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean')
    return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true')
      return true
    if (normalized === 'false')
      return false
  }
  return false
}

function toSafeBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8')
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(toSafeBuffer(left)).digest()
  const rightDigest = createHash('sha256').update(toSafeBuffer(right)).digest()
  const digestMatched = timingSafeEqual(leftDigest, rightDigest)
  return digestMatched && left.length === right.length
}

function normalizeFingerprint(value: string) {
  return value.trim().toLowerCase()
}

function readOobConfig(event: H3Event): OobConfig {
  const config = useRuntimeConfig(event)
  const clientId = typeof config.adminControl?.oobAccessClientId === 'string'
    ? config.adminControl.oobAccessClientId.trim()
    : ''
  const clientSecret = typeof config.adminControl?.oobAccessClientSecret === 'string'
    ? config.adminControl.oobAccessClientSecret.trim()
    : ''
  const mtlsEnabled = asBoolean(config.adminControl?.oobMtlsEnabled)
  const mtlsFingerprints = typeof config.adminControl?.oobMtlsFingerprints === 'string'
    ? config.adminControl.oobMtlsFingerprints
      .split(',')
      .map(normalizeFingerprint)
      .filter(Boolean)
    : []

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'OOB Access service token is not configured.',
    })
  }

  return {
    clientId,
    clientSecret,
    mtlsEnabled,
    mtlsFingerprints,
  }
}

function readMtlsFingerprint(event: H3Event): string | null {
  const cf = (event.context.cloudflare as any)?.request?.cf as Record<string, any> | undefined
  const tlsClientAuth = cf?.tlsClientAuth as Record<string, any> | undefined
  const fp = typeof tlsClientAuth?.certFingerprintSHA256 === 'string'
    ? normalizeFingerprint(tlsClientAuth.certFingerprintSHA256)
    : ''
  return fp || null
}

export function hasOobHeaders(event: H3Event): boolean {
  const clientId = getHeader(event, 'cf-access-client-id')
  const clientSecret = getHeader(event, 'cf-access-client-secret')
  return Boolean(clientId && clientSecret)
}

export function requireAdminOobAuth(event: H3Event) {
  const oob = readOobConfig(event)
  const clientId = getHeader(event, 'cf-access-client-id') || ''
  const clientSecret = getHeader(event, 'cf-access-client-secret') || ''

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 401,
      statusMessage: 'OOB auth required.',
    })
  }

  const idOk = constantTimeEqual(clientId, oob.clientId)
  const secretOk = constantTimeEqual(clientSecret, oob.clientSecret)
  if (!idOk || !secretOk) {
    throw createError({
      statusCode: 401,
      statusMessage: 'OOB auth required.',
    })
  }

  const mtlsFingerprint = readMtlsFingerprint(event)
  if (oob.mtlsEnabled) {
    if (!mtlsFingerprint) {
      throw createError({
        statusCode: 401,
        statusMessage: 'mTLS auth required.',
      })
    }
    if (oob.mtlsFingerprints.length > 0 && !oob.mtlsFingerprints.includes(mtlsFingerprint)) {
      throw createError({
        statusCode: 401,
        statusMessage: 'mTLS auth required.',
      })
    }
  }

  const ip = resolveRequestIp(event) || 'unknown'
  const fingerprint = mtlsFingerprint || 'no-mtls'
  const actorKey = createHash('sha256').update(`oob:${ip}:${fingerprint}`).digest('hex')
  return {
    actorId: `oob:${actorKey}`,
    mtlsFingerprint,
  }
}
