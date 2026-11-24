import { usePluginNetwork } from '@talex-touch/utils/plugin/sdk'

const DEFAULT_API_BASE_URL = 'https://netease-cloud-music-api-umber-theta.vercel.app/'
const DEFAULT_TIMEOUT_MS = 60_000

let cachedClient = null

function getPluginNetwork() {
  if (!cachedClient) {
    try {
      cachedClient = usePluginNetwork()
    }
    catch (error) {
      const unavailable = new Error(
        error instanceof Error && error.message
          ? error.message
          : 'Plugin network SDK unavailable (network.internet permission required)',
      )
      unavailable.code = 'NETWORK_INTERNET_PERMISSION_UNAVAILABLE'
      throw unavailable
    }
  }
  return cachedClient
}

export function resetPluginNetworkClient() {
  cachedClient = null
}

export function buildRequestUrl(pathOrUrl, params) {
  const base = DEFAULT_API_BASE_URL.endsWith('/') ? DEFAULT_API_BASE_URL : `${DEFAULT_API_BASE_URL}/`
  const resolved = typeof pathOrUrl === 'string' && /^https?:\/\//i.test(pathOrUrl)
    ? pathOrUrl
    : new URL(String(pathOrUrl ?? '').replace(/^\/+/, ''), base).toString()

  const url = new URL(resolved)
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

function isNetworkResponse(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && 'status' in value
    && 'data' in value
    && 'ok' in value,
  )
}

async function sendRequest(method, url, config = {}) {
  const client = getPluginNetwork()
  const fullUrl = buildRequestUrl(url, config.params)

  const response = await client.request({
    method,
    url: fullUrl,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    },
    body: config.data,
    timeoutMs: config.timeout ?? DEFAULT_TIMEOUT_MS,
    responseType: config.responseType ?? 'json',
  })

  if (isNetworkResponse(response)) {
    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}`)
      error.status = response.status
      error.response = response
      throw error
    }
    return response.data
  }

  return response
}

export const axios = {
  request: (config = {}) => sendRequest(config.method || 'GET', config.url || '', config),
  get: (url, config = {}) => sendRequest('GET', url, config),
  post: (url, data, config = {}) => sendRequest('POST', url, { ...config, data }),
  put: (url, data, config = {}) => sendRequest('PUT', url, { ...config, data }),
  delete: (url, config = {}) => sendRequest('DELETE', url, config),
}
