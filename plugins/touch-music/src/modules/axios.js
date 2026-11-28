import { usePluginNetwork } from '@talex-touch/utils/plugin/sdk'

const STORAGE_KEY_API_BASE_URL = 'touch-music.api-base-url'
const DEFAULT_TIMEOUT_MS = 60_000
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

let cachedClient = null
let configuredApiBaseUrl = ''

export function normalizeMusicApiBaseUrl(rawUrl) {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!trimmed) {
    return ''
  }
  let parsed
  try {
    parsed = new URL(trimmed)
  }
  catch {
    const invalid = new Error(`Invalid Touch Music API base URL: ${trimmed}`)
    invalid.code = 'MUSIC_API_BASE_URL_INVALID'
    throw invalid
  }
  const isHttps = parsed.protocol === 'https:'
  const isLocalHttp = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())
  if (!isHttps && !isLocalHttp) {
    const insecure = new Error('Touch Music API base URL must use https:// (or http:// on localhost)')
    insecure.code = 'MUSIC_API_BASE_URL_INSECURE'
    throw insecure
  }
  return parsed.toString().endsWith('/') ? parsed.toString() : `${parsed.toString()}/`
}

export function setMusicApiBaseUrl(rawUrl) {
  configuredApiBaseUrl = rawUrl ? normalizeMusicApiBaseUrl(rawUrl) : ''
  try {
    if (typeof localStorage !== 'undefined') {
      if (configuredApiBaseUrl) {
        localStorage.setItem(STORAGE_KEY_API_BASE_URL, configuredApiBaseUrl)
      }
      else {
        localStorage.removeItem(STORAGE_KEY_API_BASE_URL)
      }
    }
  }
  catch {
    // Storage may be unavailable in tests or restricted contexts.
  }
  return configuredApiBaseUrl
}

export function getMusicApiBaseUrl() {
  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl
  }
  const globalOverride = typeof globalThis !== 'undefined' && typeof globalThis.__TOUCH_MUSIC_API_BASE_URL__ === 'string'
    ? globalThis.__TOUCH_MUSIC_API_BASE_URL__
    : ''
  if (globalOverride.trim()) {
    return normalizeMusicApiBaseUrl(globalOverride)
  }
  const envBase = typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.VITE_TOUCH_MUSIC_API_BASE_URL === 'string'
    ? import.meta.env.VITE_TOUCH_MUSIC_API_BASE_URL
    : ''
  if (envBase.trim()) {
    return normalizeMusicApiBaseUrl(envBase)
  }
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY_API_BASE_URL) : ''
    if (stored && stored.trim()) {
      return normalizeMusicApiBaseUrl(stored)
    }
  }
  catch {
    // Ignore storage read errors.
  }
  return ''
}

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

export function buildRequestUrl(pathOrUrl, params, explicitBaseUrl) {
  let resolved
  if (typeof pathOrUrl === 'string' && /^https?:\/\//i.test(pathOrUrl)) {
    resolved = pathOrUrl
  }
  else {
    const base = explicitBaseUrl ? normalizeMusicApiBaseUrl(explicitBaseUrl) : getMusicApiBaseUrl()
    if (!base) {
      const missing = new Error(
        'Touch Music API base URL is not configured. Configure VITE_TOUCH_MUSIC_API_BASE_URL or call setMusicApiBaseUrl(url).',
      )
      missing.code = 'MUSIC_API_BASE_URL_NOT_CONFIGURED'
      throw missing
    }
    resolved = new URL(String(pathOrUrl ?? '').replace(/^\/+/, ''), base).toString()
  }

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
