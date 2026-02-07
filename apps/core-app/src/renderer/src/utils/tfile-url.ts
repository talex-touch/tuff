/**
 * Build a properly encoded tfile:// URL from an absolute file path.
 *
 * File paths may contain non-ASCII characters (e.g. Chinese), spaces, or other
 * special characters that must be percent-encoded for the browser's `fetch` API
 * and `<img src>` attributes to work correctly with the custom protocol handler.
 */
export function buildTfileUrl(filePath: string): string {
  if (!filePath) return ''

  // Split the path into segments, encode each segment individually,
  // then rejoin with '/' so that path separators are preserved verbatim.
  const encoded = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `tfile://${encoded}`
}
