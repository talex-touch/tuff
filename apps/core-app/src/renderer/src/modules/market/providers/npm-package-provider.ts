import type { MarketPlugin, MarketProviderListOptions } from '@talex-touch/utils/market'
import { BaseMarketProvider } from './base-provider'

export class NpmPackageProvider extends BaseMarketProvider {
  async list(_options: MarketProviderListOptions = {}): Promise<MarketPlugin[]> {
    console.warn(
      `[Market] NPM provider "${this.definition.name}" is not yet implemented.`,
    )
    return []
  }
}
