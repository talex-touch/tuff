import { isLocalhostUrl } from '../common/utils'

const WINDOWS_PATH_RE = /^[a-z]:[\\/]/i

function decodeStable(value: string): string {
  let decoded = value
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      break
    }
  }
  return decoded
}

function normalizeAbsolutePath(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  if (/^\/[a-z]:\//i.test(normalized)) {
    return normalized.slice(1)
  }
  if (WINDOWS_PATH_RE.test(normalized)) {
    return normalized
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function stripQueryAndHash(value: string): string {
  const index = value.search(/[?#]/)
  return index >= 0 ? value.slice(0, index) : value
}

export function isHttpSource(source: string): boolean {
  try {
    const parsed = new URL(source)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function isLocalHttpSource(source: string): boolean {
  if (!isHttpSource(source)) return false
  try {
    return isLocalhostUrl(source)
  } catch {
    return false
  }
}

export function isAbsoluteLocalPath(source: string): boolean {
  return source.startsWith('/') || source.startsWith('\\\\') || WINDOWS_PATH_RE.test(source)
}

export function resolveLocalFilePath(source: string): string | null {
  const raw = typeof source === 'string' ? source.trim() : ''
  if (!raw) return null

  if (raw.startsWith('file:')) {
    try {
      return normalizeAbsolutePath(decodeStable(new URL(raw).pathname))
    } catch {
      return null
    }
  }

  if (raw.startsWith('tfile:')) {
    try {
      const parsed = new URL(raw)
      if (parsed.hostname && /^[a-z]$/i.test(parsed.hostname) && parsed.pathname.startsWith('/')) {
        return normalizeAbsolutePath(decodeStable(`${parsed.hostname}:${parsed.pathname}`))
      }
      const host = parsed.hostname || ''
      const pathname = parsed.pathname || ''
      const merged = host ? `/${host}${pathname}` : pathname
      return normalizeAbsolutePath(decodeStable(merged))
    } catch {
      const body = stripQueryAndHash(raw.replace(/^tfile:\/\//i, ''))
      return normalizeAbsolutePath(decodeStable(body.startsWith('/') ? body : `/${body}`))
    }
  }

  if (isAbsoluteLocalPath(raw)) {
    return normalizeAbsolutePath(raw)
  }

  return null
}

export function toTfileUrl(pathOrUrl: string): string {
  const raw = typeof pathOrUrl === 'string' ? pathOrUrl.trim() : ''
  if (!raw) return ''

  const localPath = resolveLocalFilePath(raw)
  if (!localPath) {
    return raw
  }

  const encoded = localPath
    .split('/')
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment))
      } catch {
        return encodeURIComponent(segment)
      }
    })
    .join('/')

  return `tfile://${encoded}`
}
