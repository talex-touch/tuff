/**
 * What the app's own renderer may learn about an AI configuration import that failed.
 *
 * The orchestrator channels answer through `safeApiHandler`, which hides every failure behind one
 * public sentence so an internal message never reaches a page by accident. An import fails for a
 * handful of reasons the settings pages must tell apart, though — the MCP page asks the user to
 * confirm moving credentials, explains that a server needs re-authentication, or re-reads a file
 * that changed under it — and "The operation failed. Please retry." serves none of them. This maps
 * exactly those reasons to stable codes. Everything else stays the public sentence.
 *
 * A code is the whole message, never a code plus the original text: the original names files and
 * servers, and the renderer already knows which server it asked for. `assertApiResponse` turns a
 * bare code message into `error.code`, so the page reads it without parsing.
 */

import type { ApiErrorProjection } from '../../utils/safe-handler'

/** The selected servers carry credentials the secure store does not hold yet; ask, then retry. */
export const AI_IMPORT_SECRET_CONFIRMATION_REQUIRED = 'AI_IMPORT_SECRET_CONFIRMATION_REQUIRED'
/** A selected server authenticates in a way an imported copy cannot replay (OAuth, a token flag). */
export const MCP_SERVER_REAUTH_REQUIRED = 'MCP_SERVER_REAUTH_REQUIRED'
/** The configuration file changed between the scan and the import; scan again, then retry. */
export const AI_IMPORT_SOURCE_CHANGED = 'AI_IMPORT_SOURCE_CHANGED'
/** Credentials would have to move, and this machine has no secure store to move them into. */
export const AI_IMPORT_SECURE_STORE_UNAVAILABLE = 'AI_IMPORT_SECURE_STORE_UNAVAILABLE'

export type AiImportFailureCode =
  | typeof AI_IMPORT_SECRET_CONFIRMATION_REQUIRED
  | typeof MCP_SERVER_REAUTH_REQUIRED
  | typeof AI_IMPORT_SOURCE_CHANGED
  | typeof AI_IMPORT_SECURE_STORE_UNAVAILABLE

/**
 * Matched against the messages the import path throws (`ai-import-runtime.ts`,
 * `ai-cli-import-service.ts`, `ai-orchestrator-store.ts`); the tests pin each one to its code so a
 * reworded throw cannot quietly fall back to the public sentence.
 */
const RULES: ReadonlyArray<{ code: AiImportFailureCode; retryable: boolean; test: RegExp }> = [
  { code: MCP_SERVER_REAUTH_REQUIRED, retryable: false, test: /^MCP_SERVER_REAUTH_REQUIRED\b/ },
  {
    code: AI_IMPORT_SECRET_CONFIRMATION_REQUIRED,
    retryable: true,
    test: /\brequires secret migration confirmation\b/
  },
  {
    code: AI_IMPORT_SOURCE_CHANGED,
    retryable: true,
    test: /\bchanged (?:after preview|its canonical path after preview|while it was being imported)\b|^Import candidate \S+ is stale$|^Import selection contains stale, blocked, or missing candidates$/
  },
  {
    code: AI_IMPORT_SECURE_STORE_UNAVAILABLE,
    retryable: false,
    test: /^Secure storage is unavailable for AI configuration import$/
  }
]

/** The stable code for an import failure the settings pages act on, or `undefined`. */
export function aiImportFailureCode(error: unknown): AiImportFailureCode | undefined {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!message) return undefined
  return RULES.find((rule) => rule.test.test(message))?.code
}

/**
 * `projectError` for the import channel. A failure outside the table gets no projection, which
 * leaves `safeApiHandler`'s public sentence in place.
 */
export function projectAiImportError(error: unknown): ApiErrorProjection | undefined {
  const code = aiImportFailureCode(error)
  if (!code) return undefined
  const rule = RULES.find((candidate) => candidate.code === code)!
  return { error: code, code, retryable: rule.retryable }
}
