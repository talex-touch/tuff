import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { CustomProvider } from './providers/custom-provider'
import { isNexusProviderConfig, NexusProvider } from './providers/nexus-provider'
import type { IntelligenceProvider } from './runtime/base-provider'

export function createCustomProvider(config: IntelligenceProviderConfig): IntelligenceProvider {
  return isNexusProviderConfig(config) ? new NexusProvider(config) : new CustomProvider(config)
}
