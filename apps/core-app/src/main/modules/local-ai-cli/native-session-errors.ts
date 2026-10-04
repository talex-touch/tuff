export function isNativeSessionMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(?:session|thread).*(?:not found|does not exist|invalid|unknown)/i.test(message)
}

/** SGR colour codes, which pi wraps its errors in when `FORCE_COLOR` reaches it. */
const ANSI_SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/**
 * pi's exit for a `--session` it has no file for: `No session found matching '<id>'`. A new session
 * has no file until pi's first reply, so a task stopped before then leaves exactly this. Kept out of
 * the check above, which Home chat shares.
 */
export function isPiSessionNotFoundError(stderr: string): boolean {
  return /\bno session found matching\b/i.test(stderr.replace(ANSI_SGR, ''))
}
