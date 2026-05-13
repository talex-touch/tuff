import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { getAuthToken } from '../auth'
import { isNexusManagedProvider, TUFF_NEXUS_PROVIDER_ID } from './provider-runtime-shared'

export { isNexusManagedProvider, TUFF_NEXUS_PROVIDER_ID }

function toNexusApiKey(token: string | null): string | undefined {
  if (!token) return undefined
  const trimmed = token.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/^Bearer\s+/i, '')
}

export function normalizeProviderForRuntime(
  provider: IntelligenceProviderConfig
): IntelligenceProviderConfig {
  if (!isNexusManagedProvider(provider)) {
    return provider
  }

  const authToken = toNexusApiKey(getAuthToken())
  return {
    ...provider,
    enabled: true,
    apiKey: authToken || provider.apiKey || 'guest',
    metadata: {
      ...(provider.metadata || {}),
      origin: 'tuff-nexus',
      tokenInjected: Boolean(authToken),
      tokenMode: authToken ? 'auth' : 'guest'
    }
  }
}
