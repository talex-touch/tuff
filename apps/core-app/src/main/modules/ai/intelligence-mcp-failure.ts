/**
 * Why an MCP call failed, in a form a caller can branch on (#971).
 *
 * `intelligence-mcp-registry` already knows the difference — it keeps a `closed` flag per session
 * and refuses a dead transport at three separate points — but every one of those throws a plain
 * `Error` whose only distinguishing feature is its message. So a tool-call failure reaches the
 * confirmation card and the result card with no way to tell "the server went away" from "the tool
 * itself returned an error", which is the distinction that issue asks for.
 *
 * Attached rather than subclassed, matching how the repo already carries codes on errors -- e.g.
 * `Object.assign(new Error('quota'), { storageCode: … })` in plugin-sqlite-worker.
 *
 * Not because a subclass would lose the field: an own field on a subclass instance is copied by
 * a spread just the same, and a plant proved the test cannot tell the two apart. What a subclass
 * loses across the transport hop is `instanceof`, and nothing here relies on it:
 * `readMcpFailureReason` reads the property, so it works on the error, on a spread of it, and on
 * whatever reaches the renderer. The reason to prefer `Object.assign` is that it needs no class.
 */

export const MCP_FAILURE_REASONS = [
  /** The profile is gone, the session is closed, or it closed while connecting. */
  'server-unavailable',
  /** The server answered and the tool reported an error. Not a transport problem. */
  'tool-failed'
] as const

export type McpFailureReason = (typeof MCP_FAILURE_REASONS)[number]

/** The own property carrying the reason. Named so it cannot collide with an SDK field. */
export const MCP_FAILURE_REASON_KEY = 'mcpFailureReason' as const

export interface McpFailureError extends Error {
  [MCP_FAILURE_REASON_KEY]: McpFailureReason
}

export function createMcpFailure(reason: McpFailureReason, message: string): McpFailureError {
  return Object.assign(new Error(message), { [MCP_FAILURE_REASON_KEY]: reason })
}

/**
 * Reads the reason off anything.
 *
 * Returns `undefined` rather than a default, because "we do not know" and "the tool failed" lead
 * to different UI: one is a retry prompt, the other is the tool's own error worth showing.
 */
export function readMcpFailureReason(error: unknown): McpFailureReason | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = (error as Record<string, unknown>)[MCP_FAILURE_REASON_KEY]
  return (MCP_FAILURE_REASONS as readonly string[]).includes(value as string)
    ? (value as McpFailureReason)
    : undefined
}

export function isMcpServerUnavailable(error: unknown): boolean {
  return readMcpFailureReason(error) === 'server-unavailable'
}
