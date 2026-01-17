import type { MarketProviderDefinition } from '@talex-touch/utils/market'
import type { BaseMarketProvider, MarketProviderContext } from './providers/base-provider'
import { NexusStoreProvider } from './providers/nexus-store-provider'
import { NpmPackageProvider } from './providers/npm-package-provider'
import { RepositoryProvider } from './providers/repository-provider'
import { TpexApiProvider } from './providers/tpex-api-provider'

export function createMarketProvider(
  definition: MarketProviderDefinition,
  ctx: MarketProviderContext
): BaseMarketProvider | null {
  switch (definition.type) {
    case 'nexusStore':
      return new NexusStoreProvider(definition, ctx)
    case 'repository':
      return new RepositoryProvider(definition, ctx)
    case 'npmPackage':
      return new NpmPackageProvider(definition, ctx)
    case 'tpexApi':
      return new TpexApiProvider(definition, ctx)
    default:
      console.warn(
        `[Market] Unsupported provider type "${definition.type}" for "${definition.name}".`
      )
      return null
  }
}
