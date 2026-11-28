import type { H3Event } from 'h3'
import { createError } from 'h3'
import { networkClient } from '@talex-touch/utils/network'
import { useRuntimeConfig } from 'nitropack/runtime'
import { readCloudflareBindings } from './cloudflare'

export interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
  action?: string
  resourceType?: string
  resourceId?: string
}

const ALL_HTTP_STATUS = Array.from({ length: 500 }, (_, index) => index + 100)

/**
 * Slim transactional email sender via Resend HTTP API (configured via RESEND_API_KEY + AUTH_EMAIL_FROM).
 * No governance channel registry or encrypted channel credential store required.
 */
export async function sendEmail(payload: EmailPayload, event?: H3Event): Promise<void> {
  const bindings = event ? readCloudflareBindings(event) : undefined
  const config = useRuntimeConfig(event) as {
    auth?: { email?: { from?: string, resendApiKey?: string, resendApiUrl?: string } }
  }

  const from = (bindings?.AUTH_EMAIL_FROM || config.auth?.email?.from || '').trim()
  const apiKey = (bindings?.RESEND_API_KEY || config.auth?.email?.resendApiKey || '').trim()
  const apiUrl = (bindings?.RESEND_API_URL || config.auth?.email?.resendApiUrl || 'https://api.resend.com/emails').trim()

  if (!from || !apiKey) {
    throw createError({ statusCode: 503, statusMessage: 'Email delivery is unavailable.' })
  }

  const text = payload.text ?? payload.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const response = await networkClient.request<Record<string, unknown>>({
    method: 'POST',
    url: apiUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: {
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text,
    },
    timeoutMs: 10000,
    validateStatus: ALL_HTTP_STATUS,
  })

  if (response.status < 200 || response.status >= 300) {
    throw createError({ statusCode: 503, statusMessage: 'Email delivery failed.' })
  }
}
