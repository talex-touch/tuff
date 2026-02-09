import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { resolveRequestIp } from './ipSecurityStore'

type TurnstileAction = 'login' | 'signup'

interface TurnstileSiteverifyResponse {
  success: boolean
  action?: string
  hostname?: string
  challenge_ts?: string
  cdata?: string
  'error-codes'?: string[]
}

function resolveTurnstileSecret(event: H3Event) {
  const config = useRuntimeConfig(event)
  const secret = config.turnstile?.secretKey
  return typeof secret === 'string' ? secret.trim() : ''
}

export async function verifyTurnstileToken(event: H3Event, options: { token: unknown, action: TurnstileAction }) {
  const token = typeof options.token === 'string' ? options.token.trim() : ''
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Turnstile token required.' })
  }

  const secretKey = resolveTurnstileSecret(event)
  if (!secretKey) {
    throw createError({ statusCode: 500, statusMessage: 'Turnstile is not configured.' })
  }

  const payload = new URLSearchParams()
  payload.set('secret', secretKey)
  payload.set('response', token)

  const ip = resolveRequestIp(event)
  if (ip)
    payload.set('remoteip', ip)

  let verification: TurnstileSiteverifyResponse | null = null

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    })

    if (!response.ok) {
      throw createError({ statusCode: 502, statusMessage: 'Turnstile verify request failed.' })
    }

    verification = await response.json() as TurnstileSiteverifyResponse
  }
  catch (error: any) {
    if (error?.statusCode)
      throw error
    throw createError({ statusCode: 502, statusMessage: 'Turnstile verify request failed.' })
  }

  if (!verification?.success) {
    throw createError({ statusCode: 400, statusMessage: 'Turnstile verification failed.' })
  }

  if (verification.action && verification.action !== options.action) {
    throw createError({ statusCode: 400, statusMessage: 'Turnstile action mismatch.' })
  }
}
