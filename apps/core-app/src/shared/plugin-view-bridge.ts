export const PLUGIN_VIEW_BOOTSTRAP_ARGUMENT = '--tuff-plugin-view-bootstrap='
const MAX_BOOTSTRAP_ARGUMENT_LENGTH = 32 * 1024

export interface PluginViewMetadata {
  name: string
  version?: string
  sdkapi?: number
}

export interface PluginViewConfigSnapshot {
  themeStyle: unknown
}

export interface PluginViewBootstrap {
  channelKey: string
  plugin: PluginViewMetadata
  config: PluginViewConfigSnapshot
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneSerializable<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    throw new Error('Plugin view bootstrap must be JSON-serializable.')
  }
}

function normalizeBootstrap(value: unknown): PluginViewBootstrap {
  if (!isRecord(value) || !isRecord(value.plugin) || !isRecord(value.config)) {
    throw new Error('Plugin view bootstrap is invalid.')
  }

  const channelKey = typeof value.channelKey === 'string' ? value.channelKey.trim() : ''
  const name = typeof value.plugin.name === 'string' ? value.plugin.name.trim() : ''
  if (!channelKey || channelKey.length > 256 || !name || name.length > 128) {
    throw new Error('Plugin view bootstrap identity is invalid.')
  }

  const version = value.plugin.version
  if (version !== undefined && (typeof version !== 'string' || version.length > 128)) {
    throw new Error('Plugin view bootstrap version is invalid.')
  }

  const sdkapi = value.plugin.sdkapi
  if (sdkapi !== undefined && (!Number.isInteger(sdkapi) || (sdkapi as number) <= 0)) {
    throw new Error('Plugin view bootstrap sdkapi is invalid.')
  }

  return cloneSerializable({
    channelKey,
    plugin: {
      name,
      ...(typeof version === 'string' ? { version } : {}),
      ...(typeof sdkapi === 'number' ? { sdkapi } : {})
    },
    config: {
      themeStyle: value.config.themeStyle ?? {}
    }
  })
}

export function buildPluginViewBootstrapArgument(bootstrap: PluginViewBootstrap): string {
  const normalized = normalizeBootstrap(bootstrap)
  const encoded = encodeURIComponent(JSON.stringify(normalized))
  const argument = `${PLUGIN_VIEW_BOOTSTRAP_ARGUMENT}${encoded}`
  if (argument.length > MAX_BOOTSTRAP_ARGUMENT_LENGTH) {
    throw new Error('Plugin view bootstrap is too large.')
  }
  return argument
}

export function parsePluginViewBootstrapArgument(argv: readonly string[]): PluginViewBootstrap {
  const argument = argv.find((item) => item.startsWith(PLUGIN_VIEW_BOOTSTRAP_ARGUMENT))
  if (!argument || argument.length > MAX_BOOTSTRAP_ARGUMENT_LENGTH) {
    throw new Error('Plugin view bootstrap argument is missing or invalid.')
  }

  const encoded = argument.slice(PLUGIN_VIEW_BOOTSTRAP_ARGUMENT.length)
  if (!encoded) {
    throw new Error('Plugin view bootstrap payload is missing.')
  }

  try {
    const decoded = decodeURIComponent(encoded)
    return normalizeBootstrap(JSON.parse(decoded))
  } catch {
    throw new Error('Plugin view bootstrap payload is invalid.')
  }
}
