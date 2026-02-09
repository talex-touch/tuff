/**
 * Build a properly encoded tfile:// URL from an absolute file path.
 *
 * File paths may contain non-ASCII characters (e.g. Chinese), spaces, or other
 * special characters that must be percent-encoded for the browser's `fetch` API
 * and `<img src>` attributes to work correctly with the custom protocol handler.
 */
export function buildTfileUrl(filePath: string): string {
  const raw = filePath?.trim()
  if (!raw) return ''

  const decodeStable = (value: string): string => {
    let decoded = value
    for (let i = 0; i < 3; i++) {
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

  const normalizeAbsolutePath = (value: string): string => {
    const normalized = value.replace(/\\/g, '/')
    if (/^\/[a-z]:\//i.test(normalized)) {
      return normalized.slice(1)
    }
    if (/^[a-z]:\//i.test(normalized)) {
      return normalized
    }
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  const resolveInputPath = (): string => {
    if (raw.startsWith('tfile:')) {
      try {
        const parsed = new URL(raw)
        if (
          parsed.hostname &&
          /^[a-z]$/i.test(parsed.hostname) &&
          parsed.pathname.startsWith('/')
        ) {
          return decodeStable(`${parsed.hostname}:${parsed.pathname}`)
        }
        const merged = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname
        return decodeStable(merged)
      } catch {
        const fallback = raw.replace(/^tfile:\/\//i, '').split(/[?#]/)[0] ?? ''
        return decodeStable(fallback)
      }
    }

    if (raw.startsWith('file:')) {
      try {
        return decodeStable(new URL(raw).pathname)
      } catch {
        return raw
      }
    }

    return raw
  }

  const absolutePath = normalizeAbsolutePath(resolveInputPath())
  const encoded = absolutePath
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
