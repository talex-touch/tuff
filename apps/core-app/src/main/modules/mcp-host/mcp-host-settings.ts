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
  /** Per-tool overrides; a missing key means the tool spec's own default. */
  tools: Record<string, boolean>
}

/**
 * The credential is *not* here. `apps/core-app/AGENTS.md` forbids writing tokens
 * to ordinary JSON, so the bearer token lives in the secure store under
 * `MCP_HOST_TOKEN_REF` and this document only says whether the listener is on.
 */
export const DEFAULT_MCP_HOST_SETTINGS: McpHostSettings = {
  enabled: false,
  port: MCP_HOST_DEFAULT_PORT,
  tools: {}
}

/** Below 1024 needs privileges on macOS; above 65535 is not a port. */
export const MIN_MCP_HOST_PORT = 1024
export const MAX_MCP_HOST_PORT = 65535

export function resolveMcpHostPort(value: unknown): number {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(candidate) &&
    candidate >= MIN_MCP_HOST_PORT &&
    candidate <= MAX_MCP_HOST_PORT
    ? candidate
    : MCP_HOST_DEFAULT_PORT
}

export function normalizeMcpHostSettings(value: unknown): McpHostSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_MCP_HOST_SETTINGS }
  }
  const record = value as Record<string, unknown>
  return {
    enabled: record.enabled === true,
    port: resolveMcpHostPort(record.port),
    tools: normalizeToolOverrides(record.tools)
  }
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
