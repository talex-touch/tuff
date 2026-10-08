/**
 * What the local-resource settings pages (skills, MCP) have in common when they report a failure.
 */

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
