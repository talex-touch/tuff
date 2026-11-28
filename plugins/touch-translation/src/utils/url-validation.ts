const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const SAFE_AUDIO_DATA_URI_RE = /^data:audio\/[a-z0-9.+-]+(?:;[a-z0-9.=+-]+)*,/i

export interface ProviderUrlValidationResult {
  valid: boolean
  normalized?: string
  error?: string
}

/**
 * Validates a translation provider API endpoint URL.
 * External endpoints must use HTTPS so API keys are never transmitted in cleartext;
 * plaintext HTTP is permitted strictly for explicit local loopback endpoints.
 */
export function validateProviderApiUrl(rawUrl: string | undefined | null): ProviderUrlValidationResult {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!trimmed) {
    return { valid: false, error: 'API URL 不能为空' }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  }
  catch {
    return { valid: false, error: 'API URL 格式无效' }
  }

  if (parsed.protocol === 'https:') {
    return { valid: true, normalized: parsed.toString() }
  }

  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { valid: true, normalized: parsed.toString() }
  }

  return {
    valid: false,
    error: '外部翻译接口必须使用 HTTPS 协议（仅 localhost/127.0.0.1 允许 HTTP）',
  }
}

/**
 * Validates an audio playback URL before passing it to `new Audio(...)`.
 * Allows only HTTPS URLs, blob URLs, and explicit `data:audio/...` URIs.
 */
export function isSafeAudioUrl(rawUrl: string | undefined | null): boolean {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!trimmed) {
    return false
  }
  if (SAFE_AUDIO_DATA_URI_RE.test(trimmed)) {
    return true
  }
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:' || parsed.protocol === 'blob:'
  }
  catch {
    return false
  }
}
