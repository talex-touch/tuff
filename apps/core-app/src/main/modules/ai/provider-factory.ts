import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'
import { CustomProvider } from './providers/custom-provider'
import { LocalProvider } from './providers/local-provider'
import { isNexusProviderConfig, NexusProvider } from './providers/nexus-provider'
import { PiCliProvider } from './providers/pi-cli-provider'
import { isPiCliProviderConfig } from './providers/pi-cli-runtime'
import type { IntelligenceProvider } from './runtime/base-provider'

export function createCustomProvider(config: IntelligenceProviderConfig): IntelligenceProvider {
  return isNexusProviderConfig(config) ? new NexusProvider(config) : new CustomProvider(config)
}

/**
 * Both local backends register under `IntelligenceProviderType.LOCAL`, so the concrete class is
 * picked by config identity — the same way `createCustomProvider` chooses between Nexus and Custom.
 * A dedicated provider type would mean changing the `@talex-touch/tuff-intelligence` enum and every
 * exhaustive list built from it.
 */
export function createLocalProvider(config: IntelligenceProviderConfig): IntelligenceProvider {
  return isPiCliProviderConfig(config) ? new PiCliProvider(config) : new LocalProvider(config)
}
