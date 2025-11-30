import type {
  MarketPlugin,
  MarketProviderDefinition,
  MarketProviderListOptions,
  MarketProviderTrustLevel,
} from '@talex-touch/utils/market'
import type {
  MarketHttpRequestOptions,
  MarketHttpResponse,
} from '@talex-touch/utils/market'
import { marketHttpRequest } from '../market-http-client'

export interface MarketProviderContext {
  request<T = unknown>(
    options: MarketHttpRequestOptions,
  ): Promise<MarketHttpResponse<T>>
  logger?: Console
}

export abstract class BaseMarketProvider {
  protected readonly definition: MarketProviderDefinition
  protected readonly ctx: MarketProviderContext

  constructor(definition: MarketProviderDefinition, ctx: MarketProviderContext) {
    this.definition = definition
    this.ctx = ctx
  }

  get id(): string {
    return this.definition.id
  }

  get trustLevel(): MarketProviderTrustLevel {
    return this.definition.trustLevel ?? 'unverified'
  }

  protected get isTrusted(): boolean {
    return this.trustLevel === 'official' || this.trustLevel === 'verified'
  }

  protected async request<T = unknown>(
    options: MarketHttpRequestOptions,
  ): Promise<MarketHttpResponse<T>> {
    if (this.ctx.request) {
      return await this.ctx.request<T>(options)
    }
    return await marketHttpRequest<T>(options)
  }

  abstract list(options: MarketProviderListOptions): Promise<MarketPlugin[]>
}
