export const PLUGIN_SYNC_QUALIFIED_PREFIX = 'plugin::'
export const PLUGIN_SYNC_ALL_SCOPE = `${PLUGIN_SYNC_QUALIFIED_PREFIX}__all__`

export function isPluginStorageQualifiedName(value: string): boolean {
  return value.startsWith(PLUGIN_SYNC_QUALIFIED_PREFIX)
}

export function buildPluginStorageQualifiedName(pluginName: string, fileName?: string): string {
  const normalizedPluginName = pluginName.trim()
  const normalizedFileName = typeof fileName === 'string' ? fileName.trim() : ''
  if (!normalizedPluginName) {
    return ''
  }
  return normalizedFileName
    ? `${PLUGIN_SYNC_QUALIFIED_PREFIX}${normalizedPluginName}::${normalizedFileName}`
    : `${PLUGIN_SYNC_QUALIFIED_PREFIX}${normalizedPluginName}::`
}

export function parsePluginStorageQualifiedName(
  qualifiedName: string
): { pluginName: string; fileName?: string } | null {
  const normalized = qualifiedName.trim()
  if (!isPluginStorageQualifiedName(normalized) || normalized === PLUGIN_SYNC_ALL_SCOPE) {
    return null
  }

  const body = normalized.slice(PLUGIN_SYNC_QUALIFIED_PREFIX.length)
  const separatorIndex = body.indexOf('::')
  if (separatorIndex < 0) {
    return null
  }

  const pluginName = body.slice(0, separatorIndex).trim()
  const fileName = body.slice(separatorIndex + 2).trim()
  if (!pluginName) {
    return null
  }

  return {
    pluginName,
    fileName: fileName || undefined
  }
}
