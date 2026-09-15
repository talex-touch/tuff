export function isNativeSessionMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(?:session|thread).*(?:not found|does not exist|invalid|unknown)/i.test(message)
}
