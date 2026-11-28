export class ApiError extends Error {
  readonly status: number
  readonly statusMessage: string
  readonly data: unknown

  constructor(status: number, statusMessage: string, data?: unknown) {
    super(statusMessage || `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.statusMessage = statusMessage || `HTTP ${status}`
    this.data = data
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

export function buildQueryString(
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  if (!query)
    return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '')
      continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

export function assertSameOriginApiPath(path: string): string {
  if (!path.startsWith('/api/'))
    throw new Error(`Console API client only permits same-origin /api/* paths, got: ${path}`)
  return path
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const safePath = assertSameOriginApiPath(path)
  const url = `${safePath}${buildQueryString(options.query)}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  }

  let body: BodyInit | undefined
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body
    }
    else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body)
    }
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body,
    signal: options.signal,
  })

  if (response.status === 204)
    return undefined as T

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.toLowerCase().includes('application/json')
  const payload = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '')

  if (!response.ok) {
    const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null
    const message = (
      (typeof record?.statusMessage === 'string' && record.statusMessage)
      || (typeof record?.message === 'string' && record.message)
      || (typeof record?.error === 'string' && record.error)
      || (typeof payload === 'string' && payload.trim())
      || response.statusText
      || `HTTP ${response.status}`
    )
    throw new ApiError(response.status, message, payload)
  }

  return payload as T
}

export function apiGet<T>(
  path: string,
  query?: ApiRequestOptions['query'],
  headers?: Record<string, string>,
): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', query, headers })
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body, headers })
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body, headers })
}

export function apiPut<T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body, headers })
}

export function apiDelete<T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE', body, headers })
}

export function resolveErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError)
    return cause.statusMessage || fallback
  if (cause instanceof Error && cause.message && !cause.message.startsWith('['))
    return cause.message
  return fallback
}
