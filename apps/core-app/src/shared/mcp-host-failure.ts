/**
 * Why the local MCP server could not do what it was asked, and how that reads.
 *
 * Main reports a failure it recognises as one of these codes - thrown from a command, with a detail
 * for the log after a colon, or kept as the state's `lastError` when the listener would not start -
 * and a failure the system reports as the system's own text. The settings page words both from here.
 */

type McpHostFailureTranslate = (key: string, params?: Record<string, unknown>) => string

export const McpHostFailureCode = {
  SecureStoreUnavailable: 'MCP_HOST_SECURE_STORE_UNAVAILABLE',
  TokenNotStored: 'MCP_HOST_TOKEN_NOT_STORED',
  SettingsNotSaved: 'MCP_HOST_SETTINGS_NOT_SAVED',
  UnknownTool: 'MCP_HOST_UNKNOWN_TOOL',
  PortInUse: 'MCP_HOST_PORT_IN_USE',
  PortNotPermitted: 'MCP_HOST_PORT_NOT_PERMITTED'
} as const

const FAILURE_KEYS: Record<string, string> = {
  [McpHostFailureCode.SecureStoreUnavailable]: 'secureStoreUnavailable',
  [McpHostFailureCode.TokenNotStored]: 'tokenNotStored',
  [McpHostFailureCode.SettingsNotSaved]: 'settingsNotSaved',
  [McpHostFailureCode.UnknownTool]: 'unknownTool',
  [McpHostFailureCode.PortInUse]: 'portInUse',
  [McpHostFailureCode.PortNotPermitted]: 'portNotPermitted'
}

// A start that failed when the switch could not be put back on disk either, so the next launch
// tries the same start again.
const UNSAVED_SUFFIX = `\n${McpHostFailureCode.SettingsNotSaved}`

/** Why the listener did not bind, from the error `listen` gave: a code main knows, or its text. */
export function mcpHostListenFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'EADDRINUSE') return McpHostFailureCode.PortInUse
  if (code === 'EACCES') return McpHostFailureCode.PortNotPermitted
  return error instanceof Error ? error.message : String(error)
}

/** A start failure whose switch-off could not be saved: the next launch tries the start again. */
export function mcpHostUnsavedStartFailure(failure: string): string {
  return `${failure}${UNSAVED_SUFFIX}`
}

function failureKey(failure: string): string | undefined {
  const code = failure.trim().split(':', 1)[0]!
  return Object.hasOwn(FAILURE_KEYS, code) ? FAILURE_KEYS[code] : undefined
}

/** Whether `failure` is one of the codes above, rather than the system's own text. */
export function isMcpHostFailureCode(failure: string): boolean {
  return failureKey(failure) !== undefined
}

/** A failure in the interface language; the system's own text is returned as it is. */
export function describeMcpHostFailure(failure: string, t: McpHostFailureTranslate): string {
  const unsaved = failure.endsWith(UNSAVED_SUFFIX)
  const reason = (unsaved ? failure.slice(0, -UNSAVED_SUFFIX.length) : failure).trim()
  const key = failureKey(reason)
  const words = key ? t(`settings.skillsMcp.host.failures.${key}`) : reason
  return unsaved ? t('settings.skillsMcp.host.failures.startNotSaved', { reason: words }) : words
}
