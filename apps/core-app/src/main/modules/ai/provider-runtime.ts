import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { getAuthToken } from '../auth'
import { resolveProviderCredential } from './provider-credential-runtime'
import { getVoiceAsrMetadata } from '@talex-touch/utils/intelligence/voice-asr'
import {
  isNexusManagedProvider,
  TUFF_NEXUS_PROVIDER_ID
} from '@talex-touch/utils/intelligence/nexus-provider'

export { isNexusManagedProvider, TUFF_NEXUS_PROVIDER_ID }

export function normalizeProviderForRuntime(
  provider: IntelligenceProviderConfig
): IntelligenceProviderConfig {
  return injectRuntimeCredential(projectRuntimeChannelType(provider))
}

function toNexusApiKey(token: string | null): string | undefined {
  if (!token) return undefined
  const trimmed = token.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/^Bearer\s+/i, '')
}

/**
 * The runtime's word for "executes here, needs no key".
 *
 * An on-device dictation channel is persisted as `custom`, because the credential surface only
 * accepts a channel declaring `audio.asr` when its type is custom. Routing, however, exempts a
 * provider from the API-key requirement by its type alone, so the persisted shape would leave the
 * one channel that needs no key as the only one that cannot route. Projecting it here keeps both
 * rules in one place: every persisted provider that becomes a runtime provider goes through this
 * function, and nothing downstream has to know which shape it is looking at.
 */
function projectRuntimeChannelType(
  provider: IntelligenceProviderConfig
): IntelligenceProviderConfig {
  if (provider.type !== IntelligenceProviderType.CUSTOM) return provider
  if (!provider.capabilities?.includes('audio.asr')) return provider
  if (getVoiceAsrMetadata(provider.metadata)?.protocol !== 'local-offline') return provider
  return { ...provider, type: IntelligenceProviderType.LOCAL }
}

function injectRuntimeCredential(provider: IntelligenceProviderConfig): IntelligenceProviderConfig {
  if (!isNexusManagedProvider(provider)) {
    const secureCredential = resolveProviderCredential(provider)
    const transientCredential =
      typeof provider.apiKey === 'string' && provider.apiKey.trim() ? provider.apiKey : undefined
    const credential = secureCredential ?? transientCredential
    if (!credential || credential === provider.apiKey) return provider
    return {
      ...provider,
      apiKey: credential
    }
  }

  const authToken = toNexusApiKey(getAuthToken())
  const capabilities = provider.capabilities?.includes('audio.asr')
    ? provider.capabilities
    : [...(provider.capabilities ?? []), 'audio.asr']
  return {
    ...provider,
    apiKey: authToken || provider.apiKey || 'guest',
    capabilities,
    metadata: {
      ...(provider.metadata || {}),
      origin: 'tuff-nexus',
      voiceAsr: { protocol: 'nexus-pack' },
      tokenInjected: Boolean(authToken),
      tokenMode: authToken ? 'auth' : 'guest'
    }
  }
}
