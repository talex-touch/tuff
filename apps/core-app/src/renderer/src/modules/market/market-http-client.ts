import type { MarketHttpRequestOptions, MarketHttpResponse } from '@talex-touch/utils/market'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createMarketSdk } from '@talex-touch/utils/transport/sdk/domains/market'

const marketSdk = createMarketSdk(useTuffTransport())

export async function marketHttpRequest<T = unknown>(
  options: MarketHttpRequestOptions
): Promise<MarketHttpResponse<T>> {
  return (await marketSdk.httpRequest<T>(options)) as MarketHttpResponse<T>
}
