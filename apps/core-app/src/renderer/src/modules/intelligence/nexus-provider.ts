export const TUFF_NEXUS_PROVIDER_ID = 'tuff-nexus-default'

export function isNexusManagedProvider(provider: {
  id?: string
  metadata?: Record<string, unknown> | null
}): boolean {
  return provider.id === TUFF_NEXUS_PROVIDER_ID || provider.metadata?.origin === 'tuff-nexus'
}
