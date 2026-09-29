/** Convert an Electron asar module path into the real executable/resource path on disk. */
export function normalizeAsarUnpackedPath(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !candidate.trim()) return null
  const value = candidate.trim()
  if (value.includes('app.asar.unpacked')) return value
  if (!value.includes('app.asar')) return value
  return value.replace('app.asar', 'app.asar.unpacked')
}
