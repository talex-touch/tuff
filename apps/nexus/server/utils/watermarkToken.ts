import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { useRuntimeConfig } from '#imports'

const TOKEN_TTL_SECONDS = 5 * 60
const SECRET_MIN_LENGTH = 16

interface WatermarkTokenPayload {
  typ: 'wm'
  uid: string | null
  did: string
  sid: string
  shot: string
  iat: number
  exp: number
}

let secretCache: string | null = null

function base64UrlEncode(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return Buffer.from(normalized, 'base64').toString('utf-8')
}

function getWatermarkSecret(): string {
  if (secretCache)
    return secretCache
  const config = useRuntimeConfig()
  const candidates = [
    config.watermark?.secretKey,
    config.auth?.secret,
    process.env.WATERMARK_SECRET_KEY,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length >= SECRET_MIN_LENGTH) {
      secretCache = candidate
      return secretCache
    }
  }
  secretCache = 'nexus-watermark-fallback-secret-v1'
  console.warn('[watermark] secret key missing or too short, using fallback secret.')
  return secretCache
}

function sign(input: string): string {
  return createHash('sha256')
    .update(`${input}.${getWatermarkSecret()}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function createWatermarkToken(payload: Omit<WatermarkTokenPayload, 'iat' | 'exp' | 'typ'>, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000)
  const exp = issuedAt + TOKEN_TTL_SECONDS
  const tokenPayload: WatermarkTokenPayload = {
    typ: 'wm',
    uid: payload.uid ?? null,
    did: payload.did,
    sid: payload.sid,
    shot: payload.shot,
    iat: issuedAt,
    exp,
  }
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(tokenPayload))
  const signingInput = `${header}.${body}`
  const signature = sign(signingInput)
  return `${signingInput}.${signature}`
}

export function verifyWatermarkToken(token: string): WatermarkTokenPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3)
    return null
  const [headerPart, payloadPart, signaturePart] = parts
  if (!headerPart || !payloadPart || !signaturePart)
    return null
  const signingInput = `${headerPart}.${payloadPart}`
  const expected = sign(signingInput)
  if (expected.length !== signaturePart.length || expected !== signaturePart)
    return null
  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as Partial<WatermarkTokenPayload>
    if (payload.typ !== 'wm')
      return null
    if (!payload.did || !payload.sid || !payload.shot)
      return null
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000))
      return null
    return {
      typ: 'wm',
      uid: payload.uid ?? null,
      did: payload.did,
      sid: payload.sid,
      shot: payload.shot,
      iat: Number(payload.iat ?? 0),
      exp: Number(payload.exp),
    }
  }
  catch {
    return null
  }
}

export function hashWatermarkSeed(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
