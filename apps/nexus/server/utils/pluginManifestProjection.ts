export interface PublicPluginManifestMeta {
  id?: string
  name?: string
  sdkapi?: number
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

/**
 * Compact store responses expose only public identity and SDK compatibility metadata.
 * Permissions and package internals remain available from the full detail endpoint.
 */
export function projectPublicPluginManifest(manifest: unknown): PublicPluginManifestMeta | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null

  const record = manifest as Record<string, unknown>
  const id = readTrimmedString(record.id)
  const name = readTrimmedString(record.name)
  const sdkapi =
    typeof record.sdkapi === 'number' && Number.isSafeInteger(record.sdkapi)
      ? record.sdkapi
      : undefined

  if (!id && !name && sdkapi === undefined) return null
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(sdkapi !== undefined ? { sdkapi } : {})
  }
}
