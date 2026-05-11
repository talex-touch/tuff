import { hasWindow } from '@talex-touch/utils/env'
import { sanitizeRedirect } from '~/composables/useOauthContext'

const OAUTH_REDIRECT_NOISE_KEYS = [
  'callbackUrl',
  'callback_url',
  'oauth',
  'oauth_relay',
  'flow',
  'provider',
  'error',
  'error_description',
]

export function pickFirstQueryValue(input: unknown) {
  if (!input)
    return null
  if (Array.isArray(input))
    return typeof input[0] === 'string' ? input[0] : null
  return typeof input === 'string' ? input : null
}

function parseUrlLike(value: string) {
  try {
    const base = hasWindow() ? window.location.origin : 'http://localhost'
    return value.startsWith('/') ? new URL(value, base) : new URL(value)
  }
  catch {
    return null
  }
}

export function sanitizeOauthRedirectTarget(redirect: string | null | undefined, fallback: string) {
  const normalized = sanitizeRedirect(redirect, fallback)
  if (normalized !== '/')
    return normalized
  if (!redirect)
    return normalized

  const parsed = parseUrlLike(redirect)
  if (!parsed)
    return normalized

  const hasAuthNoise = OAUTH_REDIRECT_NOISE_KEYS.some(key => parsed.searchParams.has(key))
  if (!hasAuthNoise)
    return normalized

  return fallback
}
