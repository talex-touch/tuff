import type { MarketHttpRequestOptions, MarketHttpResponse } from '@talex-touch/utils/market'
import { getAuthBaseUrl } from '../auth/auth-env'
import { getAuthToken, handleUnauthorized } from './auth-token-service'

export async function fetchNexusWithAuth(
  path: string,
  init: RequestInit = {},
  context: string = path
): Promise<Response | null> {
  const token = await getAuthToken()
  if (!token) {
    return null
  }

  const url = new URL(path, getAuthBaseUrl()).toString()
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, {
    ...init,
    headers
  })

  if (response.status === 401) {
    await handleUnauthorized(context)
  }

  return response
}

export async function requestNexusWithAuth<T>(
  request: (options: MarketHttpRequestOptions) => Promise<MarketHttpResponse<T>>,
  options: MarketHttpRequestOptions,
  context: string = options.url
): Promise<MarketHttpResponse<T> | null> {
  const token = await getAuthToken()
  if (!token) {
    return null
  }

  const headers = {
    ...(options.headers ?? {}),
    Authorization: `Bearer ${token}`
  }

  const response = await request({
    ...options,
    headers
  })

  if (response.status === 401) {
    await handleUnauthorized(context)
  }

  return response
}
