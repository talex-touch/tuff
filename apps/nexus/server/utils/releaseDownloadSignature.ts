import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getQuery } from 'h3'

interface ReleaseDownloadRuntimeConfig {
  releaseDownload?: {
    secret?: string
    signedTtlSeconds?: number
    allowUnsignedFallback?: boolean
  }
}

interface ReleaseDownloadSignatureInput {
  tag: string
  platform: string
  arch: string
  exp: number
}

export interface ReleaseDownloadQuerySignature {
  exp: number
  sig: string
}

const DEFAULT_SIGNED_TTL_SECONDS = 15 * 60
const MIN_SIGNED_TTL_SECONDS = 60
const MAX_SIGNED_TTL_SECONDS = 24 * 60 * 60

function normalizeTtlSeconds(value: unknown): number {
  const ttl = Number(value)
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return DEFAULT_SIGNED_TTL_SECONDS
  }
  return Math.max(MIN_SIGNED_TTL_SECONDS, Math.min(MAX_SIGNED_TTL_SECONDS, Math.floor(ttl)))
}

function resolveConfig(event: H3Event): {
  secret: string
  signedTtlSeconds: number
  allowUnsignedFallback: boolean
} {
  const runtimeConfig = useRuntimeConfig(event) as ReleaseDownloadRuntimeConfig
  const secret = typeof runtimeConfig.releaseDownload?.secret === 'string'
    ? runtimeConfig.releaseDownload.secret.trim()
    : ''
  return {
    secret,
    signedTtlSeconds: normalizeTtlSeconds(runtimeConfig.releaseDownload?.signedTtlSeconds),
    allowUnsignedFallback: runtimeConfig.releaseDownload?.allowUnsignedFallback !== false
  }
}

function buildPayload(input: ReleaseDownloadSignatureInput): string {
  return `${input.tag}:${input.platform}:${input.arch}:${input.exp}`
}

function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function createSignedReleaseDownloadPath(
  event: H3Event,
  input: {
    tag: string
    platform: string
    arch: string
    ttlSeconds?: number
  }
): string | null {
  const config = resolveConfig(event)
  if (!config.secret) {
    return null
  }

  const ttlSeconds = normalizeTtlSeconds(input.ttlSeconds ?? config.signedTtlSeconds)
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload: ReleaseDownloadSignatureInput = {
    tag: input.tag,
    platform: input.platform,
    arch: input.arch,
    exp
  }
  const sig = signPayload(config.secret, buildPayload(payload))
  return `/api/releases/${input.tag}/download/${input.platform}/${input.arch}?exp=${exp}&sig=${sig}`
}

export function parseReleaseDownloadQuerySignature(
  event: H3Event
): ReleaseDownloadQuerySignature | null {
  const query = getQuery(event)
  const expRaw = query.exp
  const sigRaw = query.sig
  if (typeof expRaw !== 'string' || typeof sigRaw !== 'string') {
    return null
  }
  const exp = Number.parseInt(expRaw, 10)
  if (!Number.isFinite(exp) || exp <= 0) {
    return null
  }
  const sig = sigRaw.trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(sig)) {
    return null
  }
  return { exp, sig }
}

export function verifyReleaseDownloadSignature(
  event: H3Event,
  input: {
    tag: string
    platform: string
    arch: string
    signature: ReleaseDownloadQuerySignature
  }
): { valid: boolean; reason?: 'missing-secret' | 'expired' | 'mismatch' } {
  const config = resolveConfig(event)
  if (!config.secret) {
    return { valid: false, reason: 'missing-secret' }
  }

  const now = Math.floor(Date.now() / 1000)
  if (input.signature.exp < now) {
    return { valid: false, reason: 'expired' }
  }

  const expected = signPayload(
    config.secret,
    buildPayload({
      tag: input.tag,
      platform: input.platform,
      arch: input.arch,
      exp: input.signature.exp
    })
  )

  const actualBuffer = Buffer.from(input.signature.sig, 'utf8')
  const expectedBuffer = Buffer.from(expected, 'utf8')
  if (actualBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'mismatch' }
  }
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) {
    return { valid: false, reason: 'mismatch' }
  }

  return { valid: true }
}

export function isUnsignedFallbackAllowed(event: H3Event): boolean {
  return resolveConfig(event).allowUnsignedFallback
}
