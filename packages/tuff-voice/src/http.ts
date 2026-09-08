import type { VoiceHttpClient, VoiceHttpResponse } from './contracts'
import { VoiceProviderError } from './contracts'

export function createFetchHttpClient(fetchImpl: typeof fetch = fetch): VoiceHttpClient {
  return {
    async request(request) {
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body as BodyInit | undefined,
        signal: request.signal,
      })
      const body = await readResponseBody(response)
      const headers: Record<string, string | undefined> = {}
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
      })
      return { status: response.status, headers, body }
    },
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return await response.json()
  }
  const text = await response.text()
  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

export function assertHttpSuccess(response: VoiceHttpResponse, provider: string): unknown {
  if (response.status < 200 || response.status >= 300) {
    throw new VoiceProviderError(
      `${provider.toUpperCase()}_HTTP_${response.status}`,
      `${provider} voice request failed with HTTP ${response.status}.`,
      { retryable: response.status >= 500 },
    )
  }
  return response.body
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function assertProviderOptionUrl(value: string, name: string): string {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new VoiceProviderError('VOICE_PROVIDER_URL_INVALID', `${name} is invalid.`)
  }
  if (url.protocol !== 'https:') {
    throw new VoiceProviderError('VOICE_PROVIDER_URL_INVALID', `${name} must use HTTPS.`)
  }
  return url.toString()
}
