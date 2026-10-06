/** Client-issued correlation only; the main process independently determines its trusted owner. */
export function createTerminalCreationToken(): string {
  return globalThis.crypto.randomUUID()
}

export function terminalCreationAbortError(): Error {
  const error = new Error('Terminal creation aborted')
  error.name = 'AbortError'
  return error
}
