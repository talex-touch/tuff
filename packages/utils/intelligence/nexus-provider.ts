/**
 * Identity of the Nexus-managed AI provider.
 *
 * Shared because the two processes ask the same question for different reasons and must agree:
 * the renderer gates the official badge and the edit/delete affordances on it, while the main
 * process gates runtime provider resolution and deletion on it. They previously held
 * byte-identical private copies, so widening the rule on one side — a second managed origin, say —
 * would have left the UI offering Delete on a provider the main process refuses to delete, with
 * the user getting a silent no-op (#537).
 *
 * Deliberately a standalone file rather than part of the intelligence barrel: both processes
 * import it, and neither should have to pull in the client for a string comparison.
 */

/** The id assigned to the provider Nexus manages on the user's behalf. */
export const TUFF_NEXUS_PROVIDER_ID = 'tuff-nexus-default'

/** The `metadata.origin` marker carried by providers that Nexus owns. */
export const TUFF_NEXUS_PROVIDER_ORIGIN = 'tuff-nexus'

/**
 * Whether the given provider is managed by Nexus rather than configured by the user.
 *
 * Structural parameter on purpose: main and renderer hold different provider shapes, and both
 * only need these two fields.
 */
export function isNexusManagedProvider(provider: {
  id?: string
  metadata?: Record<string, unknown> | null
}): boolean {
  return (
    provider.id === TUFF_NEXUS_PROVIDER_ID
    || provider.metadata?.origin === TUFF_NEXUS_PROVIDER_ORIGIN
  )
}
