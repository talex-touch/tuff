import type { MarketPlugin, MarketProviderListOptions } from '@talex-touch/utils/market'
import { BaseMarketProvider } from './base-provider'

export class RepositoryProvider extends BaseMarketProvider {
  async list(_options: MarketProviderListOptions = {}): Promise<MarketPlugin[]> {
    console.warn(
      `[Market] Repository provider "${this.definition.name}" is not yet implemented.`,
    )
    return []
  }
}
