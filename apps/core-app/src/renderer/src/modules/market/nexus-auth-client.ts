import type { MarketHttpRequestOptions, MarketHttpResponse } from '@talex-touch/utils/market'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useTuffTransport } from '@talex-touch/utils/transport'

type NexusRequestPayload = {
  url?: string
  path?: string
  method?: string
  headers?: Record<string, string>
  body?: string
  context?: string
}

type NexusResponsePayload = {
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  body: string
}

const authNexusRequestEvent = defineRawEvent<NexusRequestPayload, NexusResponsePayload | null>(
  'auth:nexus-request'
)

export interface NexusAuthResponse {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  json: <T = unknown>() => Promise<T>
  text: () => Promise<string>
}

function createResponse(payload: NexusResponsePayload): NexusAuthResponse {
  return {
    ok: payload.status >= 200 && payload.status < 300,
    status: payload.status,
    statusText: payload.statusText,
    headers: payload.headers,
    url: payload.url,
    json: async <T = unknown>() => {
      if (!payload.body) {
        return undefined as T
      }
      return JSON.parse(payload.body) as T
    },
    text: async () => payload.body ?? ''
  }
}

export async function fetchNexusWithAuth(
  path: string,
  init: RequestInit = {},
  context: string = path
): Promise<NexusAuthResponse | null> {
  const transport = useTuffTransport()
  const headers = new Headers(init.headers || {})
  const payload: NexusRequestPayload = {
    path,
    method: typeof init.method === 'string' ? init.method : 'GET',
    headers: Object.fromEntries(headers.entries()),
    body: typeof init.body === 'string' ? init.body : undefined,
    context
  }
  const response = await transport.send(authNexusRequestEvent, payload)
  if (!response) {
    return null
  }
  return createResponse(response)
}

function withQueryParams(url: string, params?: Record<string, unknown>): string {
  if (!params) return url
  const parsed = new URL(url)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    parsed.searchParams.set(key, String(value))
  }
  return parsed.toString()
}

export async function requestNexusWithAuth<T>(
  _request: (options: MarketHttpRequestOptions) => Promise<MarketHttpResponse<T>>,
  options: MarketHttpRequestOptions,
  context: string = options.url
): Promise<MarketHttpResponse<T> | null> {
  const transport = useTuffTransport()
  const headers = options.headers ? { ...options.headers } : {}
  const url = withQueryParams(options.url, options.params as Record<string, unknown> | undefined)
  let body: string | undefined
  if (typeof options.data === 'string') {
    body = options.data
  } else if (options.data && typeof options.data === 'object') {
    body = JSON.stringify(options.data)
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }
  }

  const response = await transport.send(authNexusRequestEvent, {
    url,
    method: options.method,
    headers,
    body,
    context
  })
  if (!response) {
    return null
  }

  let data: T
  try {
    data = response.body ? (JSON.parse(response.body) as T) : (undefined as T)
  } catch {
    data = response.body as T
  }

  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    data,
    url: response.url
  }
}
