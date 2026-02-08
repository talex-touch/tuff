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

  if (raw.startsWith('tfile://')) {
    return raw
  }

  let normalized = raw.replace(/\\/g, '/')
  if (/^[a-z]:\//i.test(normalized)) {
    // Keep Windows drive path without leading slash to avoid turning into /C:/...
  } else if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  // Split the path into segments, encode each segment individually,
  // then rejoin with '/' so that path separators are preserved verbatim.
  const encoded = normalized
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
