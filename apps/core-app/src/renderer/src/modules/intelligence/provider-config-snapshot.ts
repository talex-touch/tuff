import type { IntelligenceProviderConfig } from '@talex-touch/tuff-intelligence'

export function snapshotIntelligenceProviderConfig(
  provider: IntelligenceProviderConfig
): IntelligenceProviderConfig {
  return JSON.parse(JSON.stringify(provider)) as IntelligenceProviderConfig
}
