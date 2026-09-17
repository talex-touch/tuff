/**
 * What the MCP host remembers across launches.
 *
 * Everything here tolerates a hand-edited or older file: this is a settings
 * document, and a malformed field should cost the user that field, not the
 * feature. The one field that is *not* repaired is the token — a partially
 * readable credential is worse than none, so it is dropped and minted again.
 */

/**
 * Bound when the user has not chosen one. High enough to stay out of the way of
 * ordinary services, and fixed rather than ephemeral because the endpoint has to
 * be *pasteable*: a client config that changes every launch is not a config.
 */
export const MCP_HOST_DEFAULT_PORT = 43110

export interface McpHostSettings {
  enabled: boolean
  port: number
  /** Empty until the user enables the server for the first time. */
  token: string
  /** Per-tool overrides; a missing key means the tool spec's own default. */
  tools: Record<string, boolean>
}

export const DEFAULT_MCP_HOST_SETTINGS: McpHostSettings = {
  enabled: false,
  port: MCP_HOST_DEFAULT_PORT,
  token: '',
  tools: {}
}

/** Below 1024 needs privileges on macOS; above 65535 is not a port. */
export const MIN_MCP_HOST_PORT = 1024
export const MAX_MCP_HOST_PORT = 65535

/**
 * 32 random bytes as hex — the same shape the tool gateway mints.
 *
 * Case-insensitive on read: this file is editable, and a token the user retyped
 * in uppercase is the same credential. Rejecting it would silently mint a new
 * one and invalidate whatever they had already pasted into their client.
 */
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i

export function resolveMcpHostPort(value: unknown): number {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(candidate) &&
    candidate >= MIN_MCP_HOST_PORT &&
    candidate <= MAX_MCP_HOST_PORT
    ? candidate
    : MCP_HOST_DEFAULT_PORT
}

function normalizeToolOverrides(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const overrides: Record<string, boolean> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue
    if (typeof entry === 'boolean') overrides[key] = entry
  }
  return overrides
}

export function normalizeMcpHostSettings(value: unknown): McpHostSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_MCP_HOST_SETTINGS }
  }
  const record = value as Record<string, unknown>
  const token =
    typeof record.token === 'string' && TOKEN_PATTERN.test(record.token) ? record.token : ''
  return {
    enabled: record.enabled === true,
    port: resolveMcpHostPort(record.port),
    token,
    tools: normalizeToolOverrides(record.tools)
  }
}
