import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { useRuntimeConfig } from '#imports'

const TOKEN_TYP = 'admin_emergency'
const TOKEN_ISSUER = 'nexus-admin-control-plane'
const SECRET_MIN_LENGTH = 16

export type AdminRiskScope = 'risk.mode.override' | 'risk.actor.unblock' | 'risk.case.review'

export interface AdminEmergencyClaims {
  typ: typeof TOKEN_TYP
  iss: typeof TOKEN_ISSUER
  admin_id: string
  scope: AdminRiskScope[]
  dfp_hash: string
  nonce: string
  iv: string
  jti: string
  iat: number
  exp: number
}

interface JwtHeader {
  alg: 'HS256'
  typ: 'JWT'
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Buffer {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0)
    normalized += '='
  return Buffer.from(normalized, 'base64')
}

function resolveEmergencyTokenSecret(event?: H3Event): string {
  const config = useRuntimeConfig(event)
  const secret = typeof config.adminControl?.emergencyJwtSecret === 'string'
    ? config.adminControl.emergencyJwtSecret.trim()
    : ''

  if (secret.length < SECRET_MIN_LENGTH) {
    throw createError({
      statusCode: 500,
      statusMessage: 'ADMIN_EMERGENCY_JWT_SECRET is required.',
    })
  }

  return secret
}

function signPayload(secret: string, signingInput: string) {
  return createHmac('sha256', secret).update(signingInput).digest()
}

export function parseBearerToken(event: H3Event): string | null {
  const header = getHeader(event, 'authorization')
  if (!header)
    return null
  const [scheme, value] = header.split(' ')
  if (scheme !== 'Bearer' || !value)
    return null
  return value.trim()
}

export function signAdminEmergencyToken(
  event: H3Event,
  claims: Omit<AdminEmergencyClaims, 'typ' | 'iss' | 'iat'>,
): string {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const secret = resolveEmergencyTokenSecret(event)

  const header: JwtHeader = { alg: 'HS256', typ: 'JWT' }
  const payload: AdminEmergencyClaims = {
    typ: TOKEN_TYP,
    iss: TOKEN_ISSUER,
    iat: nowSeconds,
    ...claims,
  }

  const headerPart = base64UrlEncode(JSON.stringify(header))
  const payloadPart = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerPart}.${payloadPart}`
  const signature = signPayload(secret, signingInput)
  return `${signingInput}.${base64UrlEncode(signature)}`
}

export function verifyAdminEmergencyToken(event: H3Event, token: string): AdminEmergencyClaims | null {
  const secret = resolveEmergencyTokenSecret(event)
  const parts = token.split('.')
  if (parts.length !== 3)
    return null

  const [headerPart, payloadPart, signaturePart] = parts
  if (!headerPart || !payloadPart || !signaturePart)
    return null

  try {
    const signingInput = `${headerPart}.${payloadPart}`
    const expected = signPayload(secret, signingInput)
    const actual = base64UrlDecode(signaturePart)
    if (expected.length !== actual.length)
      return null
    if (!timingSafeEqual(expected, actual))
      return null

    const payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8')) as AdminEmergencyClaims
    if (payload.typ !== TOKEN_TYP || payload.iss !== TOKEN_ISSUER)
      return null
    if (typeof payload.admin_id !== 'string' || !payload.admin_id)
      return null
    if (!Array.isArray(payload.scope) || payload.scope.length === 0)
      return null
    if (typeof payload.dfp_hash !== 'string' || !payload.dfp_hash)
      return null
    if (typeof payload.nonce !== 'string' || !payload.nonce)
      return null
    if (typeof payload.iv !== 'string' || !payload.iv)
      return null
    if (typeof payload.jti !== 'string' || !payload.jti)
      return null
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000))
      return null

    return payload
  }
  catch {
    return null
  }
}

